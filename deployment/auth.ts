/** Standalone hosting authentication. Never trust identity headers from the Internet. */
import type {GroveDatabase} from '../lib/database.ts';
export interface PublicEnv {
  DB?: GroveDatabase;
  PUBLIC_ORIGIN?: string;
  GITHUB_CLIENT_ID?: string;
  GITHUB_CLIENT_SECRET?: string;
  SESSION_SECRET?: string;
  OWNER_GITHUB_ID?: string;
  APP_READ_ONLY?: string;
  APP_VERSION?: string;
  HOSTING_PROVIDER?: 'cloudflare' | 'render';
}

export const SESSION_COOKIE = '__Host-grove-session';
const STATE_COOKIE = '__Host-grove-oauth';
const SESSION_SECONDS = 7 * 24 * 60 * 60;
const OAUTH_SECONDS = 10 * 60;
type Claims = {v: 1; purpose: 'session' | 'oauth'; iss: string; iat: number; exp: number} & Record<string, unknown>;
export type Session = Claims & {githubId: string; login: string; name: string | null};
type Dispatch = (request: Request) => Promise<Response>;
type Options = {now?: number; fetch?: typeof fetch};
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function decode(text: string): Uint8Array<ArrayBuffer> {
  if (!/^[A-Za-z0-9_-]+$/.test(text)) throw new Error('Invalid token');
  return Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - text.length % 4) % 4)), c => c.charCodeAt(0));
}
const bytes = (text: string) => new TextEncoder().encode(text);
const random = () => encode(crypto.getRandomValues(new Uint8Array(32)));
async function key(secret: string) {
  return crypto.subtle.importKey('raw', bytes(secret), {name: 'HMAC', hash: 'SHA-256'}, false, ['sign', 'verify']);
}
export async function signClaims(claims: Claims, secret: string): Promise<string> {
  const payload = encode(bytes(JSON.stringify(claims)));
  return payload + '.' + encode(new Uint8Array(await crypto.subtle.sign('HMAC', await key(secret), bytes(payload))));
}
export async function verifyClaims(token: string | null, secret: string | undefined, origin: string, purpose: Claims['purpose'], now: number): Promise<Claims | null> {
  if (!token || token.length > 3800 || !secret || secret.length < 43) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 2 || !await crypto.subtle.verify('HMAC', await key(secret), decode(parts[1]), bytes(parts[0]))) return null;
    const c = JSON.parse(new TextDecoder().decode(decode(parts[0]))) as Claims;
    const maxAge = purpose === 'session' ? SESSION_SECONDS : OAUTH_SECONDS;
    if (c.v !== 1 || c.purpose !== purpose || c.iss !== origin || !Number.isSafeInteger(c.iat) || !Number.isSafeInteger(c.exp) || c.iat > now + 60 || c.exp <= now || c.exp <= c.iat || c.exp - c.iat > maxAge) return null;
    return c;
  } catch { return null; }
}
function cookie(request: Request, name: string): string | null {
  const matches = (request.headers.get('cookie') ?? '').split(';').map(c => c.trim()).filter(c => c.startsWith(name + '='));
  return matches.length === 1 ? matches[0].slice(name.length + 1) : null;
}
const setCookie = (name: string, value: string, seconds: number) => `${name}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; Secure; SameSite=Lax`;
export function publicOrigin(env: PublicEnv): string | null {
  try {
    const u = new URL(env.PUBLIC_ORIGIN ?? '');
    return u.protocol === 'https:' && !u.username && !u.password && u.pathname === '/' && !u.search && !u.hash ? u.origin : null;
  } catch { return null; }
}
export function safeReturn(value: string | null): string {
  if (!value?.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
  try {
    const u = new URL(value, 'https://return.invalid');
    if (u.origin !== 'https://return.invalid' || /^\/(?:auth(?:\/|$)|(?:signin-with-chatgpt|signout-with-chatgpt|callback|admin)(?:\/|$))/.test(u.pathname)) return '/';
    return u.pathname + u.search + u.hash;
  } catch { return '/'; }
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) => Response.json(body, {status, headers: {'Cache-Control': 'private, no-store', ...headers}});
const fail = (message: string, status: number) => json({error: message}, status);
const redirect = (location: string, cookies: string[] = [], status = 302) => {
  const headers = new Headers({'Location': location, 'Cache-Control': 'private, no-store'});
  cookies.forEach(c => headers.append('Set-Cookie', c));
  return new Response(null, {status, headers});
};
const authReady = (env: PublicEnv) => !!(publicOrigin(env) && env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET && env.SESSION_SECRET && env.SESSION_SECRET.length >= 43);
async function readSession(request: Request, env: PublicEnv, origin: string, now: number): Promise<Session | null> {
  const c = await verifyClaims(cookie(request, SESSION_COOKIE), env.SESSION_SECRET, origin, 'session', now);
  return c && typeof c.githubId === 'string' && /^[1-9]\d{0,19}$/.test(c.githubId) && typeof c.login === 'string' && /^[a-zA-Z0-9-]{1,39}$/.test(c.login) && (c.name === null || typeof c.name === 'string' && c.name.length <= 80) ? c as Session : null;
}
async function beginSignIn(url: URL, request: Request, env: PublicEnv, origin: string, now: number): Promise<Response> {
  if (request.method !== 'GET') return fail('Use a browser sign-in link.', 405);
  if (request.headers.has('next-router-prefetch') || /prefetch/i.test((request.headers.get('purpose') ?? '') + (request.headers.get('sec-purpose') ?? ''))) return new Response(null, {status: 204});
  if (!authReady(env)) return fail('Sign-in is not configured yet. The example grove is still available.', 503);
  const nonce = random(), verifier = random();
  const state = await signClaims({v: 1, purpose: 'oauth', iss: origin, iat: now, exp: now + OAUTH_SECONDS, nonce, verifier, returnTo: safeReturn(url.searchParams.get('return_to'))}, env.SESSION_SECRET!);
  const target = new URL('https://github.com/login/oauth/authorize');
  target.search = new URLSearchParams({client_id: env.GITHUB_CLIENT_ID!, redirect_uri: origin + '/auth/callback', state: nonce, code_challenge: encode(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes(verifier)))), code_challenge_method: 'S256'}).toString();
  return redirect(target.href, [setCookie(STATE_COOKIE, state, OAUTH_SECONDS)]);
}
async function callback(url: URL, request: Request, env: PublicEnv, origin: string, now: number, fetcher: typeof fetch): Promise<Response> {
  if (request.method !== 'GET') return fail('Invalid sign-in callback.', 405);
  if (!authReady(env)) return fail('Sign-in is not configured yet.', 503);
  const clearState = setCookie(STATE_COOKIE, '', 0);
  const invalid = (message: string, status = 400) => {
    const response = fail(message, status); response.headers.append('Set-Cookie', clearState); return response;
  };
  const c = await verifyClaims(cookie(request, STATE_COOKIE), env.SESSION_SECRET, origin, 'oauth', now);
  const code = url.searchParams.get('code');
  if (!c || typeof c.nonce !== 'string' || c.nonce !== url.searchParams.get('state') || typeof c.verifier !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(c.verifier) || !code || code.length > 256 || url.searchParams.has('error')) return invalid('Sign-in expired or was cancelled. Please start again.');
  try {
    const tokenResponse = await fetcher('https://github.com/login/oauth/access_token', {method: 'POST', headers: {'Accept': 'application/json', 'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({client_id: env.GITHUB_CLIENT_ID!, client_secret: env.GITHUB_CLIENT_SECRET!, code, redirect_uri: origin + '/auth/callback', code_verifier: c.verifier}), signal: AbortSignal.timeout(8000)});
    if (!tokenResponse.ok) return invalid('GitHub sign-in is temporarily unavailable. Please try again.', 503);
    const token = await tokenResponse.json() as {access_token?: string; token_type?: string};
    if (!token.access_token || token.token_type?.toLowerCase() !== 'bearer') return invalid('Could not verify sign-in. Please start again.');
    const profileResponse = await fetcher('https://api.github.com/user', {headers: {'Authorization': 'Bearer ' + token.access_token, 'Accept': 'application/vnd.github+json', 'User-Agent': 'Idea-Grove', 'X-GitHub-Api-Version': '2022-11-28'}, signal: AbortSignal.timeout(8000)});
    if (!profileResponse.ok) return invalid('Could not verify your GitHub account.', 503);
    const profile = await profileResponse.json() as {id?: unknown; login?: unknown; name?: unknown};
    if (!Number.isSafeInteger(profile.id) || Number(profile.id) < 1 || typeof profile.login !== 'string' || !/^[a-zA-Z0-9-]{1,39}$/.test(profile.login)) return invalid('Could not verify your GitHub account.', 503);
    const session = await signClaims({v: 1, purpose: 'session', iss: origin, iat: now, exp: now + SESSION_SECONDS, githubId: String(profile.id), login: profile.login, name: typeof profile.name === 'string' ? profile.name.slice(0, 80) : null}, env.SESSION_SECRET!);
    return redirect(origin + safeReturn(typeof c.returnTo === 'string' ? c.returnTo : null), [clearState, setCookie(SESSION_COOKIE, session, SESSION_SECONDS)], 303);
  } catch { return invalid('GitHub sign-in is temporarily unavailable. Please try again.', 503); }
}
const securityHeaders = (response: Response) => {
  const result = new Response(response.body, response);
  result.headers.set('X-Content-Type-Options', 'nosniff');
  result.headers.set('Referrer-Policy', 'no-referrer');
  result.headers.set('Content-Security-Policy', "frame-ancestors 'none'; base-uri 'self'; object-src 'none'");
  return result;
};

/** The gateway is separate from Vinext so its public trust boundary can be tested. */
export async function handlePublicRequest(request: Request, env: PublicEnv, dispatch: Dispatch, options: Options = {}): Promise<Response> {
  const response = await handle(request, env, dispatch, options);
  return securityHeaders(response);
}
async function handle(request: Request, env: PublicEnv, dispatch: Dispatch, options: Options): Promise<Response> {
  const url = new URL(request.url), origin = publicOrigin(env), now = options.now ?? Math.floor(Date.now() / 1000);
  if (!origin) return fail('This deployment is not configured yet.', 503);
  if (url.origin !== origin) return fail('This hostname is not enabled.', 421);
  const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
  if (mutating && (request.headers.get('origin') !== origin || request.headers.get('sec-fetch-site') === 'cross-site')) return fail('This request is not allowed.', 403);
  if (url.pathname === '/auth/sign-in' || url.pathname === '/signin-with-chatgpt') return beginSignIn(url, request, env, origin, now);
  if (url.pathname === '/auth/callback') return callback(url, request, env, origin, now, options.fetch ?? fetch);
  if (url.pathname === '/auth/sign-out') {
    if (request.method !== 'POST') return fail('Use the sign-out button in Settings.', 405);
    return redirect(origin + '/', [setCookie(SESSION_COOKIE, '', 0), setCookie(STATE_COOKIE, '', 0)], 303);
  }
  if (url.pathname === '/healthz') {
    if (request.method !== 'GET' && request.method !== 'HEAD') return fail('Method not allowed.', 405);
    return json({service: 'Idea Grove', version: env.APP_VERSION ?? 'unknown', readOnly: env.APP_READ_ONLY === 'true', authConfigured: authReady(env), storageConfigured: !!env.DB});
  }
  const session = await readSession(request, env, origin, now);
  if (url.pathname === '/session') {
    if (request.method !== 'GET') return fail('Method not allowed.', 405);
    return json({signedIn: !!session, userKey: session ? 'github:' + session.githubId : 'guest'});
  }
  if (url.pathname === '/admin' || url.pathname === '/api/admin/status') {
    if (!session) return fail('Sign-in is required.', 401);
    if (!env.OWNER_GITHUB_ID || session.githubId !== env.OWNER_GITHUB_ID) return fail('Administrator access is required.', 403);
    if (request.method !== 'GET') return fail('Method not allowed.', 405);
    const status = {service: 'Idea Grove', version: env.APP_VERSION ?? 'unknown', readOnly: env.APP_READ_ONLY === 'true', authConfigured: authReady(env), storageConfigured: !!env.DB, administrator: session.login};
    if (url.pathname === '/api/admin/status') return json(status);
    const provider = env.HOSTING_PROVIDER === 'render' ? 'Render' : 'Cloudflare';
    const runbook = env.HOSTING_PROVIDER === 'render' ? 'docs/RENDER_OPERATIONS.md' : 'docs/OPERATIONS.md';
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Idea Grove administration</title><style>body{font:16px system-ui;color:#3c4935;background:#f4f5ed;max-width:760px;margin:60px auto;padding:24px}h1{font-weight:500}dt{margin-top:24px;color:#6b775f}dd{margin:6px 0}a{color:#426448}</style><h1>Idea Grove administration</h1><p>Signed in as ${session.login}. Private thoughts remain in each user's grove.</p><dl><dt>Release</dt><dd>${escapeHtml(status.version)}</dd><dt>Cloud saving</dt><dd>${status.readOnly ? 'Paused — viewing and export remain available' : 'Enabled'}</dd><dt>Authentication</dt><dd>${status.authConfigured ? 'Configured' : 'Needs setup'}</dd><dt>Database binding</dt><dd>${status.storageConfigured ? 'Configured' : 'Needs setup'}</dd></dl><p>Change APP_READ_ONLY in the ${provider} dashboard to pause saving. Usage and billing are checked in your hosting and database dashboards. Follow ${runbook} for backup, recovery and release procedures.</p><p><a href="/">Return to the grove</a></p></html>`;
    return new Response(html, {headers: {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, no-store'}});
  }
  if (url.pathname.startsWith('/api/') && !session) return fail('Sign-in is required.', 401);
  if (url.pathname.startsWith('/api/') && !env.DB) return fail('Cloud storage is temporarily unavailable. Your content draft stays on this device.', 503);
  if (env.APP_READ_ONLY === 'true' && mutating && url.pathname.startsWith('/api/')) return json({error: 'Cloud saving is temporarily paused. Your content draft stays on this device; viewing and backup export remain available.'}, 503, {'Retry-After': '3600'});
  if (url.pathname === '/api/account') {
    if (request.method !== 'DELETE') return fail('Method not allowed.', 405);
    if (request.headers.get('x-grove-confirm-delete') !== 'delete-world-and-history') return fail('Confirm deletion in Settings first.', 400);
    try {
      const owner = 'github:' + session!.githubId;
      if (env.DB!.eraseWorld) await env.DB!.eraseWorld(owner, new Date(now * 1000).toISOString());
      else await env.DB!.batch([
        env.DB!.prepare('INSERT INTO account_erasures (owner_id, erased_at) VALUES (?, ?) ON CONFLICT(owner_id) DO UPDATE SET erased_at = excluded.erased_at').bind(owner, new Date(now * 1000).toISOString()),
        env.DB!.prepare('DELETE FROM world_events WHERE owner_id = ?').bind(owner),
        env.DB!.prepare('DELETE FROM worlds WHERE owner_id = ?').bind(owner),
      ]);
      const response = json({deleted: true});
      response.headers.append('Set-Cookie', setCookie(SESSION_COOKIE, '', 0));
      return response;
    } catch { return fail('Could not delete your grove. Please try again when cloud storage is available.', 503); }
  }
  // Reserved dispatch headers are removed even when no session is present.
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()]) if (name.startsWith('oai-authenticated-') || name.startsWith('grove-auth-')) headers.delete(name);
  headers.set('grove-auth-provider', 'github');
  if (session) {
    headers.set('oai-authenticated-user-id', 'github:' + session.githubId);
    headers.set('grove-auth-login', session.login);
    if (session.name) {
      headers.set('oai-authenticated-user-full-name', encodeURIComponent(session.name));
      headers.set('oai-authenticated-user-full-name-encoding', 'percent-encoded-utf-8');
    }
  }
  try {
    const response = await dispatch(new Request(request, {headers}));
    const protectedResponse = new Response(response.body, response);
    if (!(url.pathname.startsWith('/assets/') && ['GET', 'HEAD'].includes(request.method) && response.headers.get('Cache-Control') === 'public, max-age=31536000, immutable')) protectedResponse.headers.set('Cache-Control', 'private, no-store');
    return protectedResponse;
  } catch {
    return fail('The service is temporarily unavailable. Your content draft stays on this device. Please try again.', 503);
  }
}
function escapeHtml(value: string) { return value.replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]!)); }
