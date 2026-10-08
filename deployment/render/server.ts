import {createServer, type IncomingMessage} from 'node:http';
import {readFile, realpath} from 'node:fs/promises';
import {resolve, sep, extname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {handlePublicRequest, type PublicEnv} from '../auth.ts';
import {getWorld, postWorld, getHistory, getWeather, getWeatherLocations} from '../../lib/api-handlers.ts';
import {createNeonDatabase, validateDatabaseURL} from './database.ts';
import type {GroveDatabase} from '../../lib/database.ts';

export function validateRenderOrigin(value: string | undefined) {
  try {
    const u = new URL(value ?? '');
    if (u.protocol !== 'https:' || !/^[a-z0-9][a-z0-9-]*\.onrender\.com$/.test(u.hostname) || u.username || u.password || u.port || u.pathname !== '/' || u.search || u.hash) throw new Error();
    return u.origin;
  } catch {throw new Error('A real HTTPS onrender.com origin is required.');}
}
export function renderEnvironment(source: Record<string, string | undefined> = process.env): PublicEnv {
  const origin = validateRenderOrigin(source.PUBLIC_ORIGIN || source.RENDER_EXTERNAL_URL);
  for (const name of ['GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'SESSION_SECRET', 'OWNER_GITHUB_ID']) if (!source[name] || /REPLACE|PLACEHOLDER/.test(source[name]!)) throw new Error('Complete the private authentication configuration.');
  if (source.SESSION_SECRET!.length < 43 || !/^[1-9]\d{0,19}$/.test(source.OWNER_GITHUB_ID!)) throw new Error('Invalid session or owner configuration.');
  if (!['true', 'false'].includes(source.APP_READ_ONLY ?? 'true')) throw new Error('APP_READ_ONLY must be true or false.');
  return {PUBLIC_ORIGIN: origin, GITHUB_CLIENT_ID: source.GITHUB_CLIENT_ID, GITHUB_CLIENT_SECRET: source.GITHUB_CLIENT_SECRET, SESSION_SECRET: source.SESSION_SECRET, OWNER_GITHUB_ID: source.OWNER_GITHUB_ID, APP_READ_ONLY: source.APP_READ_ONLY ?? 'true', APP_VERSION: '0.6', HOSTING_PROVIDER: 'render', DB: createNeonDatabase(validateDatabaseURL(source.DATABASE_URL))};
}

const types: Record<string, string> = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.ico':'image/x-icon','.woff2':'font/woff2','.woff':'font/woff'};
const missing = () => new Response('Not found.', {status:404, headers:{'Content-Type':'text/plain; charset=utf-8','Cache-Control':'no-store'}});
async function asset(request: Request, directory: string, relative: string, immutable: boolean): Promise<Response> {
  if (!['GET', 'HEAD'].includes(request.method)) return new Response('Method not allowed.', {status:405, headers:{Allow:'GET, HEAD'}});
  if (relative.split(/[\\/]/).some(part => part === '..' || part === '.' || part.includes('\0')) || !types[extname(relative)]) return missing();
  try {
    const root = await realpath(directory), plain = await realpath(resolve(root, relative));
    if (!plain.startsWith(root + sep) || plain !== resolve(root, relative)) return missing();
    // Keep the recovered module runtime uncompressed. The normal asset pipeline
    // remains compressed, while these two large modules are loaded by native dynamic
    // import() during the recovery bootstrap.
    let file = plain, encoding = '';
    const runtimeModule = relative === 'assets/framework-D_rUT4EX.js' || relative === 'assets/grove-BWXu0UId.js';
    if (!runtimeModule) {
      const accept = request.headers.get('accept-encoding') ?? '';
      for (const [name, suffix] of [['br', '.br'], ['gzip', '.gz']]) if (new RegExp('(?:^|,)\\s*' + name + '(?:\\s*,|\\s*$)').test(accept)) {
        try {
          const compressed = await realpath(plain + suffix);
          if (compressed === plain + suffix) {file = compressed; encoding = name; break;}
        } catch {}
      }
    }
    const data = await readFile(file), headers = new Headers({'Content-Type':types[extname(relative)],'Cache-Control':immutable ? 'public, max-age=31536000, immutable' : 'private, no-store','Vary':'Accept-Encoding','Content-Length':String(data.length)});
    if (encoding) headers.set('Content-Encoding', encoding);
    return new Response(request.method === 'HEAD' ? null : new Uint8Array(data).buffer, {headers});
  } catch {return missing();}
}
const defaultAssets = fileURLToPath(new URL('../../dist/render/client/', import.meta.url));

/** Every public API passes through the signed-cookie gateway before dispatch. */
export async function handleRenderRequest(request: Request, env: PublicEnv, directory = defaultAssets): Promise<Response> {
  return handlePublicRequest(request, env, async authenticated => {
    const url = new URL(authenticated.url), path = url.pathname, owner = authenticated.headers.get('oai-authenticated-user-id');
    if (path === '/api/world') {
      if (authenticated.method === 'GET') return getWorld(owner, env.DB);
      if (authenticated.method === 'POST') return postWorld(authenticated, owner, env.DB);
    } else if (authenticated.method === 'GET') {
      if (path === '/api/history') return getHistory(authenticated, owner, env.DB);
      if (path === '/api/weather') return getWeather(authenticated, owner);
      if (path === '/api/weather/locations') return getWeatherLocations(authenticated, owner);
    }
    if (path.startsWith('/api/')) return Response.json({error:'Method or endpoint not available.'}, {status:path === '/api/world' || ['/api/history','/api/weather','/api/weather/locations'].includes(path) ? 405 : 404});
    if (['/', '/privacy', '/terms'].includes(path)) return asset(authenticated, directory, 'index.html', false);
    if (path === '/favicon.svg') return asset(authenticated, directory, 'favicon.svg', false);
    if (path.startsWith('/assets/')) {
      let relative: string;
      try {relative = decodeURIComponent(path.slice(1));} catch {return missing();}
      return asset(authenticated, directory, relative, true);
    }
    return missing();
  });
}

async function body(message: IncomingMessage) {
  return new Promise<Uint8Array<ArrayBuffer>>((resolveBody, reject) => {
    const chunks: Buffer[] = []; let size = 0, rejected = false;
    message.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > 2000000) {if (!rejected) {rejected = true; chunks.length = 0; reject(new Error('Request too large.'));} return;}
      if (!rejected) chunks.push(chunk);
    });
    message.on('end', () => {if (!rejected) resolveBody(new Uint8Array(Buffer.concat(chunks)));});
    message.on('error', () => reject(new Error('Could not read request.')));
    message.on('aborted', () => reject(new Error('Request ended.')));
  });
}
export async function verifyRenderDatabase(db: GroveDatabase | undefined) {
  try {
    const status = await db?.prepare(`SELECT
      (SELECT count(*)::int FROM information_schema.columns WHERE table_schema = 'public' AND (
        (table_name = 'worlds' AND column_name IN ('owner_id','data_json','revision','updated_at')) OR
        (table_name = 'world_events' AND column_name IN ('owner_id','revision','event_json','occurred_at','label')) OR
        (table_name = 'account_erasures' AND column_name IN ('owner_id','erased_at')))) AS columns,
      to_regprocedure('public.grove_save(text,integer,text,text,text,text)') IS NOT NULL AS saves,
      to_regprocedure('public.grove_erase(text,text)') IS NOT NULL AS erases`).first<{columns:number;saves:boolean;erases:boolean}>();
    if (status?.columns === 11 && status.saves === true && status.erases === true) return;
  } catch {}
  throw new Error('The private database is unavailable or its schema is incomplete.');
}
export async function startRenderServer(env = renderEnvironment()) {
  // One startup check; health polling never wakes the sleeping database.
  await verifyRenderDatabase(env.DB);
  const publicURL = new URL(env.PUBLIC_ORIGIN!);
  let active = 0;
  const server = createServer(async (incoming, outgoing) => {
    const send = async (response: Response) => {
      outgoing.statusCode = response.status;
      for (const [name, value] of response.headers) if (name !== 'set-cookie') outgoing.setHeader(name, value);
      const cookies = response.headers.getSetCookie(); if (cookies.length) outgoing.setHeader('Set-Cookie', cookies);
      outgoing.end(incoming.method === 'HEAD' ? undefined : Buffer.from(await response.arrayBuffer()));
    };
    const rawPath = incoming.url ?? '/';
    if (!rawPath.startsWith('/') || rawPath.startsWith('//') || (incoming.headers.host?.toLowerCase() !== publicURL.host && rawPath !== '/healthz')) return send(new Response('This hostname is not enabled.', {status:421}));
    if (active >= 32) {incoming.resume(); return send(new Response('Please try again shortly.', {status:503, headers:{'Retry-After':'30'}}));}
    active++;
    try {
      const headers = new Headers();
      for (const [name, value] of Object.entries(incoming.headers)) if (value !== undefined) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
      const method = incoming.method ?? 'GET';
      const payload = ['GET', 'HEAD'].includes(method) ? undefined : await body(incoming);
      const request = new Request(publicURL.origin + rawPath, {method, headers, body: payload?.byteLength ? payload.buffer : undefined});
      await send(await handleRenderRequest(request, env));
    } catch (e) {
      if (!outgoing.headersSent) await send(Response.json({error: e instanceof Error && e.message === 'Request too large.' ? 'A request must be smaller than 2 MB.' : 'The service is temporarily unavailable.'}, {status: e instanceof Error && e.message === 'Request too large.' ? 413 : 503, headers:{'Cache-Control':'no-store'}}));
      else outgoing.end();
    } finally {active--;}
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000; server.keepAliveTimeout = 5000;
  const port = Number(process.env.PORT ?? 10000);
  if (!Number.isInteger(port) || port < 1024 || port > 65535 || [18012,18013,19099].includes(port)) throw new Error('Invalid HTTP port.');
  server.listen(port, '0.0.0.0', () => console.log('Idea Grove 0.6 started.'));
  process.once('SIGTERM', () => {server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 8000).unref();});
  return server;
}
