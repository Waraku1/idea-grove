import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {readFileSync} from 'node:fs';
import {handlePublicRequest, SESSION_COOKIE, signClaims, safeReturn, verifyClaims} from '../deployment/auth.ts';

const origin = 'https://idea-grove.example.workers.dev', now = 1791200000;
const env = {PUBLIC_ORIGIN: origin, GITHUB_CLIENT_ID: 'test-client', GITHUB_CLIENT_SECRET: 'test-secret', SESSION_SECRET: 'test-session-secret-32-bytes-minimum-000000000000', OWNER_GITHUB_ID: '153403020', DB: {}};
const request = (path = '/', options = {}) => new Request(origin + path, options);
const dispatch = async r => Response.json({id: r.headers.get('oai-authenticated-user-id'), email: r.headers.get('oai-authenticated-user-email'), login: r.headers.get('grove-auth-login'), provider: r.headers.get('grove-auth-provider')});
const claims = (overrides = {}) => ({v: 1, purpose: 'session', iss: origin, iat: now, exp: now + 3600, githubId: '153403020', login: 'Waraku1', name: null, ...overrides});
const sessionHeader = async (overrides = {}) => SESSION_COOKIE + '=' + await signClaims(claims(overrides), env.SESSION_SECRET);
function responseCookie(response, name) {
  return response.headers.getSetCookie().find(c => c.startsWith(name + '='))?.split(';')[0];
}

test('the public gateway strips forged identity headers before dispatch and denies unsigned APIs', async () => {
  const headers = {'oai-authenticated-user-id': 'victim', 'oai-authenticated-user-email': 'victim@example.test', 'grove-auth-login': 'Waraku1', 'grove-auth-provider': 'github'};
  const home = await handlePublicRequest(request('/', {headers}), env, dispatch, {now});
  assert.deepEqual(await home.json(), {id: null, email: null, login: null, provider: 'github'});
  assert.equal((await handlePublicRequest(request('/api/world', {headers}), env, dispatch, {now})).status, 401);
  assert.equal(home.headers.get('cache-control'), 'private, no-store');
});
test('sessions verify signature, purpose, origin, lifetime and identity shape', async () => {
  const valid = await signClaims(claims(), env.SESSION_SECRET);
  assert.ok(await verifyClaims(valid, env.SESSION_SECRET, origin, 'session', now));
  const payload = valid.split('.')[0], altered = await signClaims(claims({githubId: '999'}), 'a-different-test-secret-0000000000000000000000000');
  for (const token of [payload + '.invalid', altered, await signClaims(claims({purpose: 'oauth'}), env.SESSION_SECRET), await signClaims(claims({exp: now}), env.SESSION_SECRET), await signClaims(claims({iat: now + 100}), env.SESSION_SECRET), await signClaims(claims({exp: now + 8 * 86400}), env.SESSION_SECRET)]) assert.equal(await verifyClaims(token, env.SESSION_SECRET, origin, 'session', now), null);
  assert.equal(await verifyClaims(valid, env.SESSION_SECRET, 'https://elsewhere.example', 'session', now), null);
  const malformed = await sessionHeader({githubId: 'victim'});
  assert.equal((await handlePublicRequest(request('/api/world', {headers: {cookie: malformed}}), env, dispatch, {now})).status, 401);
});
test('a verified user is keyed by stable GitHub ID and cannot override it with headers', async () => {
  const cookie = await sessionHeader({login: 'New-name'});
  const response = await handlePublicRequest(request('/api/world', {headers: {cookie, 'oai-authenticated-user-id': 'another-user'}}), env, dispatch, {now});
  assert.deepEqual(await response.json(), {id: 'github:153403020', email: null, login: 'New-name', provider: 'github'});
  assert.equal((await handlePublicRequest(request('/api/world', {headers: {cookie: cookie + '; ' + cookie}}), env, dispatch, {now})).status, 401);
});
test('sign-in uses state, PKCE and secure cookies without requesting email or repository permissions', async () => {
  const response = await handlePublicRequest(request('/auth/sign-in?return_to=/settings'), env, dispatch, {now});
  const target = new URL(response.headers.get('location'));
  assert.equal(target.origin, 'https://github.com');
  assert.equal(target.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(target.searchParams.get('code_challenge').length, 43);
  assert.equal(target.searchParams.get('redirect_uri'), origin + '/auth/callback');
  assert.equal(target.searchParams.has('scope'), false);
  const cookie = response.headers.getSetCookie()[0];
  assert.match(cookie, /HttpOnly; Secure; SameSite=Lax/);
  assert.match(cookie, /Max-Age=600/);
  const prefetch = await handlePublicRequest(request('/auth/sign-in', {headers: {purpose: 'prefetch'}}), env, dispatch, {now});
  assert.equal(prefetch.status, 204);
});
async function signInFlow(profile = {id: 153403020, login: 'Waraku1', name: 'Waraku'}) {
  const begin = await handlePublicRequest(request('/auth/sign-in?return_to=/'), env, dispatch, {now});
  const state = new URL(begin.headers.get('location')).searchParams.get('state');
  const oauthCookie = responseCookie(begin, '__Host-grove-oauth');
  const calls = [];
  const fetcher = async (url, options) => {
    calls.push([url, options]);
    return Response.json(url.includes('/access_token') ? {access_token: 'ephemeral-provider-token', token_type: 'bearer'} : profile);
  };
  const callback = await handlePublicRequest(request('/auth/callback?code=temporary-code&state=' + state, {headers: {cookie: oauthCookie}}), env, dispatch, {now, fetch: fetcher});
  return {begin, state, oauthCookie, calls, callback};
}
test('OAuth callback exchanges a code only after browser state validation and uses the verified profile', async () => {
  const {callback, calls} = await signInFlow();
  assert.equal(callback.status, 303);
  assert.equal(calls.length, 2);
  assert.equal(calls[0][1].body.get('redirect_uri'), origin + '/auth/callback');
  assert.equal(calls[0][1].body.get('code_verifier').length, 43);
  const session = responseCookie(callback, SESSION_COOKIE);
  assert.ok(session);
  assert.equal(session.includes('ephemeral-provider-token'), false);
  assert.equal((await handlePublicRequest(request('/api/world', {headers: {cookie: session}}), env, dispatch, {now})).status, 200);
  const bad = await signInFlow({id: 'untrusted-string', login: 'Waraku1'});
  assert.equal(bad.callback.status, 503);
  assert.equal(responseCookie(bad.callback, SESSION_COOKIE), undefined);
});
test('invalid, expired and missing OAuth state never reaches the provider', async () => {
  const {oauthCookie} = await signInFlow();
  let calls = 0;
  const fetcher = async () => {calls++; throw new Error('must not fetch');};
  for (const [cookie, time] of [[oauthCookie, now], ['', now], [oauthCookie, now + 601]]) {
    const r = await handlePublicRequest(request('/auth/callback?code=x&state=wrong', {headers: {cookie}}), env, dispatch, {now: time, fetch: fetcher});
    assert.equal(r.status, 400);
  }
  assert.equal(calls, 0);
});
test('return paths cannot leave the origin or loop through authentication', () => {
  for (const value of ['https://evil.example', '//evil.example', '/\\evil.example', '/auth/sign-in', '/auth/callback', '/signin-with-chatgpt', '/signout-with-chatgpt', '/admin', null]) assert.equal(safeReturn(value), '/');
  assert.equal(safeReturn('/?panel=settings#backup'), '/?panel=settings#backup');
});
test('cross-origin writes and GET sign-out are denied; same-origin POST clears the session', async () => {
  const cookie = await sessionHeader();
  const bad = await handlePublicRequest(request('/api/world', {method: 'POST', headers: {cookie, origin: 'https://evil.example'}}), env, dispatch, {now});
  assert.equal(bad.status, 403);
  assert.equal((await handlePublicRequest(request('/auth/sign-out', {headers: {cookie}}), env, dispatch, {now})).status, 405);
  const out = await handlePublicRequest(request('/auth/sign-out', {method: 'POST', headers: {cookie, origin}}), env, dispatch, {now});
  assert.equal(out.status, 303);
  assert.ok(out.headers.getSetCookie().every(c => c.includes('Max-Age=0')));
});
test('management access is restricted to the configured stable owner ID', async () => {
  assert.equal((await handlePublicRequest(request('/api/admin/status'), env, dispatch, {now})).status, 401);
  const member = await sessionHeader({githubId: '100', login: 'Member'});
  assert.equal((await handlePublicRequest(request('/api/admin/status', {headers: {cookie: member}}), env, dispatch, {now})).status, 403);
  const owner = await sessionHeader();
  const response = await handlePublicRequest(request('/api/admin/status', {headers: {cookie: owner}}), env, dispatch, {now});
  assert.equal(response.status, 200);
  assert.equal((await response.json()).administrator, 'Waraku1');
  assert.equal((await handlePublicRequest(request('/admin', {headers: {cookie: owner}}), {...env, OWNER_GITHUB_ID: undefined}, dispatch, {now})).status, 403);
});
test('maintenance blocks saves while leaving private reads available; failures keep secrets out of responses', async () => {
  const cookie = await sessionHeader(), paused = {...env, APP_READ_ONLY: 'true'};
  const write = await handlePublicRequest(request('/api/world', {method: 'POST', headers: {cookie, origin}}), paused, dispatch, {now});
  assert.equal(write.status, 503);
  assert.equal(write.headers.get('retry-after'), '3600');
  assert.equal((await handlePublicRequest(request('/api/world', {headers: {cookie}}), paused, dispatch, {now})).status, 200);
  const failed = await handlePublicRequest(request('/api/world', {headers: {cookie}}), env, async () => {throw new Error('database and secret details');}, {now});
  assert.equal(failed.status, 503);
  assert.equal((await failed.text()).includes('secret details'), false);
  assert.equal((await handlePublicRequest(new Request('https://preview.example/'), env, dispatch, {now})).status, 421);
  assert.equal((await handlePublicRequest(request('/'), {}, dispatch, {now})).status, 503);
});
test('account erasure deletes only the verified owner and records a recovery marker atomically', async () => {
  const sql = new DatabaseSync(':memory:');
  sql.exec(readFileSync('drizzle/0000_icy_red_hulk.sql', 'utf8'));
  sql.exec(readFileSync('deployment/0001_account_erasures.sql', 'utf8'));
  for (const id of ['github:153403020', 'github:100']) {
    sql.prepare('INSERT INTO worlds VALUES (?, ?, 1, ?)').run(id, '{}', '2026-10-01T00:00:00.000Z');
    sql.prepare('INSERT INTO world_events VALUES (?, 1, ?, ?, ?)').run(id, '[]', '2026-10-01T00:00:00.000Z', 'Private change');
  }
  const db = {prepare(query) {let args; return {bind(...values) {args = values; return this;}, run() {return sql.prepare(query).run(...args);}};}, async batch(statements) {sql.exec('BEGIN IMMEDIATE');try {const r = statements.map(s => s.run());sql.exec('COMMIT');return r;} catch(e) {sql.exec('ROLLBACK');throw e;}}};
  const cookie = await sessionHeader(), headers = {cookie, origin, 'x-grove-confirm-delete': 'delete-world-and-history'};
  const result = await handlePublicRequest(request('/api/account', {method: 'DELETE', headers}), {...env, DB: db}, dispatch, {now});
  assert.equal(result.status, 200);
  assert.deepEqual(sql.prepare('SELECT owner_id FROM worlds').all().map(r => r.owner_id), ['github:100']);
  assert.deepEqual(sql.prepare('SELECT owner_id FROM world_events').all().map(r => r.owner_id), ['github:100']);
  assert.equal(sql.prepare('SELECT owner_id FROM account_erasures').get().owner_id, 'github:153403020');
  assert.match(result.headers.getSetCookie()[0], /Max-Age=0/);
  assert.equal((await handlePublicRequest(request('/api/account', {method: 'DELETE', headers: {cookie, origin}}), {...env, DB: db}, dispatch, {now})).status, 400);
  const otherCookie = await sessionHeader({githubId: '100', login: 'Member'});
  const broken = {...db, async batch(statements) {sql.exec('BEGIN IMMEDIATE');try {statements[0].run();statements[1].run();throw new Error('simulated write failure');} finally {sql.exec('ROLLBACK');}}};
  assert.equal((await handlePublicRequest(request('/api/account', {method: 'DELETE', headers: {...headers, cookie: otherCookie}}), {...env, DB: broken}, dispatch, {now})).status, 503);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM worlds').get().n, 1);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM world_events').get().n, 1);
  assert.equal(sql.prepare('SELECT count(*) AS n FROM account_erasures').get().n, 1);
  sql.close();
});
