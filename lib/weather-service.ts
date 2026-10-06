import {forecastURL, parseForecast, roundCoordinate, WEATHER_REFRESH_MS, type WeatherSnapshot, type WeatherLocation} from './weather.ts';

const cache = new Map<string, {at: number; data: WeatherSnapshot}>(), pending = new Map<string, Promise<WeatherSnapshot>>();
async function fetchJSON(url: URL, fetcher: typeof fetch) {
  const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
  try {const response = await fetcher(url, {signal: controller.signal, headers: {Accept: 'application/json'}}); if (!response.ok) throw new Error('Weather service unavailable.'); return await response.json();} finally {clearTimeout(timer);}
}

export async function currentWeather(latitude: number, longitude: number, fetcher: typeof fetch = fetch, now = Date.now()) {
  latitude = roundCoordinate(latitude); longitude = roundCoordinate(longitude);
  const key = `${latitude},${longitude}`, hit = cache.get(key);
  if (hit && now - hit.at < WEATHER_REFRESH_MS) return hit.data;
  if (pending.has(key)) return pending.get(key)!;
  const work = (async () => {
    const data = parseForecast(await fetchJSON(forecastURL(latitude, longitude), fetcher), latitude, longitude, now);
    if (cache.size >= 128) cache.delete(cache.keys().next().value!);
    cache.set(key, {at: now, data}); return data;
  })();
  pending.set(key, work);
  try {return await work;} finally {pending.delete(key);}
}

export async function searchLocations(query: string, fetcher: typeof fetch = fetch): Promise<WeatherLocation[]> {
  const url = new URL('https://geocoding-api.open-meteo.com/v1/search');
  url.search = new URLSearchParams({name: query, count: '6', language: 'en', format: 'json'}).toString();
  const body = await fetchJSON(url, fetcher) as {results?: Record<string, unknown>[]};
  return (body.results ?? []).filter(r => typeof r.latitude === 'number' && Number.isFinite(r.latitude) && Math.abs(r.latitude) <= 90 && typeof r.longitude === 'number' && Number.isFinite(r.longitude) && Math.abs(r.longitude) <= 180 && typeof r.name === 'string' && typeof r.timezone === 'string').map(r => ({label: [...new Set([r.name, r.admin1, r.country].filter(v => typeof v === 'string' && v))].join(', ').slice(0, 120), latitude: roundCoordinate(r.latitude as number), longitude: roundCoordinate(r.longitude as number), timezone: r.timezone as string}));
}
