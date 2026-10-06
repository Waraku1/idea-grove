import type {World, Room} from './domain.ts';
import {PLAYER_RADIUS, containsRoomPoint, distanceToEdge, furnitureFrame, furnitureContains, roomFloors, roomEdges, roomEntries, type FurnitureFrame} from './architecture.ts';

export type WalkPose = {x: number; z: number; yaw: number; pitch: number};
export type ViewPoint = [number, number, number];
export const EYE_HEIGHT = 1.65, NEAR = .15;
export const HORIZONTAL_FOV = 82 * Math.PI / 180;
export const focalLength = (width: number) => width / (2 * Math.tan(HORIZONTAL_FOV / 2));
export const outdoorSpawn = (): WalkPose => ({x: 0, z: 24, yaw: Math.PI, pitch: .18});

export function indoorSpawn(room: Room, from?: WalkPose): WalkPose {
  const entries = roomEntries(room).sort((a, b) => from
    ? Math.hypot(a.x - from.x, a.z - from.z) - Math.hypot(b.x - from.x, b.z - from.z)
    : Math.hypot(a.x, a.z) - Math.hypot(b.x, b.z));
  const door = entries[0];
  return {x: door.x - door.normal[0] * .7, z: door.z - door.normal[1] * .7, yaw: from?.yaw ?? Math.atan2(-door.normal[0], -door.normal[1]), pitch: from?.pitch ?? .04};
}

export function viewPoint(p: ViewPoint, pose: WalkPose): ViewPoint {
  const dx = p[0] - pose.x, dz = p[2] - pose.z, dy = p[1] - EYE_HEIGHT;
  const right = dx * Math.cos(pose.yaw) - dz * Math.sin(pose.yaw), forward = dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
  return [right, dy * Math.cos(pose.pitch) - forward * Math.sin(pose.pitch), forward * Math.cos(pose.pitch) + dy * Math.sin(pose.pitch)];
}

export function clipNear(points: ViewPoint[], near = NEAR): ViewPoint[] {
  const result: ViewPoint[] = [];
  for (let i = 0; i < points.length; i++) {
    const a = points[i], b = points[(i + 1) % points.length], inside = a[2] >= near, next = b[2] >= near;
    if (inside) result.push(a);
    if (inside !== next) {const t = (near - a[2]) / (b[2] - a[2]); result.push([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, near]);}
  }
  return result;
}

export function perspective(p: ViewPoint, width: number, height: number) {
  const focal = focalLength(width);
  return {x: width / 2 + p[0] * focal / p[2], y: height / 2 - p[1] * focal / p[2], depth: p[2], scale: focal / p[2]};
}

// Immutable world snapshots share one collision model throughout a walking session.
const collisionCache = new WeakMap<World, {rooms: Map<string, {room: Room; edges: ReturnType<typeof roomEdges>; frames: FurnitureFrame[]}>}>();
function collisions(w: World) {
  let model = collisionCache.get(w);
  if (!model) {
    model = {rooms: new Map(w.rooms.map(room => [room.id, {room, edges: roomEdges(room), frames: w.furniture.filter(f => f.roomId === room.id).map(f => furnitureFrame(room, f))}]))};
    collisionCache.set(w, model);
  }
  return model;
}

export function canStand(x: number, z: number, w: World, room: Room | null): boolean {
  if (!Number.isFinite(x) || !Number.isFinite(z)) return false;
  const model = collisions(w);
  if (room) {
    const info = model.rooms.get(room.id);
    return !!info && containsRoomPoint(room, x, z, PLAYER_RADIUS + .06) && !info.frames.some(frame => furnitureContains(frame, x, z));
  }
  const radius = Math.hypot(x, z);
  if (radius > 118 || radius < .85) return false;
  return ![...model.rooms.values()].some(info => containsRoomPoint(info.room, x, z) || info.edges.some(edge => distanceToEdge(x, z, edge.a, edge.b) < PLAYER_RADIUS + .06));
}

export function stepWalk(pose: WalkPose, forward: number, strafe: number, seconds: number, running: boolean, w: World, room: Room | null): WalkPose {
  const length = Math.hypot(forward, strafe); if (!length) return pose;
  const amount = (running ? 5.4 : 3) * Math.max(0, Math.min(seconds, .05)) / Math.max(1, length);
  const dx = (Math.sin(pose.yaw) * forward + Math.cos(pose.yaw) * strafe) * amount, dz = (Math.cos(pose.yaw) * forward - Math.sin(pose.yaw) * strafe) * amount;
  let x = pose.x, z = pose.z;
  const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .08));
  for (let i = 0; i < steps; i++) {if (canStand(x + dx / steps, z, w, room)) x += dx / steps; if (canStand(x, z + dz / steps, w, room)) z += dz / steps;}
  return {...pose, x, z};
}

export function safeSpawn(w: World, room: Room | null, from?: WalkPose): WalkPose {
  const base = room ? indoorSpawn(room, from) : outdoorSpawn();
  if (canStand(base.x, base.z, w, room)) return base;
  if (room) {
    const candidates: {x: number; z: number}[] = [];
    for (const poly of roomFloors(room)) {
      const minX = Math.min(...poly.map(p => p[0])), maxX = Math.max(...poly.map(p => p[0]));
      const minZ = Math.min(...poly.map(p => p[1])), maxZ = Math.max(...poly.map(p => p[1]));
      for (let z = minZ; z <= maxZ; z += .2) for (let x = minX; x <= maxX; x += .2) candidates.push({x, z});
    }
    candidates.sort((a, b) => Math.hypot(a.x - base.x, a.z - base.z) - Math.hypot(b.x - base.x, b.z - base.z));
    for (const candidate of candidates) if (canStand(candidate.x, candidate.z, w, room)) return {...base, ...candidate};
  } else for (let z = 16; z < 110; z += 2) for (let x = -10; x <= 10; x += 2) if (canStand(x, z, w, null)) return {...base, x, z};
  return base;
}

export type WalkTarget = {id: string; kind: 'room' | 'tree' | 'furniture' | 'object' | 'exit'; label: string; distance: number};
export function walkTarget(pose: WalkPose, w: World, room: Room | null): WalkTarget | null {
  const targets: {x: number; z: number; id: string; kind: WalkTarget['kind']; label: string}[] = [];
  if (room) {
    for (const f of w.furniture.filter(f => f.roomId === room.id)) {
      const frame = furnitureFrame(room, f), placements = w.placements.filter(p => p.furnitureId === f.id);
      const object = placements.map(p => w.objects.find(o => o.id === p.objectId && !o.archived)).find(Boolean);
      targets.push({x: frame.x, z: frame.z, id: object?.id ?? f.id, kind: object ? 'object' : 'furniture', label: object ? 'Open ' + (object.title || 'Untitled thought') : 'Inspect ' + f.name});
    }
    for (const door of roomEntries(room)) targets.push({...door, id: 'exit', kind: 'exit', label: 'Leave room'});
  } else {
    targets.push({x: 0, z: 0, id: 'tree', kind: 'tree', label: 'Inspect tree'});
    for (const r of w.rooms) for (const door of roomEntries(r)) targets.push({x: door.x + door.normal[0] * .3, z: door.z + door.normal[1] * .3, id: r.id, kind: 'room', label: 'Enter ' + r.name});
  }
  return targets.map(t => ({...t, distance: Math.hypot(t.x - pose.x, t.z - pose.z)})).filter(t => {
    const dx = t.x - pose.x, dz = t.z - pose.z, forward = dx * Math.sin(pose.yaw) + dz * Math.cos(pose.yaw);
    return t.distance < 2.8 && (t.distance < .65 || forward / t.distance > .55);
  }).sort((a, b) => a.distance - b.distance)[0] ?? null;
}
