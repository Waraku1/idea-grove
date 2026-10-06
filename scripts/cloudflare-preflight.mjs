import {readFile} from 'node:fs/promises';

const accountPattern = /^[a-f0-9]{32}$/;
const databasePattern = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
export function validateTarget(target) {
  if (!target || !accountPattern.test(target.account_id ?? '')) throw new Error('Set a real Cloudflare Free account ID in deployment/cloudflare.local.json.');
  if (!databasePattern.test(target.database_id ?? '') || target.database_id === '00000000-0000-4000-8000-000000000000') throw new Error('Set the production D1 database ID.');
  if (!/^[a-z0-9][a-z0-9-]{0,62}$/.test(target.name ?? '')) throw new Error('Set a valid Worker name.');
  const vars = target.vars ?? {}, origin = new URL(vars.PUBLIC_ORIGIN ?? '');
  if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.workers.dev') || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash || origin.port || origin.hostname.includes('replace_') || !origin.hostname.startsWith(target.name + '.')) throw new Error('Use the free workers.dev hostname of this Worker.');
  if (!vars.GITHUB_CLIENT_ID || /REPLACE_/i.test(vars.GITHUB_CLIENT_ID) || !/^[1-9]\d{0,19}$/.test(vars.OWNER_GITHUB_ID ?? '')) throw new Error('Configure GitHub sign-in and the stable owner ID.');
  if (!['true', 'false'].includes(vars.APP_READ_ONLY)) throw new Error('APP_READ_ONLY must be true or false.');
  const allowed = ['PUBLIC_ORIGIN', 'GITHUB_CLIENT_ID', 'OWNER_GITHUB_ID', 'APP_READ_ONLY', 'APP_VERSION'];
  if (Object.keys(vars).some(k => !allowed.includes(k))) throw new Error('Unexpected public variable. Store credentials as Cloudflare Worker secrets.');
  if (Object.keys(target).some(k => !['name', 'account_id', 'database_id', 'database_name', 'vars'].includes(k))) throw new Error('Unexpected hosting option. Review the free-only deployment configuration.');
  return target;
}
/** Unknown or paid subscriptions stop release; absence of subscriptions uses Workers Free by default. */
export function validateFreeSubscriptions(result) {
  if (!Array.isArray(result)) throw new Error('Could not verify account subscriptions.');
  for (const subscription of result) {
    const plan = subscription.rate_plan;
    if (!plan || !['free', 'partners_free'].includes(plan.id) || subscription.price !== 0 || plan.is_contract || plan.externally_managed || /paid|standard|bundled|unbound|business|enterprise|pro\b|trial/i.test(plan.public_name ?? '') || !['Provisioned', 'Paid'].includes(subscription.state)) throw new Error('This account has a paid, trial or unverified subscription. Use a dedicated Workers Free account. No deployment was performed.');
  }
}
export async function preflight(fetcher = fetch) {
  const target = validateTarget(JSON.parse(await readFile('deployment/cloudflare.local.json', 'utf8')));
  const token = process.env.CLOUDFLARE_API_TOKEN;
  if (!token) throw new Error('A scoped Cloudflare API token is required in the process environment. Do not commit tokens.');
  const get = async path => {
    const response = await fetcher('https://api.cloudflare.com/client/v4/accounts/' + target.account_id + path, {headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(15000)});
    if (!response.ok) throw new Error('Cloudflare verification failed. Check token permissions; no deployment was performed.');
    const body = await response.json();
    if (!body.success) throw new Error('Cloudflare verification failed; no deployment was performed.');
    return body;
  };
  let page = 1;
  while (true) {
    const body = await get('/subscriptions?per_page=50&page=' + page);
    validateFreeSubscriptions(body.result);
    const total = body.result_info?.total_count;
    if (Number.isSafeInteger(total) ? page * 50 >= total : body.result.length < 50) break;
    if (++page > 20) throw new Error('Subscription verification was incomplete; no deployment was performed.');
  }
  const secrets = await get('/workers/scripts/' + target.name + '/secrets');
  if (!Array.isArray(secrets.result) || !['GITHUB_CLIENT_SECRET', 'SESSION_SECRET'].every(name => secrets.result.some(s => s.name === name))) throw new Error('Prepare the Worker and both authentication secrets before release. See docs/DEPLOYMENT.md.');
  const databaseResponse = await fetcher('https://api.cloudflare.com/client/v4/accounts/' + target.account_id + '/d1/database/' + target.database_id + '/query', {method: 'POST', headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'}, body: JSON.stringify({sql: "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('worlds', 'world_events', 'account_erasures')"}), signal: AbortSignal.timeout(15000)});
  if (!databaseResponse.ok) throw new Error('Could not verify database migrations. No deployment was performed.');
  const database = await databaseResponse.json();
  const tables = database.result?.[0]?.results?.map(row => row.name) ?? [];
  if (!database.success || !['worlds', 'world_events', 'account_erasures'].every(name => tables.includes(name))) throw new Error('Apply both initial database migrations before release. See docs/DEPLOYMENT.md.');
  console.log('Free account subscriptions, target and secret names verified. No secret values were read.');
  return target;
}
