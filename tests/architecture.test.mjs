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

test('empty worlds contain no fixed mansion partitions and demo houses use free-standing walls', () => {
  assert.equal(buildArchitecture(emptyWorld()).walls.length, 0);
  const w = demoWorld();
  for (const room of w.rooms) {
    const walls = buildArchitecture({...emptyWorld(), rooms:[room]}).walls;
    assert.equal(walls.length, 4);
    assert.ok(walls.every(wall => wall.owners.length === 1 && wall.owners[0].roomId === room.id));
  }
});

test('free-standing houses expose a real front doorway', () => {
  const w = demoWorld(), room = w.rooms[0], model = buildArchitecture(w);
  const door = roomEntries(room)[0];
  assert.ok(door);
  const throughDoor = [[door.x - door.normal[0], EYE_HEIGHT, door.z - door.normal[1]], [door.x + door.normal[0], EYE_HEIGHT, door.z + door.normal[1]]];
  assert.equal(model.walls.some(wall => wallBlocksSegment(wall, ...throughDoor)), false);
  assert.equal(canStand(safeSpawn(w, room).x, safeSpawn(w, room).z, w, room), true);
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
  assert.ok(checked >= 20);
});

test('furniture fits real footprints at all coordinate extremes of free-standing houses', () => {
  const rooms = demoWorld().rooms;
  const sizes = {shelf: [.9, .52], wall: [.9, .16], desk: [1, .65], box: [.7, .6]};
  for (const room of rooms) for (const kind of Object.keys(sizes)) for (const x of [-4, 0, 4]) for (const z of [-4, 0, 4]) {
    const f = {id: 'f', roomId: room.id, kind, name: 'f', x, z}, frame = furnitureFrame(room, f), [hx, hz] = sizes[kind];
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
      const point = furniturePoint(frame, [sx * hx, 0, sz * hz]);
      assert.equal(containsRoomPoint(room, point[0], point[2]), true, JSON.stringify({roomId: room.id, kind, x, z, point}));
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

test('free-standing rooms retain independent collision boundaries', () => {
  const w = demoWorld(), a = w.rooms[0], b = w.rooms[1];
  assert.notEqual(a.id, b.id);
  assert.equal(containsRoomPoint(a, a.x, a.z), true);
  assert.equal(containsRoomPoint(b, b.x, b.z), true);
  assert.equal(canStand(a.x, a.z, w, a), true);
  assert.equal(canStand(b.x, b.z, w, b), true);
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

test('moving an actual house changes its architectural world coordinates', () => {
  const original = demoWorld(), room = original.rooms.find(r => r.id === 'house-cube');
  assert.ok(room);
  const before = buildArchitecture(original).walls.filter(w => w.owners.some(o => o.roomId === room.id));
  const moved = {...original, rooms: original.rooms.map(r => r.id === room.id ? {...r, x: r.x + 30} : r)};
  const after = buildArchitecture(moved).walls.filter(w => w.owners.some(o => o.roomId === room.id));
  assert.equal(after.length, before.length);
  assert.ok(after.some((wall, i) => wall.a[0] !== before[i].a[0] || wall.a[1] !== before[i].a[1]));
});

