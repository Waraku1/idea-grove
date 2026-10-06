import test from 'node:test';
import assert from 'node:assert/strict';
import {readdirSync} from 'node:fs';
import {createRequire} from 'node:module';
import {forecastURL, parseForecast, skyState, weatherLabel, WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS} from '../lib/weather.ts';
import {currentWeather, searchLocations} from '../lib/weather-service.ts';
import {drawSky} from '../lib/sky.ts';
import {drawScene} from '../lib/scene.ts';
import {demoWorld} from '../lib/demo.ts';
import {outdoorSpawn, safeSpawn, viewPoint, clipNear, perspective} from '../lib/walk.ts';
import {buildArchitecture, roomFocus, surfaceBlocksSegment} from '../lib/architecture.ts';
const now = Date.parse('2026-10-04T03:00:00Z');
const payload = (time = now, code = 0, overrides = {}) => ({timezone: 'Asia/Tokyo', current: {time: time / 1000, temperature_2m: 23, is_day: 1, precipitation: 0, snowfall: 0, weather_code: code, cloud_cover: 20, wind_speed_10m: 5, wind_direction_10m: 140, ...overrides}, daily: {sunrise: [Date.parse('2026-10-03T21:00:00Z') / 1000], sunset: [Date.parse('2026-10-04T09:00:00Z') / 1000]}});
const snapshot = (code = 0, overrides = {}) => parseForecast(payload(now, code, overrides), 35.68, 139.76, now);

test('provider timestamps are absolute instants and sun times determine local day/night', () => {
  const w = snapshot(); assert.equal(w.observedAt, now); assert.equal(w.timezone, 'Asia/Tokyo'); assert.equal(skyState(w, now).isDay, true); assert.equal(skyState(w, now).dayProgress, .5);
  const evening = Date.parse('2026-10-04T09:01:00Z'), night = parseForecast(payload(evening, 0, {is_day: 1}), 35.68, 139.76, evening);
  assert.equal(skyState(night, evening).isDay, false); assert.equal(skyState(night, evening).label, 'Clear night');
  assert.equal(skyState(null, now, 'America/Los_Angeles').isDay, false); assert.equal(skyState(null, now, 'Asia/Tokyo').isDay, true);
});

test('all rain, drizzle, snow and storm codes drive their intended sky states', () => {
  for (const code of [51,53,55,56,57,61,63,65,66,67,80,81,82,95,96,99]) {const state = skyState(snapshot(code), now); assert.ok(state.rain > 0); assert.equal(state.snow, 0); assert.ok(state.clouds >= .65);}
  for (const code of [71,73,75,77,85,86]) {const state = skyState(snapshot(code, {precipitation: 2, snowfall: .5}), now); assert.ok(state.snow > 0); assert.equal(state.rain, 0); assert.equal(state.label, 'Snow');}
  assert.equal(weatherLabel(snapshot(95)), 'Thunderstorms'); assert.equal(weatherLabel(snapshot(45)), 'Fog'); assert.equal(weatherLabel(snapshot(3)), 'Overcast'); assert.equal(weatherLabel(snapshot(2)), 'Partly cloudy');
  assert.equal(skyState(snapshot(0, {precipitation: 1}), now).rain > 0, true);
});

test('stale, missing or malformed weather does not pretend to be a current forecast', () => {
  assert.throws(() => parseForecast(payload(now - WEATHER_MAX_AGE_MS - 1), 0, 0, now));
  assert.throws(() => parseForecast(payload(now + 31 * 60000), 0, 0, now));
  assert.throws(() => parseForecast({...payload(), timezone: 'Invalid/Zone'}, 0, 0, now));
  assert.throws(() => parseForecast(payload(now, 0, {cloud_cover: NaN}), 0, 0, now));
  const stale = skyState(snapshot(65, {precipitation: 3}), now + WEATHER_MAX_AGE_MS + 1); assert.equal(stale.available, false); assert.equal(stale.rain, 0); assert.equal(stale.label, 'Time of day only');
});

test('weather requests use rounded coordinates and coalesce refreshes until cache expiry', async () => {
  let calls = 0, clock = now; const fetcher = async url => {calls++; assert.equal(url.hostname, 'api.open-meteo.com'); assert.equal(url.searchParams.get('latitude'), '12.35'); assert.equal(url.searchParams.get('longitude'), '34.57'); assert.equal(url.searchParams.get('timeformat'), 'unixtime'); return Response.json(payload(clock));};
  const [a, b] = await Promise.all([currentWeather(12.346, 34.566, fetcher, clock), currentWeather(12.349, 34.569, fetcher, clock)]); assert.equal(calls, 1); assert.equal(a, b); assert.equal(a.latitude, 12.35);
  await currentWeather(12.35, 34.57, fetcher, clock + WEATHER_REFRESH_MS - 1); assert.equal(calls, 1);
  clock += WEATHER_REFRESH_MS; const c = await currentWeather(12.35, 34.57, fetcher, clock); assert.equal(calls, 2); assert.equal(c.observedAt, clock);
  assert.equal(forecastURL(-0.001, 10.555).hostname, 'api.open-meteo.com');
});

test('failed provider requests are retryable and search only returns usable locations', async () => {
  await assert.rejects(currentWeather(45.45, 46.46, async () => new Response('unavailable', {status: 502}), now));
  assert.equal((await currentWeather(45.45, 46.46, async () => Response.json(payload()), now)).temperature, 23);
  const places = await searchLocations('Tokyo & Japan', async url => {assert.equal(url.hostname, 'geocoding-api.open-meteo.com'); assert.equal(url.searchParams.get('name'), 'Tokyo & Japan'); return Response.json({results: [{name: 'Tokyo', admin1: 'Tokyo', country: 'Japan', latitude: 35.678, longitude: 139.765, timezone: 'Asia/Tokyo'}, {name: 'Bad', latitude: 100, longitude: 0, timezone: 'UTC'}]});});
  assert.equal(places.length, 1); assert.equal(places[0].label, 'Tokyo, Japan'); assert.equal(places[0].latitude, 35.68);
  assert.deepEqual(await searchLocations('none', async () => Response.json({})), []);
});

function finiteContext() {
  const finite = (...numbers) => numbers.forEach(n => assert.ok(Number.isFinite(n))), fills = [], strokes = []; let path = [], ellipse = null;
  return {fills, strokes, ctx: {fillStyle: '', strokeStyle: '', lineWidth: 1, clearRect: finite, fillRect: finite, createLinearGradient: (...args) => {finite(...args); return {addColorStop() {}};}, beginPath() {path = []; ellipse = null;}, moveTo(...point) {finite(...point); path.push(point);}, lineTo(...point) {finite(...point); path.push(point);}, closePath() {}, bezierCurveTo: finite, ellipse(...point) {finite(...point); ellipse = point;}, roundRect: finite, fill() {fills.push({color: this.fillStyle, path, ellipse});}, stroke() {strokes.push({color: this.strokeStyle, path, width: this.lineWidth}); finite(this.lineWidth);}, measureText: text => ({width: text.length * 6}), fillText: (_text, x, y) => finite(x, y)}};
}

test('stars appear at night and clear daytime skies contain a stylized sun', () => {
  const day = finiteContext(), night = finiteContext(), nightTime = Date.parse('2026-10-04T13:00:00Z'), nightWeather = parseForecast(payload(nightTime, 0, {is_day: 0, cloud_cover: 0}), 35.68, 139.76, nightTime);
  drawSky(day.ctx, 1200, 800, -.5, .6, null, {weather: snapshot(0, {cloud_cover: 0}), now}); drawSky(night.ctx, 1200, 800, -.5, .6, null, {weather: nightWeather, now: nightTime});
  assert.equal(day.fills.some(f => String(f.color).startsWith('rgba(248,241,210,')), false); assert.ok(night.fills.filter(f => String(f.color).startsWith('rgba(248,241,210,')).length > 40); assert.ok(day.fills.some(f => String(f.color).startsWith('rgba(236,208,142,')));
});

test('animated and still skies render finite geometry in portrait, overview and first-person interiors', () => {
  const w = demoWorld(); for (const code of [0, 3, 65, 75]) for (const room of [null, w.rooms[0], w.rooms.find(r => r.kind === 'house')]) for (const motion of [false, true]) {
    const ctx = finiteContext(); for (const pose of [null, room ? safeSpawn(w, room) : outdoorSpawn(), {x: 0, z: 2, yaw: 2, pitch: 1.1}]) drawScene(ctx.ctx, w, 390, 750, {yaw: -.45, pitch: .55, zoom: 1}, room, false, null, pose, {weather: snapshot(code), now, motion});
  }
});

test('roofs shelter the interior and rain through windows never paints over the ceiling', () => {
  const w = demoWorld(), model = buildArchitecture(w), house = w.rooms.find(r => r.kind === 'house');
  for (const room of [w.rooms[0], house]) {const focus = roomFocus(room); assert.equal(model.roofs.some(roof => surfaceBlocksSegment(roof.points, [focus.x, 1.65, focus.z], [focus.x, 10, focus.z])), true);}
  const pose = safeSpawn(w, house); pose.yaw = Math.atan2(-pose.x, -pose.z); const capture = finiteContext(); drawScene(capture.ctx, w, 1200, 800, {yaw: -.45, pitch: .55, zoom: 1}, house, false, null, pose, {weather: snapshot(63, {precipitation: 2, cloud_cover: 90}), now, motion: false});
  const ceiling = model.roofs.filter(roof => roof.roomIds.includes(house.id)).map(roof => clipNear(roof.points.map(p => viewPoint(p, pose))).map(p => perspective(p, 1200, 800)));
  const inside = (x, y, points) => {let hit = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) {const a = points[i], b = points[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) hit = !hit;} return hit;};
  const rain = capture.strokes.filter(s => s.color === 'rgba(101,142,137,.28)').map(s => [(s.path[0][0] + s.path[1][0]) / 2, (s.path[0][1] + s.path[1][1]) / 2]).filter(([x, y]) => x > 0 && x < 1200 && y > 0 && y < 800);
  assert.ok(rain.length > 0, 'The weather outside should remain visible through the window.'); for (const [x, y] of rain) assert.equal(ceiling.some(points => inside(x, y, points)), false, `Rain at ${x}, ${y} crossed the opaque ceiling.`);
});

test('weather endpoints require identity, validate input and do not expose upstream errors', async () => {
  const require = createRequire(import.meta.url), esbuildDir = readdirSync('node_modules/.pnpm').find(n => n.startsWith('esbuild@')), {build} = require(`../node_modules/.pnpm/${esbuildDir}/node_modules/esbuild/lib/main.js`);
  const load = async entry => {const bundle = await build({entryPoints: [entry], bundle: true, write: false, platform: 'node', format: 'esm', plugins: [{name: 'weather-auth', setup(b) {b.onResolve({filter: /chatgpt-auth$/}, () => ({path: 'auth', namespace: 'mock'})); b.onLoad({filter: /.*/, namespace: 'mock'}, () => ({contents: 'export async function getChatGPTUser(){return globalThis.__weatherUser;}', loader: 'js'}));}}]}); return import('data:text/javascript;base64,' + Buffer.from(bundle.outputFiles[0].text).toString('base64'));};
  const weather = await load('app/api/weather/route.ts'), locations = await load('app/api/weather/locations/route.ts'), original = globalThis.fetch;
  try {
    globalThis.__weatherUser = null; assert.equal((await weather.GET(new Request('https://grove.example/api/weather?lat=1&lon=2'))).status, 401); assert.equal((await locations.GET(new Request('https://grove.example/api/weather/locations?q=Tokyo'))).status, 401);
    globalThis.__weatherUser = {userId: 'owner'};
    for (const query of ['', '?lat=&lon=1', '?lat=NaN&lon=2', '?lat=91&lon=2', '?lat=1&lon=-181']) assert.equal((await weather.GET(new Request('https://grove.example/api/weather' + query))).status, 400);
    assert.equal((await locations.GET(new Request('https://grove.example/api/weather/locations?q=x'))).status, 400);
    globalThis.fetch = async url => {assert.equal(url.hostname, 'api.open-meteo.com'); return Response.json(payload(Date.now()));};
    const good = await weather.GET(new Request('https://grove.example/api/weather?lat=1.12&lon=2.23')); assert.equal(good.status, 200); assert.equal(good.headers.get('Cache-Control'), 'no-store'); assert.equal((await good.json()).weather.latitude, 1.12);
    globalThis.fetch = async () => {throw new Error('sensitive upstream internal details');};
    const bad = await weather.GET(new Request('https://grove.example/api/weather?lat=4&lon=5')); assert.equal(bad.status, 503); assert.equal(JSON.stringify(await bad.json()).includes('sensitive'), false);
    assert.equal((await locations.GET(new Request('https://grove.example/api/weather/locations?q=Tokyo'))).status, 503);
  } finally {globalThis.fetch = original; delete globalThis.__weatherUser;}
});
