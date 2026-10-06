import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyWorld, applyCommands} from '../lib/domain.ts';
import {demoWorld} from '../lib/demo.ts';
import {buildArchitecture, roomFloors, roomEdges, roomEntries, containsRoomPoint, furnitureFrame, furniturePoint, wallBlocksSegment, STRUCTURE} from '../lib/architecture.ts';
import {HORIZONTAL_FOV, focalLength, EYE_HEIGHT, perspective, safeSpawn, canStand, stepWalk, outdoorSpawn} from '../lib/walk.ts';
import {drawScene} from '../lib/scene.ts';

const now = '2026-10-04T12:00:00.000Z';
const merged = ids => ids.reduce((w, sourceId) => applyCommands(w, [{type: 'room.merge', targetId: 'room-0', sourceId}], now), emptyWorld());

test('houses use the same 4 by 3.4 footprint and wall height inside and outside', () => {
  const w = demoWorld(), r = w.rooms.find(r => r.kind === 'house'), floor = roomFloors(r)[0], model = buildArchitecture(w);
  assert.equal(Math.max(...floor.map(p => p[0])) - Math.min(...floor.map(p => p[0])), 4);
  assert.ok(Math.abs(Math.max(...floor.map(p => p[1])) - Math.min(...floor.map(p => p[1])) - 3.4) < 1e-9);
  for (const wall of model.walls.filter(wall => wall.owners.some(o => o.roomId === r.id))) assert.equal(wall.height, STRUCTURE.houseHeight);
  assert.equal(containsRoomPoint(r, r.x, r.z), true);
  assert.equal(containsRoomPoint(r, r.x + 2.1, r.z), false);
  assert.equal(canStand(0, 0, w, r), false);
});

test('shared mansion partitions are unique, including the 11 to 0 seam', () => {
  const model = buildArchitecture(emptyWorld());
  assert.equal(model.walls.length, 37);
  assert.equal(model.walls.filter(wall => wall.owners.length === 2).length, 11);
  for (const ids of [['room-1'], ['room-11']]) {
    const w = merged(ids), room = w.rooms[0];
    assert.equal(roomEdges(room).length, 6);
    assert.equal(buildArchitecture(w).walls.length, 36);
    assert.equal(buildArchitecture(w).walls.some(wall => wall.owners.length === 2 && wall.owners.every(o => o.roomId === room.id)), false);
  }
});

test('the south arch is a real two-unit opening in the common building model', () => {
  const w = emptyWorld(), model = buildArchitecture(w);
  const throughArch = [[0, EYE_HEIGHT, 15], [0, EYE_HEIGHT, 5]];
  assert.equal(model.walls.some(wall => wallBlocksSegment(wall, ...throughArch)), false);
  for (const r of w.rooms) assert.equal(containsRoomPoint(r, 0, 10), false);
  assert.equal(canStand(.65, 10, w, null), true);
  assert.equal(canStand(.9, 10, w, null), false);
  let pose = outdoorSpawn();
  for (let i = 0; i < 450; i++) pose = stepWalk(pose, 1, 0, 1 / 60, false, w, null);
  assert.ok(pose.z < 3 && pose.z > .85);
});

function triangleIntersectsSegment(points, from, to) {
  const sub = (a, b) => a.map((n, i) => n - b[i]), dot = (a, b) => a.reduce((s, n, i) => s + n * b[i], 0);
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0], e1 = sub(points[i], a), e2 = sub(points[i + 1], a), direction = sub(to, from), h = cross(direction, e2), det = dot(e1, h);
    if (Math.abs(det) < 1e-9) continue;
    const s = sub(from, a), u = dot(s, h) / det, q = cross(s, e1), v = dot(direction, q) / det, t = dot(e2, q) / det;
    if (u >= 0 && v >= 0 && u + v <= 1 && t > 0 && t < 1) return true;
  }
  return false;
}

test('large windows are actual holes in wall meshes, while their sills remain solid', () => {
  const model = buildArchitecture(demoWorld()); let checked = 0;
  for (const wall of model.walls) for (const o of wall.openings.filter(o => o.kind === 'window')) {
    const u = o.start + (o.end - o.start) / 3, x = wall.a[0] + (wall.b[0] - wall.a[0]) * u, z = wall.a[1] + (wall.b[1] - wall.a[1]) * u, normal = wall.owners[0].normal;
    const ray = y => [[x - normal[0], y, z - normal[1]], [x + normal[0], y, z + normal[1]]];
    assert.equal(wallBlocksSegment(wall, ...ray((o.sill + o.top) / 2)), false);
    assert.equal(wall.surfaces.some(s => triangleIntersectsSegment(s.points, ...ray((o.sill + o.top) / 2))), false);
    assert.equal(wallBlocksSegment(wall, ...ray(o.sill / 2)), true);
    assert.equal(wall.surfaces.some(s => triangleIntersectsSegment(s.points, ...ray(o.sill / 2))), true);
    assert.ok(o.top - o.sill >= 1.7); checked++;
  }
  assert.ok(checked > 50);
});

test('furniture fits real footprints at all coordinate extremes, including merged and truncated slots', () => {
  const rooms = [...demoWorld().rooms, merged(['room-1']).rooms[0], merged(['room-11']).rooms[0], merged(Array.from({length: 11}, (_, i) => 'room-' + (i + 1))).rooms[0]];
  const sizes = {shelf: [.9, .52], wall: [.9, .16], desk: [1, .65], box: [.7, .6]};
  for (const room of rooms) for (const kind of Object.keys(sizes)) for (const x of [-4, 0, 4]) for (const z of [-4, 0, 4]) {
    const f = {id: 'f', roomId: room.id, kind, name: 'f', x, z}, frame = furnitureFrame(room, f), [hx, hz] = sizes[kind];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const point = furniturePoint(frame, [sx * hx, 0, sz * hz]);
      assert.equal(containsRoomPoint(room, point[0], point[2]), true, JSON.stringify({room: room.slots, kind, x, z, point}));
    }
  }
});

test('entering a room uses its nearest real doorway and a collision-free world position', () => {
  const w = demoWorld();
  for (const room of w.rooms) {
    const spawn = safeSpawn(w, room);
    assert.equal(canStand(spawn.x, spawn.z, w, room), true, room.id);
    for (const door of roomEntries(room)) {
      const from = {x: door.x + door.normal[0], z: door.z + door.normal[1], yaw: Math.atan2(-door.normal[0], -door.normal[1]), pitch: .1}, entered = safeSpawn(w, room, from);
      assert.equal(canStand(entered.x, entered.z, w, room), true, room.id);
      assert.equal(entered.yaw, from.yaw);
      assert.ok(Math.hypot(entered.x - door.x, entered.z - door.z) < 2.5);
    }
  }
});

test('merged rooms preserve open internal passages and collision boundaries', () => {
  for (const ids of [['room-1'], ['room-11']]) {
    const w = merged(ids), room = w.rooms[0], angle = ids[0] === 'room-1' ? Math.PI / 6 : 0;
    assert.equal(containsRoomPoint(room, 10 * Math.cos(angle), 10 * Math.sin(angle), .3), true);
    assert.equal(canStand(10 * Math.cos(angle), 10 * Math.sin(angle), w, room), true);
  }
});

test('perspective, billboards and lines share the wider 82 degree field of view', () => {
  assert.ok(Math.abs(HORIZONTAL_FOV * 180 / Math.PI - 82) < 1e-9);
  const edge = perspective([Math.tan(HORIZONTAL_FOV / 2) * 10, 0, 10], 1000, 700);
  assert.ok(Math.abs(edge.x - 1000) < 1e-9);
  assert.equal(perspective([0, 0, 10], 1000, 700).scale, focalLength(1000) / 10);
  assert.ok(focalLength(1000) < 1000 / (2 * Math.tan(Math.PI / 5)));
});

function recordingContext() {
  const fills = []; let path = [], ellipse = null;
  const ctx = {
    fillStyle: '#000', clearRect() {}, fillRect(x, y, w, h) {fills.push({points: [[x, y], [x + w, y], [x + w, y + h], [x, y + h]], color: String(this.fillStyle)});},
    createLinearGradient: () => ({addColorStop() {}, toString: () => 'sky'}),
    beginPath() {path = []; ellipse = null;}, moveTo(x, y) {path.push([x, y]);}, lineTo(x, y) {path.push([x, y]);}, closePath() {}, bezierCurveTo() {}, stroke() {},
    ellipse(x, y, rx, ry, angle) {ellipse = {x, y, rx, ry, angle};}, roundRect() {},
    fill() {fills.push({points: path.slice(), ellipse, color: String(this.fillStyle)});}, measureText: t => ({width: t.length * 6}), fillText() {},
  };
  const pixel = (x, y) => {
    let color = null;
    for (const shape of fills) {
      let inside = false;
      if (shape.ellipse) {const e = shape.ellipse, dx = x - e.x, dy = y - e.y; inside = ((dx * Math.cos(e.angle) + dy * Math.sin(e.angle)) / e.rx) ** 2 + ((dy * Math.cos(e.angle) - dx * Math.sin(e.angle)) / e.ry) ** 2 < 1;}
      else for (let i = 0, j = shape.points.length - 1; i < shape.points.length; j = i++) {const a = shape.points[i], b = shape.points[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;}
      if (inside) color = shape.color;
    }
    return color;
  };
  return {ctx, pixel};
}

test('moving an actual house changes the landscape visible through a room window', () => {
  const original = demoWorld(), w = {...original, furniture: [], placements: []}, room = w.rooms[0];
  const wall = buildArchitecture(w).walls.find(wall => wall.owners.some(o => o.roomId === room.id) && Math.hypot(...wall.a) > 12 && Math.hypot(...wall.b) > 12);
  const u = .737, normal = wall.owners[0].normal;
  const x = wall.a[0] + (wall.b[0] - wall.a[0]) * u - normal[0] * .9, z = wall.a[1] + (wall.b[1] - wall.a[1]) * u - normal[1] * .9;
  const target = [19, 2.7 + 1.7 * (1 - 1 / 2.35), 9], distance = Math.hypot(target[0] - x, target[2] - z);
  const pose = {x, z, yaw: Math.atan2(target[0] - x, target[2] - z), pitch: Math.atan2(target[1] - EYE_HEIGHT, distance)};
  assert.equal(canStand(x, z, w, room), true);
  assert.equal(wallBlocksSegment(wall, [x, EYE_HEIGHT, z], target), false);
  const before = recordingContext(); drawScene(before.ctx, w, 1200, 800, {yaw: 0, pitch: 0, zoom: 1}, room, false, null, pose);
  const moved = {...w, rooms: w.rooms.map(r => r.id === 'house-cube' ? {...r, x: r.x + 30} : r)}, after = recordingContext();
  drawScene(after.ctx, moved, 1200, 800, {yaw: 0, pitch: 0, zoom: 1}, moved.rooms[0], false, null, pose);
  assert.equal(before.pixel(600, 400), 'rgb(130,154,128)');
  assert.notEqual(before.pixel(600, 400), after.pixel(600, 400));
});
