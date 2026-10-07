import type {Command, Furniture, Placement, Room, World} from './domain.ts';
import {furnitureFrame, furniturePoint, roomBearing, roomFocus, STRUCTURE, type FurnitureFrame, type Point3} from './architecture.ts';
import type {Camera} from './scene.ts';

export type MoveTarget = {kind: 'furniture' | 'room' | 'placement'; id: string};
export type MoveCommand = Extract<Command, {type: 'furniture.move' | 'room.move' | 'placement.move'}>;
const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n * 100) / 100;

export function overviewBasis(width: number, height: number, camera: Camera, room: Room | null) {
  const focus = room ? roomFocus(room) : {x: 0, z: 0, span: 0};
  const yaw = camera.yaw + (room?.kind === 'mansion' ? Math.PI / 2 - roomBearing(room) : 0);
  const scale = (room ? Math.min(width / (focus.span * 1.8 + 4), height / (focus.span + 5)) : Math.min(width / 60, height / 46)) * camera.zoom;
  const co = Math.cos(yaw), si = Math.sin(yaw), cp = Math.cos(camera.pitch), sp = Math.sin(camera.pitch);
  return {focus, scale, yaw, cx: width / 2, cy: height * (room ? .57 : .5), right: [co, 0, -si] as Point3, down: [si * sp, -cp, co * sp] as Point3, near: [si * cp, sp, co * cp] as Point3};
}

export function overviewRay(x: number, y: number, width: number, height: number, camera: Camera, room: Room | null) {
  const b = overviewBasis(width, height, camera, room), sx = (x - b.cx) / b.scale, sy = (y - b.cy) / b.scale;
  const origin: Point3 = [b.focus.x, 0, b.focus.z];
  for (let k = 0; k < 3; k++) origin[k] += b.right[k] * sx + b.down[k] * sy + b.near[k] * 1000;
  return {origin, direction: b.near.map(n => -n) as Point3};
}

export function intersectPlane(ray: ReturnType<typeof overviewRay>, point: Point3, normal: Point3): Point3 | null {
  const dot = (a: Point3, b: Point3) => a.reduce((n, v, i) => n + v * b[i], 0), denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < .02) return null;
  const t = dot(point.map((n, i) => n - ray.origin[i]) as Point3, normal) / denominator;
  return ray.origin.map((n, i) => n + ray.direction[i] * t) as Point3;
}

export function furnitureCoordinates(room: Room, f: Furniture, x: number, z: number) {
  const frame = furnitureFrame(room, f);
  if (room.kind === 'house') return {x: round(clamp((x - room.x) / (STRUCTURE.houseHalfWidth - frame.halfX - .14) * 4, -4, 4)), z: round(clamp((z - room.z) / (STRUCTURE.houseHalfDepth - frame.halfZ - .14) * 4, -4, 4))};
  const sections = room.slots?.length ? room.slots : Array.from({length:12},(_,i)=>i), slots = new Set(sections), start = (sections.find(s => !slots.has((s + 11) % 12)) ?? 0) * Math.PI / 6, span = sections.length * Math.PI / 6;
  const margin = Math.atan2(frame.halfX + .22, STRUCTURE.innerRadius + frame.halfZ), reference = start + margin + (f.x + 4) / 8 * (span - 2 * margin);
  let angle = Math.atan2(z, x); angle += Math.round((reference - angle) / (Math.PI * 2)) * Math.PI * 2;
  const outer = STRUCTURE.outerRadius * Math.cos(Math.PI / 12) - frame.halfZ - .18, inner = STRUCTURE.innerRadius + frame.halfZ + .18;
  return {x: round(clamp((angle - start - margin) / Math.max(.01, span - 2 * margin) * 8 - 4, -4, 4)), z: round(clamp(((inner + outer) / 2 - Math.hypot(x, z)) / (outer - inner) * 8, -4, 4))};
}

export function framesOverlap(a: FurnitureFrame, b: FurnitureFrame, padding = .08) {
  const axes = [[Math.cos(a.yaw), -Math.sin(a.yaw)], [Math.sin(a.yaw), Math.cos(a.yaw)], [Math.cos(b.yaw), -Math.sin(b.yaw)], [Math.sin(b.yaw), Math.cos(b.yaw)]];
  const radius = (f: FurnitureFrame, axis: number[]) => (f.halfX + padding) * Math.abs(Math.cos(f.yaw) * axis[0] - Math.sin(f.yaw) * axis[1]) + (f.halfZ + padding) * Math.abs(Math.sin(f.yaw) * axis[0] + Math.cos(f.yaw) * axis[1]);
  return axes.every(axis => Math.abs((a.x - b.x) * axis[0] + (a.z - b.z) * axis[1]) < radius(a, axis) + radius(b, axis));
}

export function newFurniturePosition(w: World, room: Room, f: Furniture) {
  const others = w.furniture.filter(other => other.roomId === room.id).map(other => furnitureFrame(room, other));
  const candidates = [-3, -1, 1, 3].flatMap(z => [-3, -1, 1, 3].map(x => ({x, z})));
  const ranked = candidates.map(p => ({...p, overlaps: others.filter(other => framesOverlap(furnitureFrame(room, {...f, ...p}), other)).length})).sort((a, b) => a.overlaps - b.overlaps);
  return ranked[0];
}

export function placementPosition(f: Furniture, p: Placement, index: number) {
  if (p.position) return f.kind === 'shelf' ? {...p.position, v: Math.round(p.position.v)} : p.position;
  if (f.kind === 'shelf') return {u: (index % 7) / 6 * 2 - 1, v: Math.min(2, Math.floor(index / 7)) - 1};
  if (f.kind === 'wall') return {u: (index % 2) * 1.4 - .7, v: .75 - Math.min(3, Math.floor(index / 2)) * .5};
  const columns = f.kind === 'box' ? 3 : 4, rows = f.kind === 'box' ? 3 : 4;
  return {u: (index % columns) / (columns - 1) * 1.6 - .8, v: (Math.floor(index / columns) % rows) / (rows - 1) * 1.6 - .8};
}

export function placementPoint(f: Furniture, position: {u: number; v: number}): Point3 {
  const {u, v} = position;
  if (f.kind === 'shelf') return [u * .66, .525 + Math.round(v + 1) * .75, .43];
  if (f.kind === 'wall') return [u * .43, 1.45 + v * .72, .11];
  if (f.kind === 'desk') return [u * .74, 1.12, v * .43];
  return [u * .5, 1.1, v * .4];
}

export function placementCoordinates(f: Furniture, local: Point3) {
  if (f.kind === 'shelf') return {u: round(clamp(local[0] / .66, -1, 1)), v: clamp(Math.round((local[1] - .525) / .75) - 1, -1, 1)};
  if (f.kind === 'wall') return {u: round(clamp(local[0] / .43, -1, 1)), v: round(clamp((local[1] - 1.45) / .72, -1, 1))};
  return {u: round(clamp(local[0] / (f.kind === 'desk' ? .74 : .5), -1, 1)), v: round(clamp(local[2] / (f.kind === 'desk' ? .43 : .4), -1, 1))};
}

export function placementDragPlane(room: Room, f: Furniture) {
  const frame = furnitureFrame(room, f), local = placementPoint(f, {u: 0, v: 0});
  return {point: furniturePoint(frame, local), normal: (f.kind === 'shelf' || f.kind === 'wall' ? [Math.sin(frame.yaw), 0, Math.cos(frame.yaw)] : [0, 1, 0]) as Point3};
}

export function pointToFurniture(frame: FurnitureFrame, point: Point3): Point3 {
  const dx = point[0] - frame.x, dz = point[2] - frame.z;
  return [(dx * Math.cos(frame.yaw) - dz * Math.sin(frame.yaw)) / frame.scale, point[1] / frame.scale, (dx * Math.sin(frame.yaw) + dz * Math.cos(frame.yaw)) / frame.scale];
}

export function houseCoordinates(x: number, z: number) {
  x = clamp(x, -80, 80); z = clamp(z, -80, 80);
  const radius = Math.hypot(x, z); if (radius < 18.01) {const angle = radius > .001 ? Math.atan2(z, x) : 0; x = Math.cos(angle) * 18.02; z = Math.sin(angle) * 18.02;}
  return {x: round(x), z: round(z)};
}

export function previewMove(w: World, command: MoveCommand): World {
  if (command.type === 'furniture.move') return {...w, furniture: w.furniture.map(f => f.id === command.id ? {...f, x: command.x, z: command.z} : f)};
  if (command.type === 'room.move') return {...w, rooms: w.rooms.map(r => r.id === command.id ? {...r, x: command.x, z: command.z} : r)};
  return {...w, placements: w.placements.map(p => p.id === command.id ? {...p, position: command.position} : p)};
}
