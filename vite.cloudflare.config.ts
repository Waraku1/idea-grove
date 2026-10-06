import {readFileSync, existsSync} from 'node:fs';
import vinext from 'vinext';
import {defineConfig} from 'vite';

// The independent host uses its own gateway; Sites authentication is unchanged.
const path = 'deployment/cloudflare.local.json';
const target = JSON.parse(readFileSync(existsSync(path) ? path : 'deployment/cloudflare.example.json', 'utf8'));
export default defineConfig(async () => {
  process.env.CLOUDFLARE_CF_FETCH_ENABLED ??= 'false';
  process.env.WRANGLER_SEND_METRICS ??= 'false';
  process.env.WRANGLER_WRITE_LOGS ??= 'false';
  process.env.WRANGLER_LOG_PATH ??= '.wrangler/logs';
  const {cloudflare} = await import('@cloudflare/vite-plugin');
  return {
    plugins: [vinext(), cloudflare({
      viteEnvironment: {name: 'rsc', childEnvironments: ['ssr']},
      inspectorPort: false,
      config: {
        name: target.name,
        ...(target.account_id && !target.account_id.startsWith('REPLACE_') ? {account_id: target.account_id} : {}),
        main: './deployment/worker.ts',
        compatibility_date: '2026-05-15',
        compatibility_flags: ['nodejs_compat'],
        workers_dev: true,
        preview_urls: false,
        observability: {enabled: false},
        vars: target.vars,
        d1_databases: [{binding: 'DB', database_name: target.database_name, database_id: target.database_id, migrations_dir: 'drizzle'}],
      },
    })],
  };
});
