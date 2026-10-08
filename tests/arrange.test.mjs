import test from 'node:test';
import assert from 'node:assert/strict';
import {applyCommands, commandSchema, emptyWorld, statistics, validateWorld} from '../lib/domain.ts';
import {demoWorld} from '../lib/demo.ts';
import {containsRoomPoint, furnitureFrame, furniturePoint} from '../lib/architecture.ts';
import {furnitureCoordinates, framesOverlap, houseCoordinates, intersectPlane, newFurniturePosition, overviewBasis, overviewRay, placementCoordinates, placementDragPlane, placementPoint, pointToFurniture, previewMove} from '../lib/arrange.ts';
import {drawScene} from '../lib/scene.ts';
const now = '2026-10-04T12:00:00.000Z';
const close = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) < tolerance, `${a} != ${b}`);

test('moving furniture, houses and placements preserves thought identity, content, tags and counts', () => {
  const w = demoWorld(), f = w.furniture[0], p = w.placements.find(p => p.furnitureId === f.id), r = w.rooms.find(r => r.kind === 'house');
  const commands = [{type: 'furniture.move', id: f.id, x: 1.25, z: -2}, {type: 'room.move', id: r.id, x: 25, z: 30}, {type: 'placement.move', id: p.id, position: {u: .35, v: 1}}];
  const moved = applyCommands(w, commands, now);
  assert.deepEqual(moved.objects, w.objects); assert.deepEqual(moved.tags, w.tags); assert.equal(statistics(moved).total, statistics(w).total); assert.equal(moved.matureCount, w.matureCount);
  assert.deepEqual(moved.furniture.find(v => v.id === f.id), {...f, x: 1.25, z: -2});
  assert.deepEqual(moved.rooms.find(v => v.id === r.id), {...r, x: 25, z: 30});
  assert.deepEqual(moved.placements.find(v => v.id === p.id), {...p, position: {u: .35, v: 1}});
  assert.deepEqual(commands.reduce((state, command) => applyCommands(state, [command], now), w), moved);
  assert.deepEqual(validateWorld(JSON.parse(JSON.stringify(moved))), moved);
  assert.deepEqual(validateWorld(JSON.parse(JSON.stringify(w))), w);
});

test('fixed mansion slots, missing targets and invalid movement cannot corrupt a world', () => {
  const w = demoWorld();
  assert.throws(() => applyCommands(w, [{type: 'room.move', id: 'room-0', x: 40, z: 20}], now));
  assert.throws(() => applyCommands(w, [{type: 'furniture.move', id: 'missing', x: 0, z: 0}], now));
  assert.throws(() => applyCommands(w, [{type: 'placement.move', id: 'missing', position: {u: 0, v: 0}}], now));
  for (const value of [NaN, Infinity, 4.01, -4.01]) assert.equal(commandSchema.safeParse({type: 'furniture.move', id: w.furniture[0].id, x: value, z: 0}).success, false);
  assert.equal(commandSchema.safeParse({type: 'placement.move', id: w.placements[0].id, position: {u: 1.01, v: 0}}).success, false);
  assert.throws(() => applyCommands(w, [{type: 'room.move', id: 'house-cube', x: 1, z: 1}], now));
});

test('drag rays intersect the same floor and furniture planes used by overview projection', () => {
  let w = demoWorld(); w = applyCommands(w, [{type: 'room.merge', targetId: 'room-0', sourceId: 'room-11'}], now);
  for (const room of [null, ...w.rooms]) for (const camera of [{yaw: -.5, pitch: .6, zoom: 1}, {yaw: 1.4, pitch: .25, zoom: 1.8}]) {
    const b = overviewBasis(1200, 800, camera, room), point = [room?.kind === 'house' ? room.x : b.focus.x + 1.2, 1.35, room?.kind === 'house' ? room.z : b.focus.z - .8];
    const delta = [point[0] - b.focus.x, point[1], point[2] - b.focus.z], dot = (a, c) => a.reduce((sum, v, i) => sum + v * c[i], 0);
    const ray = overviewRay(b.cx + dot(delta, b.right) * b.scale, b.cy + dot(delta, b.down) * b.scale, 1200, 800, camera, room), hit = intersectPlane(ray, [0, point[1], 0], [0, 1, 0]);
    assert.ok(hit); hit.forEach((v, i) => close(v, point[i]));
  }
});

test('world and furniture coordinates round trip in houses, ordinary slots and wrapped merged rooms', () => {
  const w = applyCommands(demoWorld(), [{type: 'room.merge', targetId: 'room-0', sourceId: 'room-11'}], now);
  for (const r of w.rooms.filter(r => r.kind === 'house' || !r.slots.some(s => s === 2 || s === 3))) for (const kind of ['shelf', 'wall', 'desk', 'box']) for (const x of [-3, 0, 3]) {
    const f = {id: 'f', roomId: r.id, kind, name: 'Furniture', x, z: x / 2}, frame = furnitureFrame(r, f), coord = furnitureCoordinates(r, f, frame.x, frame.z);
    close(coord.x, x, .011); close(coord.z, x / 2, .011);
    const local = placementPoint(f, {u: .6, v: kind === 'shelf' ? 1 : -.4}), restored = pointToFurniture(frame, furniturePoint(frame, local)), position = placementCoordinates(f, restored);
    local.forEach((v, i) => close(v, restored[i])); close(position.u, .6); close(position.v, kind === 'shelf' ? 1 : -.4);
    const plane = placementDragPlane(r, f), world = furniturePoint(frame, local), delta = world.map((v, i) => v - plane.point[i]);
    close(delta.reduce((sum, n, i) => sum + n * plane.normal[i], 0), 0);
  }
});

test('drag limits keep furniture inside truncated slots and houses outside the mansion', () => {
  for (const room of emptyWorld().rooms) for (const kind of ['shelf', 'wall', 'desk', 'box']) {
    const f = {id: 'f', roomId: room.id, kind, name: 'Furniture', x: 0, z: 0}, coordinates = furnitureCoordinates(room, f, -500, 500), frame = furnitureFrame(room, {...f, ...coordinates});
    assert.ok(coordinates.x >= -4 && coordinates.x <= 4 && coordinates.z >= -4 && coordinates.z <= 4); assert.equal(containsRoomPoint(room, frame.x, frame.z), true);
  }
  for (const point of [[0, 0], [5, 6], [-500, 300], [-12, -10]]) {const p = houseCoordinates(...point); assert.ok(Math.hypot(p.x, p.z) >= 18); assert.ok(Math.abs(p.x) <= 80 && Math.abs(p.z) <= 80);}
});

test('new furniture seeks free floor space without changing existing positions', () => {
  const base = demoWorld(), room = base.rooms.find(r => r.kind === 'house'), f = {id: 'new', roomId: room.id, kind: 'box', name: 'Box', x: 0, z: 0};
  let w = {...base, furniture: [], placements: []};
  for (let i = 0; i < 4; i++) {const before = structuredClone(w.furniture), candidate = newFurniturePosition(w, room, {...f, id: 'f-' + i}); assert.equal(candidate.overlaps, 0); assert.deepEqual(w.furniture, before); const next = {...f, id: 'f-' + i, x: candidate.x, z: candidate.z}; for (const other of w.furniture) assert.equal(framesOverlap(furnitureFrame(room, next), furnitureFrame(room, other)), false); w = {...w, furniture: [...w.furniture, next]};}
});

test('movement preview is reversible and each rendered thought has its own placement hit', () => {
  const w = demoWorld(), f = w.furniture[0], p = w.placements.find(p => p.furnitureId === f.id), room = w.rooms.find(r => r.id === f.roomId), before = JSON.stringify(w), command = {type: 'placement.move', id: p.id, position: {u: .6, v: 1}};
  const preview = previewMove(w, command); assert.equal(JSON.stringify(w), before); assert.notEqual(preview.placements, w.placements); assert.equal(preview.objects, w.objects);
  const ctx = {clearRect() {}, fillRect() {}, createLinearGradient: () => ({addColorStop() {}}), beginPath() {}, moveTo() {}, lineTo() {}, closePath() {}, fill() {}, stroke() {}, ellipse() {}, bezierCurveTo() {}, roundRect() {}, measureText: text => ({width: text.length * 6}), fillText() {}};
  const originalHits = drawScene(ctx, w, 1200, 800, {yaw: -.5, pitch: .6, zoom: 1}, room), previewHits = drawScene(ctx, preview, 1200, 800, {yaw: -.5, pitch: .6, zoom: 1}, room, false, p.id);
  const a = originalHits.find(h => h.placementId === p.id), b = previewHits.find(h => h.placementId === p.id); assert.ok(a && b); assert.equal(a.id, b.id); assert.ok(Math.hypot(a.x - b.x, a.y - b.y) > 1);
});
