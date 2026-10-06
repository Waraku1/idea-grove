import {z} from 'zod';

export const WEATHER_REFRESH_MS = 15 * 60 * 1000, WEATHER_MAX_AGE_MS = 3 * 60 * 60 * 1000;
const timezoneSchema = z.string().min(1).max(80).refine(zone => {try {new Intl.DateTimeFormat('en', {timeZone: zone}); return true;} catch {return false;}}, 'Invalid time zone.');
export const locationSchema = z.object({label: z.string().min(1).max(120), latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), timezone: timezoneSchema});
export type WeatherLocation = z.infer<typeof locationSchema>;
export const DEFAULT_LOCATION: WeatherLocation = {label: 'Tokyo, Japan', latitude: 35.68, longitude: 139.76, timezone: 'Asia/Tokyo'};
export const weatherSchema = z.object({
  latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), timezone: timezoneSchema,
  temperature: z.number().finite().min(-100).max(70), cloudCover: z.number().finite().min(0).max(100), precipitation: z.number().finite().nonnegative().max(500), snowfall: z.number().finite().nonnegative().max(100),
  windSpeed: z.number().finite().nonnegative().max(500), windDirection: z.number().finite().min(0).max(360), code: z.number().int().min(0).max(99), isDay: z.boolean(),
  observedAt: z.number().finite().positive(), receivedAt: z.number().finite().positive(), sunrise: z.number().finite().nullable(), sunset: z.number().finite().nullable(),
});
export type WeatherSnapshot = z.infer<typeof weatherSchema>;
export type SkyState = {available: boolean; isDay: boolean; clouds: number; rain: number; snow: number; wind: number; windDirection: number; dayProgress: number; nightProgress: number; label: string};

export const roundCoordinate = (n: number) => Math.round(n * 100) / 100;
export function weatherLabel(w: Pick<WeatherSnapshot, 'code' | 'isDay' | 'cloudCover'>) {
  if ([71, 73, 75, 77, 85, 86].includes(w.code)) return 'Snow';
  if ([95, 96, 99].includes(w.code)) return 'Thunderstorms';
  if ([51, 53, 55, 56, 57].includes(w.code)) return 'Drizzle';
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(w.code)) return 'Rain';
  if ([45, 48].includes(w.code)) return 'Fog';
  if (w.code === 3 || w.cloudCover > 80) return 'Overcast';
  if (w.code === 2 || w.cloudCover > 35) return 'Partly cloudy';
  return w.isDay ? 'Clear skies' : 'Clear night';
}

export function parseForecast(data: unknown, latitude: number, longitude: number, now = Date.now()): WeatherSnapshot {
  const raw = z.object({timezone: z.string(), current: z.object({time: z.number(), temperature_2m: z.number(), cloud_cover: z.number(), precipitation: z.number(), snowfall: z.number(), wind_speed_10m: z.number(), wind_direction_10m: z.number(), weather_code: z.number(), is_day: z.union([z.literal(0), z.literal(1)])}), daily: z.object({sunrise: z.array(z.number().nullable()), sunset: z.array(z.number().nullable())}).optional()}).parse(data);
  try {new Intl.DateTimeFormat('en', {timeZone: raw.timezone});} catch {throw new Error('Invalid weather time zone.');}
  const c = raw.current;
  const parsed = weatherSchema.parse({latitude, longitude, timezone: raw.timezone, temperature: c.temperature_2m, cloudCover: c.cloud_cover, precipitation: c.precipitation, snowfall: c.snowfall, windSpeed: c.wind_speed_10m, windDirection: c.wind_direction_10m, code: c.weather_code, isDay: c.is_day === 1, observedAt: c.time * 1000, receivedAt: now, sunrise: raw.daily?.sunrise[0] ? raw.daily.sunrise[0] * 1000 : null, sunset: raw.daily?.sunset[0] ? raw.daily.sunset[0] * 1000 : null});
  if (now - parsed.observedAt > WEATHER_MAX_AGE_MS || parsed.observedAt - now > 30 * 60 * 1000) throw new Error('Weather data is out of date.');
  return parsed;
}

export function skyState(snapshot: WeatherSnapshot | null, now = Date.now(), timezone = 'Asia/Tokyo'): SkyState {
  let hour = 12;
  try {hour = Number(new Intl.DateTimeFormat('en-US', {timeZone: snapshot?.timezone ?? timezone, hour: 'numeric', hourCycle: 'h23'}).format(now));} catch {}
  const w = snapshot && now - snapshot.observedAt <= WEATHER_MAX_AGE_MS && snapshot.observedAt - now < 30 * 60 * 1000 ? snapshot : null;
  const validSun = w?.sunrise && w?.sunset && w.sunset > w.sunrise;
  const isDay = w ? validSun ? now >= w.sunrise! && now < w.sunset! : w.isDay : hour >= 6 && hour < 18;
  const phase = validSun ? (now - w.sunrise!) / (w.sunset! - w.sunrise!) : (hour - 6) / 12;
  const label = w ? weatherLabel({...w, isDay}) : 'Time of day only';
  const rainCode = w && [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(w.code);
  const snowCode = w && [71, 73, 75, 77, 85, 86].includes(w.code);
  return {available: !!w, isDay, clouds: w ? Math.max(w.cloudCover / 100, rainCode || snowCode || [45, 48].includes(w.code) ? .65 : 0) : 0,
    rain: w && !snowCode && (rainCode || w.precipitation > .02) ? Math.min(1, .2 + w.precipitation / 3) : 0,
    snow: w && (snowCode || w.snowfall > 0) ? Math.min(1, .2 + w.snowfall / 2) : 0,
    wind: w?.windSpeed ?? 0, windDirection: w?.windDirection ?? 0, dayProgress: Math.min(1, Math.max(0, phase)), nightProgress: ((hour + 6) % 24) / 12, label};
}

export function forecastURL(latitude: number, longitude: number) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({latitude: String(roundCoordinate(latitude)), longitude: String(roundCoordinate(longitude)), current: 'temperature_2m,is_day,precipitation,snowfall,weather_code,cloud_cover,wind_speed_10m,wind_direction_10m', daily: 'sunrise,sunset', timezone: 'auto', timeformat: 'unixtime', forecast_days: '1'}).toString();
  return url;
}
