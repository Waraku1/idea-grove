import {spawnSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {preflight} from './cloudflare-preflight.mjs';

function run(args) {
  const result = spawnSync(process.execPath, args, {stdio: 'inherit'});
  if (result.error || result.status !== 0) throw new Error('Release check failed. No further release steps were performed.');
}
try {
  const target = await preflight();
  run(['--experimental-strip-types', '--test', ...['domain', 'architecture', 'walk', 'arrange', 'terrain', 'weather', 'api', 'public-auth', 'deployment'].map(name => 'tests/' + name + '.test.mjs')]);
  run(['node_modules/typescript/bin/tsc', '--noEmit']);
  run(['--import', './scripts/sites-env.mjs', 'node_modules/vite/bin/vite.js', 'build', '--config', 'vite.cloudflare.config.ts']);
  const config = JSON.parse(await readFile('dist/server/wrangler.json', 'utf8'));
  if (config.name !== target.name || config.account_id !== target.account_id || config.d1_databases?.length !== 1 || config.d1_databases[0].database_id !== target.database_id || config.r2_buckets?.length || config.kv_namespaces?.length || config.queues?.producers?.length || config.queues?.consumers?.length || config.durable_objects?.bindings?.length || config.services?.length || config.ai || config.analytics_engine_datasets?.length || config.observability?.enabled || config.assets?.run_worker_first === true) throw new Error('The built configuration differs from the reviewed free-only target.');
  // A second billing check narrows the interval between verification and publishing.
  await preflight();
  run(['--import', './scripts/sites-env.mjs', 'node_modules/wrangler/bin/wrangler.js', 'deploy', '--config', 'dist/server/wrangler.json']);
  const response = await fetch(target.vars.PUBLIC_ORIGIN + '/healthz', {signal: AbortSignal.timeout(15000)});
  const health = await response.json();
  if (!response.ok || health.service !== 'Idea Grove' || !health.authConfigured || !health.storageConfigured || health.version !== target.vars.APP_VERSION) throw new Error('Deployment returned, but its health check needs review. Check the Cloudflare dashboard before announcing the release.');
  console.log('Public deployment and health check succeeded: ' + target.vars.PUBLIC_ORIGIN);
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Release failed.');
  process.exitCode = 1;
}
