import {z} from 'zod';
import {emptyWorld, applyCommands, commandSchema, eventLabel, type Command} from './domain.ts';
import {currentWeather, searchLocations} from './weather-service.ts';
import type {GroveDatabase} from './database.ts';

const reply = (body: unknown, status = 200) => Response.json(body, {status, headers: {'Cache-Control': 'no-store'}});
const unavailable = () => reply({error: 'Cloud storage is temporarily unavailable. Your content draft stays on this device.'}, 503);
const inputSchema = z.object({revision: z.number().int().nonnegative().max(2147483646), commands: z.array(commandSchema).min(1).max(100)});

export async function getWorld(owner: string | null, db: GroveDatabase | undefined) {
  if (!owner) return reply({error: 'Sign-in is required.'}, 401);
  if (!db) return unavailable();
  try {
    const row = await db.prepare('SELECT data_json, revision, updated_at FROM worlds WHERE owner_id = ?').bind(owner).first<{data_json: string; revision: number; updated_at: string}>();
    return reply({world: row ? JSON.parse(row.data_json) : emptyWorld(), revision: row?.revision ?? 0, updatedAt: row?.updated_at ?? null});
  } catch {return unavailable();}
}

export async function postWorld(request: Request, owner: string | null, db: GroveDatabase | undefined) {
  if (!owner) return reply({error: 'Sign-in is required.'}, 401);
  const origin = request.headers.get('origin');
  if (origin && origin !== new URL(request.url).origin) return reply({error: 'This request is not allowed.'}, 403);
  if (!request.headers.get('content-type')?.includes('application/json')) return reply({error: 'JSON format is required.'}, 415);
  const text = await request.text();
  if (new TextEncoder().encode(text).length > 2000000) return reply({error: 'A request must be smaller than 2 MB.'}, 413);
  let input: z.infer<typeof inputSchema>;
  try {input = inputSchema.parse(JSON.parse(text));} catch {return reply({error: 'Check the format of your input.'}, 400);}
  if (!db) return unavailable();
  let row: {data_json: string; revision: number} | null;
  try {row = await db.prepare('SELECT data_json, revision FROM worlds WHERE owner_id = ?').bind(owner).first();} catch {return unavailable();}
  if ((row?.revision ?? 0) !== input.revision) return reply({error: 'Your world changed in another view. Reload the latest version and save your draft again.'}, 409);
  const now = new Date().toISOString();
  let world;
  try {world = applyCommands(row ? JSON.parse(row.data_json) : emptyWorld(), input.commands, now);} catch (e) {return reply({error: e instanceof Error ? e.message : 'Could not save your changes.'}, 400);}
  const data = JSON.stringify(world);
  if (new TextEncoder().encode(data).length > 1500000) return reply({error: 'Your grove reached its 1.5 MB storage limit. Export a backup and organize your saved thoughts.'}, 413);
  const revision = input.revision + 1, events = JSON.stringify(input.commands), label = eventLabel(input.commands);
  try {
    if (db.saveWorld) await db.saveWorld({owner, revision: input.revision, world: data, events, at: now, label});
    else await db.batch([
      db.prepare('INSERT INTO world_events (owner_id, revision, event_json, occurred_at, label) VALUES (?, ?, ?, ?, ?)').bind(owner, revision, events, now, label),
      db.prepare('INSERT INTO worlds (owner_id, data_json, revision, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(owner_id) DO UPDATE SET data_json=excluded.data_json, revision=excluded.revision, updated_at=excluded.updated_at WHERE worlds.revision = ?').bind(owner, data, revision, now, input.revision),
    ]);
  } catch (e) {
    if ((typeof e === 'object' && e !== null && 'code' in e && e.code === '23505') || String(e).includes('UNIQUE constraint')) return reply({error: 'A concurrent save was detected. Reload the latest version and save your draft again.'}, 409);
    return reply({error: 'Could not save. Your draft is retained. Please try again.'}, 503);
  }
  return reply({world, revision, updatedAt: now});
}

export async function getHistory(request: Request, owner: string | null, db: GroveDatabase | undefined) {
  if (!owner) return reply({error: 'Sign-in is required.'}, 401);
  if (!db) return unavailable();
  const param = new URL(request.url).searchParams.get('revision');
  try {
    if (param === null) {
      const result = await db.prepare('SELECT revision, occurred_at AS "occurredAt", label FROM world_events WHERE owner_id = ? ORDER BY revision').bind(owner).all();
      return reply({events: result.results});
    }
    const revision = Number(param);
    if (!Number.isSafeInteger(revision) || revision < 0 || !param.trim()) return reply({error: 'Invalid history revision.'}, 400);
    const result = await db.prepare('SELECT revision, event_json, occurred_at FROM world_events WHERE owner_id = ? AND revision <= ? ORDER BY revision').bind(owner, revision).all<{revision: number; event_json: string; occurred_at: string}>();
    let w = emptyWorld();
    for (const e of result.results) w = applyCommands(w, JSON.parse(e.event_json) as Command[], e.occurred_at);
    if (revision > 0 && result.results.at(-1)?.revision !== revision) return reply({error: 'This moment was not found.'}, 404);
    return reply({world: w, revision});
  } catch {return unavailable();}
}

export async function getWeather(request: Request, owner: string | null) {
  if (!owner) return reply({error: 'Sign in to sync the sky with local weather.'}, 401);
  const params = new URL(request.url).searchParams, lat = params.get('lat'), lon = params.get('lon');
  if (!lat?.trim() || !lon?.trim() || !Number.isFinite(Number(lat)) || !Number.isFinite(Number(lon)) || Math.abs(Number(lat)) > 90 || Math.abs(Number(lon)) > 180) return reply({error: 'Choose a valid weather location.'}, 400);
  try {return reply({weather: await currentWeather(Number(lat), Number(lon))});} catch {return reply({error: 'Weather is temporarily unavailable. Try again shortly.'}, 503);}
}
export async function getWeatherLocations(request: Request, owner: string | null) {
  if (!owner) return reply({error: 'Sign in to choose a weather location.'}, 401);
  const query = new URL(request.url).searchParams.get('q')?.trim();
  if (!query || query.length < 2 || query.length > 80) return reply({error: 'Enter a city name between 2 and 80 characters.'}, 400);
  try {return reply({locations: await searchLocations(query)});} catch {return reply({error: 'Location search is temporarily unavailable.'}, 503);}
}
