import {skyState, type SkyState, type WeatherSnapshot} from './weather.ts';
import {focalLength, NEAR, type WalkPose} from './walk.ts';
export type SkyEnvironment = {weather: WeatherSnapshot | null; timezone?: string; now?: number; motion?: boolean};
const noise = (i: number) => {const n = Math.sin(i * 127.1 + 311.7) * 43758.5453; return n - Math.floor(n);};
const mod = (n: number, d: number) => ((n % d) + d) % d;

export function skyLight(color: string, state: SkyState | null) {
  if (!state || state.isDay && state.rain === 0 && state.snow === 0) return color;
  const channels = color.startsWith('#') && color.length === 7 ? color.slice(1).match(/../g)?.map(n => parseInt(n, 16)) : color.match(/^rgb\((\d+),(\d+),(\d+)\)$/)?.slice(1).map(Number);
  if (!channels) return color;
  const factor = state.isDay ? .94 : .58;
  return `rgb(${channels.map((n, i) => Math.round(n * factor + (state.isDay ? 5 : [10, 24, 27][i]))).join(',')})`;
}

export function drawSky(ctx: CanvasRenderingContext2D, width: number, height: number, yaw: number, pitch: number, walk: WalkPose | null, environment: SkyEnvironment): SkyState {
  const now = environment.now ?? Date.now(), state = skyState(environment.weather, now, environment.timezone);
  const colors = !state.isDay ? ['#28434b', '#58776f', '#b3c2aa'] : state.rain || state.snow ? ['#cddcda', '#e5e9df', '#dbe4d4'] : state.clouds > .65 ? ['#d7e1dc', '#eef0e5', '#e1e7d7'] : ['#e0ece4', '#f7f3e4', '#e5edda'];
  const gradient = ctx.createLinearGradient(0, 0, 0, height); colors.forEach((c, i) => gradient.addColorStop(i / 2, c)); ctx.fillStyle = gradient; ctx.fillRect(0, 0, width, height);
  const time = (environment.motion ? now : environment.weather?.observedAt ?? Math.floor(now / 60000) * 60000) / 1000, focal = focalLength(width);
  const project = (bearing: number, elevation: number) => {
    if (!walk) return {x: mod(bearing + yaw - Math.PI / 2, Math.PI * 2) / (Math.PI * 2) * width, y: height * (.34 - elevation * .24), scale: Math.min(width, height) * .8};
    const x = Math.cos(bearing) * Math.cos(elevation), z = Math.sin(bearing) * Math.cos(elevation), y = Math.sin(elevation);
    const right = x * Math.cos(walk.yaw) - z * Math.sin(walk.yaw), forward = x * Math.sin(walk.yaw) + z * Math.cos(walk.yaw), up = y * Math.cos(walk.pitch) - forward * Math.sin(walk.pitch), depth = forward * Math.cos(walk.pitch) + y * Math.sin(walk.pitch);
    if (depth < NEAR) return null;
    return {x: width / 2 + right * focal / depth, y: height / 2 - up * focal / depth, scale: focal / depth};
  };
  const ellipse = (x: number, y: number, rx: number, ry: number, fill: string) => {if (x + rx < 0 || x - rx > width || y + ry < 0 || y - ry > height) return; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill();};
  if (!state.isDay) for (let i = 0; i < 110; i++) {
    const q = project(noise(i + 300) * Math.PI * 2, .14 + noise(i + 700) * 1.25); if (!q) continue;
    const brightness = (1 - state.clouds * .88) * (.35 + noise(i + 40) * .5) * (environment.motion ? .88 + Math.sin(time * .6 + i) * .12 : 1), size = .65 + noise(i + 90) * 1.5;
    ellipse(q.x, q.y, size, size, `rgba(248,241,210,${brightness})`);
    if (i % 19 === 0) {ctx.beginPath(); ctx.moveTo(q.x - 4, q.y); ctx.lineTo(q.x + 4, q.y); ctx.moveTo(q.x, q.y - 4); ctx.lineTo(q.x, q.y + 4); ctx.strokeStyle = `rgba(248,241,210,${brightness * .6})`; ctx.lineWidth = .8; ctx.stroke();}
  }
  if (state.available && state.clouds < .93) {
    const bearing = state.isDay ? state.dayProgress * Math.PI : .8 + state.nightProgress * Math.PI;
    const elevation = state.isDay ? .12 + Math.sin(state.dayProgress * Math.PI) * .9 : .65;
    const q = project(bearing, elevation);
    if (q) {const radius = Math.min(48, q.scale * .031), alpha = Math.max(.15, 1 - state.clouds * .75);
      ellipse(q.x, q.y, radius * 1.8, radius * 1.8, `rgba(242,215,155,${alpha * .1})`);
      ellipse(q.x, q.y, radius * 1.3, radius * 1.3, `rgba(246,225,175,${alpha * .18})`);
      ellipse(q.x, q.y, radius, radius, state.isDay ? `rgba(236,208,142,${alpha})` : `rgba(242,235,206,${alpha})`);
      ellipse(q.x - radius * .15, q.y - radius * .15, radius * .73, radius * .73, state.isDay ? `rgba(250,235,186,${alpha})` : `rgba(250,246,224,${alpha * .5})`);
    }
  }
  const cloudCount = Math.ceil(state.clouds * 20);
  for (let i = 0; i < cloudCount; i++) {
    const bearing = noise(i + 91) * Math.PI * 2 + time * (.0002 + Math.min(80, state.wind) * .000006), q = project(bearing, .16 + noise(i + 23) * .57); if (!q) continue;
    const size = Math.min(width * .24, q.scale * (.07 + noise(i + 50) * .06)), alpha = .35 + state.clouds * .35;
    const shade = state.isDay ? state.rain ? `rgba(154,180,175,${alpha})` : `rgba(242,245,231,${alpha})` : `rgba(94,124,120,${alpha})`;
    ellipse(q.x, q.y + size * .08, size * 1.25, size * .25, shade);
    for (let j = 0; j < 4; j++) ellipse(q.x + (j - 1.5) * size * .43, q.y - size * (.02 + noise(i * 7 + j) * .14), size * (.38 + noise(i + j + 9) * .14), size * (.27 + noise(i * 3 + j) * .12), shade);
    ellipse(q.x + size * .08, q.y + size * .16, size * .85, size * .10, state.isDay ? 'rgba(195,210,194,.18)' : 'rgba(38,66,69,.12)');
  }
  return state;
}
