import type {Furniture, Room, World} from './domain.ts';

export type Point3 = [number, number, number];
export type Point2 = [number, number];
export const STRUCTURE = {
  innerRadius: 8, outerRadius: 12.8, wallHeight: 2.6,
  houseHalfWidth: 2, houseHalfDepth: 1.7, houseHeight: 2.7,
  wallThickness: .12, archHalfWidth: 1, furnitureScale: .72,
} as const;
export const PLAYER_RADIUS = .22;
export type Opening = {start: number; end: number; sill: number; top: number; kind: 'window' | 'door'};
export type Surface = {points: Point3[]; color: string; kind: 'floor' | 'roof' | 'wall' | 'frame'; roomIds: string[]};
export type Wall = {
  a: Point2; b: Point2; height: number; openings: Opening[];
  owners: {roomId: string; normal: Point2}[]; surfaces: Surface[];
};
export type Architecture = {floors: Surface[]; roofs: Surface[]; walls: Wall[]};
export type FurnitureFrame = {x: number; z: number; yaw: number; scale: number; halfX: number; halfZ: number};
const polar = (r: number, a: number): Point2 => [r * Math.cos(a), r * Math.sin(a)];
const pointKey = (p: Point2) => p.map(n => (Math.abs(n) < 1e-6 ? 0 : n).toFixed(6)).join(',');
const edgeKey = (a: Point2, b: Point2) => [pointKey(a), pointKey(b)].sort().join('|');
const mix = (hex: string, factor: number) => `rgb(${hex.slice(1).match(/../g)!.map(n => Math.min(255, Math.round(parseInt(n, 16) * factor))).join(',')})`;

function clipArch(poly: Point2[], sign: number): Point2[] {
  const result: Point2[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    const inside = a[0] * sign >= STRUCTURE.archHalfWidth, next = b[0] * sign >= STRUCTURE.archHalfWidth;
    if (inside) result.push(a);
    if (inside !== next) {
      const t = (STRUCTURE.archHalfWidth * sign - a[0]) / (b[0] - a[0]);
      result.push([STRUCTURE.archHalfWidth * sign, a[1] + (b[1] - a[1]) * t]);
    }
  }
  return result;
}

export function roomFloors(room: Room): Point2[][] {
  if (room.kind === 'house') {
    const {x, z} = room, hx = STRUCTURE.houseHalfWidth, hz = STRUCTURE.houseHalfDepth;
    return [[[x - hx, z - hz], [x + hx, z - hz], [x + hx, z + hz], [x - hx, z + hz]]];
  }
  const sections = Array.from({length:12},(_,i)=>i);
  return sections.map(slot => {
    const a = slot * Math.PI / 6, b = (slot + 1) * Math.PI / 6;
    const poly = [polar(STRUCTURE.innerRadius, a), polar(STRUCTURE.outerRadius, a), polar(STRUCTURE.outerRadius, b), polar(STRUCTURE.innerRadius, b)];
    return slot === 2 ? clipArch(poly, 1) : slot === 3 ? clipArch(poly, -1) : poly;
  });
}

export function roomEdges(room: Room) {
  const edges = new Map<string, {a: Point2; b: Point2; normal: Point2; count: number}>();
  for (const poly of roomFloors(room)) for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length], key = edgeKey(a, b), existing = edges.get(key);
    if (existing) existing.count++;
    else {const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz); edges.set(key, {a, b, normal: [dz / length, -dx / length], count: 1});}
  }
  return [...edges.values()].filter(edge => edge.count === 1);
}

export function distanceToEdge(x: number, z: number, a: Point2, b: Point2) {
  const dx = b[0] - a[0], dz = b[1] - a[1], t = Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz)));
  return Math.hypot(x - a[0] - dx * t, z - a[1] - dz * t);
}

export function containsRoomPoint(room: Room, x: number, z: number, margin = 0) {
  const inside = roomFloors(room).some(poly => poly.every((a, i) => {
    const b = poly[(i + 1) % poly.length];
    return (b[0] - a[0]) * (z - a[1]) - (b[1] - a[1]) * (x - a[0]) >= -1e-7;
  }));
  return inside && (margin <= 0 || roomEdges(room).every(e => distanceToEdge(x, z, e.a, e.b) >= margin));
}

function roomArc(room: Room) {
  const sections = Array.from({length:12},(_,i)=>i);
  const slots = new Set(sections), start = sections.find(s => !slots.has((s + 11) % 12)) ?? 0;
  return {start: start * Math.PI / 6, span: sections.length * Math.PI / 6};
}

export function roomBearing(room: Room) {
  const arc = roomArc(room);
  return arc.start + arc.span / 2;
}

export function roomFocus(room: Room) {
  const floors = roomFloors(room), vertices = floors.flat();
  const minX = Math.min(...vertices.map(p => p[0])), maxX = Math.max(...vertices.map(p => p[0]));
  const minZ = Math.min(...vertices.map(p => p[1])), maxZ = Math.max(...vertices.map(p => p[1]));
  return {x: (minX + maxX) / 2, z: (minZ + maxZ) / 2, span: Math.max(maxX - minX, maxZ - minZ)};
}

export function surfaceBlocksSegment(points: Point3[], from: Point3, to: Point3) {
  const sub = (a: Point3, b: Point3) => a.map((n, i) => n - b[i]) as Point3;
  const dot = (a: Point3, b: Point3) => a.reduce((sum, n, i) => sum + n * b[i], 0);
  const cross = (a: Point3, b: Point3): Point3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const direction = sub(to, from);
  for (let i = 1; i < points.length - 1; i++) {
    const a = points[0], e1 = sub(points[i], a), e2 = sub(points[i + 1], a), h = cross(direction, e2), determinant = dot(e1, h);
    if (Math.abs(determinant) < 1e-9) continue;
    const s = sub(from, a), u = dot(s, h) / determinant, q = cross(s, e1), v = dot(direction, q) / determinant, t = dot(e2, q) / determinant;
    if (u >= 0 && v >= 0 && u + v <= 1 && t > 1e-6 && t < 1 - 1e-6) return true;
  }
  return false;
}

export function furniturePoint(frame: FurnitureFrame, p: Point3): Point3 {
  const x = p[0] * frame.scale, z = p[2] * frame.scale;
  return [frame.x + x * Math.cos(frame.yaw) + z * Math.sin(frame.yaw), p[1] * frame.scale, frame.z - x * Math.sin(frame.yaw) + z * Math.cos(frame.yaw)];
}

export function furnitureFrame(room: Room, furniture: Furniture): FurnitureFrame {
  const size = {shelf: [.9, .52], desk: [1, .65], wall: [.9, .16], box: [.7, .6]}[furniture.kind];
  const scale = STRUCTURE.furnitureScale, halfX = size[0] * scale, halfZ = size[1] * scale;
  const frame: FurnitureFrame = {x: 0, z: 0, yaw: 0, scale, halfX, halfZ};
  if (room.kind === 'house') {
    frame.x = room.x + furniture.x / 4 * (STRUCTURE.houseHalfWidth - halfX - .14);
    frame.z = room.z + furniture.z / 4 * (STRUCTURE.houseHalfDepth - halfZ - .14);
    return frame;
  }
  const arc = roomArc(room), margin = Math.atan2(halfX + .22, STRUCTURE.innerRadius + halfZ);
  const angle = arc.start + margin + (furniture.x + 4) / 8 * Math.max(0, arc.span - margin * 2);
  // Coordinates remain normalized room placements; no stored content or history is migrated.
  const outer = STRUCTURE.outerRadius * Math.cos(Math.PI / 12) - halfZ - .18;
  const inner = STRUCTURE.innerRadius + halfZ + .18;
  const radius = (inner + outer) / 2 - furniture.z / 8 * (outer - inner);
  const center = polar(radius, angle); frame.x = center[0]; frame.z = center[1]; frame.yaw = -angle - Math.PI / 2;
  const cornersFit = () => [-1, 1].every(a => [-1, 1].every(b => {
    const p = furniturePoint(frame, [a * size[0], 0, b * size[1]]);
    return containsRoomPoint(room, p[0], p[2], .08);
  }));
  // The south passage truncates two slots. Fit the same furniture into their real footprint.
  const slot = ((Math.floor(angle / (Math.PI / 6)) % 12) + 12) % 12;
  const sections = Array.from({length:12},(_,i)=>i);
  const poly = roomFloors(room)[Math.max(0, sections.indexOf(slot))];
  const target: Point2 = [poly.reduce((n, p) => n + p[0], 0) / poly.length, poly.reduce((n, p) => n + p[1], 0) / poly.length];
  for (let i = 0; i < 40 && !cornersFit(); i++) {frame.x += (target[0] - frame.x) * .15; frame.z += (target[1] - frame.z) * .15;}
  return frame;
}

export function furnitureContains(frame: FurnitureFrame, x: number, z: number, margin = PLAYER_RADIUS) {
  const dx = x - frame.x, dz = z - frame.z;
  return Math.abs(dx * Math.cos(frame.yaw) - dz * Math.sin(frame.yaw)) < frame.halfX + margin && Math.abs(dx * Math.sin(frame.yaw) + dz * Math.cos(frame.yaw)) < frame.halfZ + margin;
}

function openingsFor(room: Room, a: Point2, b: Point2): Opening[] {
  const window = (start: number, end: number, sill = .65, top = 2.35): Opening => ({start, end, sill, top, kind: 'window'});
  const door = (start: number, end: number): Opening => ({start, end, sill: 0, top: 2.2, kind: 'door'});
  if (room.kind === 'house') {
    if (Math.abs(a[1] - room.z - STRUCTURE.houseHalfDepth) < .001 && Math.abs(b[1] - a[1]) < .001)
      return [window(.08, .375), door(.39, .61), window(.625, .92)];
    return [window(.1, .9, .6, 2.4)];
  }
  const radius = (Math.hypot(...a) + Math.hypot(...b)) / 2;
  const archSide = Math.abs(a[0] - b[0]) < .001 && Math.abs(Math.abs(a[0]) - STRUCTURE.archHalfWidth) < .001 && a[1] > 7;
  if (archSide) return [window(.08, .32), door(.36, .64), window(.68, .92)];
  if (radius < 8.2 || radius > 12) return [window(.06, .35, .6), door(.38, .62), window(.65, .94, .6)];
  return [];
}

function wallSurfaces(wall: Wall): Surface[] {
  const {a, b, height, openings} = wall, dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
  const nx = dz / length * STRUCTURE.wallThickness / 2, nz = -dx / length * STRUCTURE.wallThickness / 2;
  const at = (u: number, y: number, side = 1): Point3 => [a[0] + dx * u + nx * side, y, a[1] + dz * u + nz * side];
  const surfaces: Surface[] = [], roomIds = wall.owners.map(o => o.roomId);
  const quad = (points: Point3[], color: string, kind: Surface['kind'] = 'wall') => surfaces.push({points, color, kind, roomIds});
  const panel = (u0: number, u1: number, y0: number, y1: number, color: string, kind: Surface['kind'] = 'wall') => {
    if (u1 <= u0 || y1 <= y0) return;
    quad([at(u0, y0), at(u1, y0), at(u1, y1), at(u0, y1)], color, kind);
    quad([at(u1, y0, -1), at(u0, y0, -1), at(u0, y1, -1), at(u1, y1, -1)], color, kind);
    for (const u of [u0, u1]) quad([at(u, y0), at(u, y0, -1), at(u, y1, -1), at(u, y1)], '#c9c5b2', kind);
    for (const y of [y0, y1]) quad([at(u0, y), at(u0, y, -1), at(u1, y, -1), at(u1, y)], '#eee8db', kind);
  };
  // Subdivision keeps nearby wall panels ordered reliably in the Canvas perspective renderer.
  const panelSpan = (start: number, end: number, y0: number, y1: number) => {
    const parts = Math.max(1, Math.ceil((end - start) * length / .8));
    for (let i = 0; i < parts; i++) panel(start + (end - start) * i / parts, start + (end - start) * (i + 1) / parts, y0, y1, '#e6dfce');
  };
  let cursor = 0;
  for (const opening of openings) {
    panelSpan(cursor, opening.start, 0, height);
    panelSpan(opening.start, opening.end, 0, opening.sill);
    panelSpan(opening.start, opening.end, opening.top, height);
    const trim = .035 / length;
    for (const u of [opening.start, opening.end]) panel(u - trim, u + trim, opening.sill, opening.top, '#91a18e', 'frame');
    for (const y of [opening.sill, opening.top]) if (y > 0) panel(opening.start, opening.end, y - .035, y + .035, '#91a18e', 'frame');
    if (opening.kind === 'window') {
      const mid = (opening.start + opening.end) / 2;
      panel(mid - trim / 2, mid + trim / 2, opening.sill, opening.top, '#a7b39b', 'frame');
    }
    cursor = opening.end;
  }
  panelSpan(cursor, 1, 0, height);
  return surfaces;
}

export function buildArchitecture(w: World): Architecture {
  const floors: Surface[] = [], roofs: Surface[] = [], walls = new Map<string, Wall>();
  for (const room of w.rooms) {
    for (const floor of roomFloors(room)) floors.push({points: floor.map(p => [p[0], .03, p[1]]), color: '#e1dac8', kind: 'floor', roomIds: [room.id]});
    for (const edge of roomEdges(room)) {
      const key = edgeKey(edge.a, edge.b), owner = {roomId: room.id, normal: edge.normal}, existing = walls.get(key);
      if (existing) existing.owners.push(owner);
      else walls.set(key, {a: edge.a, b: edge.b, height: room.kind === 'house' ? STRUCTURE.houseHeight : STRUCTURE.wallHeight, openings: openingsFor(room, edge.a, edge.b), owners: [owner], surfaces: []});
    }
    const roof = (points: Point3[], color: string) => roofs.push({points, color, kind: 'roof', roomIds: [room.id]});
    if (room.kind === 'house') {
      const {x, z} = room, y = STRUCTURE.houseHeight;
      for (const side of [-1, 1]) {
        roof([[x - 2.35, y, z + side * 2], [x + 2.35, y, z + side * 2], [x, 4.4, z + side * 2]], mix(room.color, side < 0 ? .78 : 1));
        roof([[x + side * 2.35, y, z - 2], [x + side * 2.35, y, z + 2], [x, 4.4, z + 2], [x, 4.4, z - 2]], mix(room.color, side < 0 ? .92 : 1.12));
      }
    } else for (const slot of Array.from({length:12},(_,i)=>i)) {
      const a = slot * Math.PI / 6, b = (slot + 1) * Math.PI / 6;
      const p = (r: number, angle: number, y: number): Point3 => {const v = polar(r, angle); return [v[0], y, v[1]];};
      roof([p(7.6, a, 2.6), p(7.6, b, 2.6), p(10.1, b, 3.75), p(10.1, a, 3.75)], mix(room.color, .92));
      roof([p(10.1, a, 3.75), p(10.1, b, 3.75), p(13.2, b, 2.6), p(13.2, a, 2.6)], mix(room.color, 1.06));
    }
  }
  for (const wall of walls.values()) wall.surfaces = wallSurfaces(wall);
  return {floors, roofs, walls: [...walls.values()]};
}

export function roomEntries(room: Room) {
  return roomEdges(room).flatMap(edge => openingsFor(room, edge.a, edge.b).filter(o => o.kind === 'door').map(o => {
    const u = (o.start + o.end) / 2;
    return {x: edge.a[0] + (edge.b[0] - edge.a[0]) * u, z: edge.a[1] + (edge.b[1] - edge.a[1]) * u, normal: edge.normal};
  }));
}

export function wallBlocksSegment(wall: Wall, from: Point3, to: Point3) {
  const dx = wall.b[0] - wall.a[0], dz = wall.b[1] - wall.a[1];
  const vx = to[0] - from[0], vz = to[2] - from[2], denominator = vx * dz - vz * dx;
  if (Math.abs(denominator) < 1e-9) return false;
  const ax = wall.a[0] - from[0], az = wall.a[1] - from[2];
  const t = (ax * dz - az * dx) / denominator, u = (ax * vz - az * vx) / denominator;
  if (t <= .001 || t >= .999 || u < 0 || u > 1) return false;
  const y = from[1] + (to[1] - from[1]) * t;
  if (y < 0 || y > wall.height) return false;
  return !wall.openings.some(o => u > o.start && u < o.end && y > o.sill && y < o.top);
}
