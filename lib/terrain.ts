import type {World} from './domain.ts';
import type {Point3} from './architecture.ts';

// Extend the continuous cliff below every supported overview viewport. Keeping
// the lower ring deep in world space also preserves the same geometry on walks.
export const GROUND_HEIGHT = -.2, BEDROCK_DEPTH = 2048, TERRAIN_SEGMENTS = 96;
export function groundRadius(world: World) {
  return Math.max(28, ...world.rooms.filter(room => room.kind === 'house').map(room => Math.hypot(room.x, room.z) + 4));
}

type CliffFace = {points: Point3[]; normal: Point3; color: string};
const point = (radius: number, angle: number, y: number): Point3 => [radius * Math.cos(angle), y, radius * Math.sin(angle)];
const noise = (i: number) => {const n = Math.sin(i * 73.17 + 19.7) * 4381.71; return n - Math.floor(n);};
export function buildTerrain(world: World) {
  const radius = groundRadius(world), rings = [{y: GROUND_HEIGHT, inset: 0}, {y: -.95, inset: .05}, {y: -3.35, inset: .24}, {y: -BEDROCK_DEPTH, inset: .65}];
  const palettes = [['#b6ab8f', '#bdb296', '#afa58a'], ['#c1b79d', '#b9b299', '#c7bda5'], ['#a8ac98', '#b1b39e', '#a3a792']];
  const faces: CliffFace[] = [];
  const vertex = (layer: number, i: number) => {const ring = rings[layer], index = i % TERRAIN_SEGMENTS; return point(radius - ring.inset, index / TERRAIN_SEGMENTS * Math.PI * 2, ring.y + (layer > 1 ? (noise(index + layer * 90) - .5) * .34 : 0));};
  for (let layer = 0; layer < rings.length - 1; layer++) for (let i = 0; i < TERRAIN_SEGMENTS; i++) {
    const a = vertex(layer, i), b = vertex(layer, i + 1), c = vertex(layer + 1, i + 1), d = vertex(layer + 1, i), u = b.map((n, k) => n - a[k]), v = c.map((n, k) => n - a[k]);
    const normal: Point3 = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    faces.push({points: [a, b, c, d], normal, color: palettes[layer][Math.floor(noise(i + 200) * 3)]});
  }
  return {radius, faces};
}

export function cliffFacesCamera(face: CliffFace, camera: Point3 | null, direction: Point3) {
  const view = camera ? camera.map((n, i) => n - face.points[0][i]) : direction;
  return face.normal.reduce((sum, n, i) => sum + n * view[i], 0) > 1e-7;
}
