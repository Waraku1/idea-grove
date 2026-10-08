'use client';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Cloud, CloudRain, Moon, Sun, MapPin, Search, LocateFixed, RotateCcw, X} from 'lucide-react';
import {DEFAULT_LOCATION, locationSchema, weatherSchema, skyState, roundCoordinate, WEATHER_MAX_AGE_MS, WEATHER_REFRESH_MS, type WeatherLocation, type WeatherSnapshot} from '../lib/weather';

export function useWeather(userKey: string, signedIn: boolean) {
  const key = `idea-grove-sky-v1-${userKey}`, [location, setLocationState] = useState(DEFAULT_LOCATION), [weather, setWeather] = useState<WeatherSnapshot | null>(null), [animated, setAnimated] = useState(true), [reduced, setReduced] = useState(false), [ready, setReady] = useState(false), [loading, setLoading] = useState(false), [error, setError] = useState(''), [clock, setClock] = useState(Date.now);
  const request = useRef(0), controller = useRef<AbortController | null>(null), latest = useRef(weather); latest.current = weather;
  useEffect(() => {
    setReady(false); setWeather(null); setError(''); let place = DEFAULT_LOCATION;
    try {const saved = JSON.parse(localStorage.getItem(key) ?? 'null'); if (saved) {place = locationSchema.parse(saved.location); setAnimated(saved.animated !== false);} else setAnimated(true);} catch {}
    setLocationState(place);
    try {const saved = weatherSchema.parse(JSON.parse(localStorage.getItem(key + '-weather') ?? 'null')); if (saved.latitude === place.latitude && saved.longitude === place.longitude && Date.now() - saved.observedAt <= WEATHER_MAX_AGE_MS) setWeather(saved);} catch {}
    setReady(true);
  }, [key]);
  useEffect(() => {if (ready) try {localStorage.setItem(key, JSON.stringify({location, animated}));} catch {}}, [key, ready, location, animated]);
  useEffect(() => {const media = matchMedia('(prefers-reduced-motion: reduce)'), update = () => setReduced(media.matches); update(); media.addEventListener('change', update); return () => media.removeEventListener('change', update);}, []);
  useEffect(() => {const timer = setInterval(() => {if (!document.hidden) setClock(Date.now());}, 60000); return () => clearInterval(timer);}, []);
  const refresh = useCallback(async () => {
    if (!ready || !signedIn) {if (ready && !signedIn) setError('Sign in to sync local weather.'); return;}
    const serial = ++request.current; controller.current?.abort(); const abort = new AbortController(); controller.current = abort;
    setLoading(true); setError(''); const timer = setTimeout(() => abort.abort(), 15000);
    try {
      const response = await fetch(`/api/weather?lat=${location.latitude}&lon=${location.longitude}`, {cache: 'no-store', signal: abort.signal}), body = await response.json() as {error?: string; weather?: unknown};
      if (!response.ok) throw new Error(body.error ?? 'Could not sync the weather.');
      const data = weatherSchema.parse(body.weather);
      if (serial === request.current) {setWeather(data); setClock(Date.now()); try {localStorage.setItem(key + '-weather', JSON.stringify(data));} catch {}}
    } catch (e) {if (serial === request.current) setError(e instanceof Error && e.name !== 'AbortError' ? e.message : 'Weather is temporarily unavailable. Try again shortly.');}
    finally {clearTimeout(timer); if (serial === request.current) setLoading(false);}
  }, [ready, signedIn, location, key]);
  useEffect(() => {
    if (!ready) return;
    void refresh(); const timer = setInterval(() => {if (!document.hidden) void refresh();}, WEATHER_REFRESH_MS);
    const resume = () => {if (!document.hidden) {setClock(Date.now()); if (!latest.current || Date.now() - latest.current.receivedAt >= WEATHER_REFRESH_MS) void refresh();}};
    document.addEventListener('visibilitychange', resume);
    return () => {clearInterval(timer); document.removeEventListener('visibilitychange', resume); request.current++; controller.current?.abort();};
  }, [ready, refresh]);
  const setLocation = (place: WeatherLocation) => {request.current++; controller.current?.abort(); setWeather(null); setError(''); setLocationState(locationSchema.parse({...place, latitude: roundCoordinate(place.latitude), longitude: roundCoordinate(place.longitude)}));};
  const sky = useMemo(() => ({weather, timezone: weather?.timezone ?? location.timezone, motion: animated && !reduced, now: clock}), [weather, location.timezone, animated, reduced, clock]);
  return {location, setLocation, weather, animated, setAnimated, reduced, loading, error, refresh, sky, signedIn, clock};
}

export default function WeatherControl({controller}: {controller: ReturnType<typeof useWeather>}) {
  const [open, setOpen] = useState(false), [query, setQuery] = useState(''), [results, setResults] = useState<WeatherLocation[]>([]), [searching, setSearching] = useState(false), [message, setMessage] = useState(''), [locating, setLocating] = useState(false), wrapper = useRef<HTMLDivElement>(null), searchSerial = useRef(0);
  const {location, weather, sky, loading, error, clock} = controller;
  const state = skyState(weather, clock, sky.timezone), fresh = weather && state.available, label = fresh ? state.label : loading ? 'Syncing sky…' : 'Time of day only';
  const Icon = fresh ? !state.isDay ? Moon : state.rain ? CloudRain : state.clouds > .35 ? Cloud : Sun : Cloud;
  useEffect(() => {if (!open) return; const close = (e: PointerEvent) => {if (!wrapper.current?.contains(e.target as Node)) setOpen(false);}; const key = (e: KeyboardEvent) => {if (e.key === 'Escape') {e.stopPropagation(); setOpen(false);}}; window.addEventListener('pointerdown', close); wrapper.current?.addEventListener('keydown', key); return () => {window.removeEventListener('pointerdown', close); wrapper.current?.removeEventListener('keydown', key);};}, [open]);
  const search = async (e: React.FormEvent) => {
    e.preventDefault(); if (query.trim().length < 2) {setMessage('Enter at least two characters.'); return;}
    const serial = ++searchSerial.current; setSearching(true); setMessage(''); setResults([]);
    try {const response = await fetch('/api/weather/locations?q=' + encodeURIComponent(query.trim())), body = await response.json() as {error?: string; locations?: unknown[]}; if (!response.ok) throw new Error(body.error ?? 'Could not search for places.'); const places = (body.locations ?? []).map(p => locationSchema.parse(p)); if (serial === searchSerial.current) {setResults(places); if (!places.length) setMessage('No places found. Try the city and country.');}}
    catch (e) {if (serial === searchSerial.current) setMessage(e instanceof Error ? e.message : 'Could not search for places.');}
    finally {if (serial === searchSerial.current) setSearching(false);}
  };
  const locate = () => {
    if (!navigator.geolocation) {setMessage('This browser cannot provide a location. Search for a city instead.'); return;}
    setLocating(true); setMessage('');
    navigator.geolocation.getCurrentPosition(position => {controller.setLocation({label: 'Current area', latitude: position.coords.latitude, longitude: position.coords.longitude, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone}); setLocating(false); setOpen(false);}, () => {setMessage('Location could not be obtained. You can choose a city instead.'); setLocating(false);}, {enableHighAccuracy: false, timeout: 10000, maximumAge: WEATHER_REFRESH_MS});
  };
  return <div className="weather-control" ref={wrapper}>
    <button className="weather-pill" onClick={() => setOpen(!open)} aria-expanded={open} aria-label="Sky and weather location"><Icon size={15}/><span>{location.label.split(',')[0]}</span><i/><span>{error && fresh ? 'Last known · ' : ''}{label}</span>{fresh && <b>{Math.round(weather.temperature)}°</b>}</button>
    {open && <section className="weather-popover" aria-label="Sky and local weather">
      <div className="weather-title"><div><span className="tiny-label">THE SKY ABOVE YOUR GROVE</span><h3>Local weather</h3></div><button onClick={() => setOpen(false)} aria-label="Close weather settings"><X size={16}/></button></div>
      <p className="small muted">{location.label}{fresh ? ` · ${Math.round(weather.temperature)}°C · ${label}` : ''}</p>
      {fresh && <p className="weather-updated">Updated {new Date(weather.observedAt).toLocaleTimeString('en-US', {timeZone: weather.timezone, hour: 'numeric', minute: '2-digit'})} · {weather.timezone}</p>}
      {error && <p className="weather-message" role="status">{error}</p>}
      <form onSubmit={e => void search(e)} className="weather-search"><label className="sr-only" htmlFor="weather-city">Weather city</label><input id="weather-city" value={query} maxLength={80} onChange={e => {searchSerial.current++; setQuery(e.target.value); setResults([]); setMessage(''); setSearching(false);}} placeholder="Search city, country"/><button disabled={searching || !controller.signedIn} aria-label="Search weather locations"><Search size={15}/></button></form>
      {searching && <p className="small muted">Searching…</p>}
      {results.length > 0 && <div className="weather-results">{results.map(place => <button key={`${place.latitude},${place.longitude}`} onClick={() => {controller.setLocation(place); setOpen(false); setResults([]);}}><MapPin size={13}/><span>{place.label}</span></button>)}</div>}
      {message && <p className="weather-message" role="status">{message}</p>}
      <div className="weather-actions"><button className="text-button" onClick={locate} disabled={locating || !controller.signedIn}><LocateFixed size={14}/>{locating ? 'Locating…' : 'Use my location'}</button><button className="text-button" onClick={() => void controller.refresh()} disabled={loading || !controller.signedIn}><RotateCcw size={13}/>{loading ? 'Syncing…' : 'Refresh'}</button></div>
      <label className="checkbox-label"><input type="checkbox" checked={controller.animated} onChange={e => controller.setAnimated(e.target.checked)}/>Animate clouds and precipitation</label>
      <p className="weather-credit">Weather by <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer">Open-Meteo</a> · CC BY 4.0</p>
    </section>}
  </div>;
}
