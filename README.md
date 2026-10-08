# Idea Grove

A private knowledge garden with a shared 3D world: capture thoughts, organize them with tags, place them in rooms and watch the tree grow. English is the base interface language. Overview, first-person walking and windows use the same building geometry, sky and terrain.

## Development

Node.js 22.18+ is required for verification, including the SQLite API tests. Use the checked-in dependency lockfile and the existing install helper. Do not change dependencies merely to release.

```sh
npm run test
npm run typecheck
```

The selected independent host is Render Free Web Service with Neon Free PostgreSQL and GitHub sign-in. `vite.render.config.ts` builds the existing interface as a standalone client; `deployment/render/server.ts` serves its signed-cookie API. The original owner-private Sites environment and the prepared Cloudflare target remain available. Their databases and identities are separate.

```sh
npm run build:render
npm run start:render
```

The server requires private authentication settings and a dedicated Neon database initialized with `deployment/render/schema.sql`. It checks the schema before opening its HTTP port. `render.yaml` selects Free, one instance, manual deployments, and read-only saving until live checks pass. Do not run a public release with placeholder values.

```sh
npm run build:cloudflare
```

The example configuration permits an offline production build and Wrangler `deploy --dry-run`. It deliberately cannot pass the public release preflight. Never deploy the Sites Worker directly to a public host: its identity headers require the Sites dispatcher.

## Public deployment and operation

- [Render deployment](docs/RENDER_DEPLOYMENT.md): selected free hosting, repository, database, OAuth and release setup.
- [Render operations](docs/RENDER_OPERATIONS.md): ownership, quota stops, backups, erasure-safe recovery and rollback.
- [Cloudflare deployment](docs/DEPLOYMENT.md) and [operations](docs/OPERATIONS.md): retained alternative hosting procedures.
- [Release plan](docs/RELEASE_PLAN.md): completed releases and outstanding checks.
- [Sites development](docs/SITES_DEVELOPMENT.md): managed workspace source, packaging and preview conventions.

Zero-cost operation requires a Render Hobby workspace without a payment method and a Neon Free project. Quota exhaustion can suspend the service; Free does not provide uninterrupted or unlimited access. No paid capacity, disk, custom domain purchase, telemetry, or paid CI is selected. The Blueprint cannot prove the real account's billing state: verify it before creating the service and before each release.

## Data model

User-owned worlds and their change history are stored in Neon PostgreSQL on Render, and D1 on the Sites/Cloudflare targets. PostgreSQL save and erasure functions share a per-owner transaction lock and recheck revisions. Version-1 JSON exports include the current world; they do not include growth history. Failed content saves retain an account-specific local draft where browser storage is available. Unsaved spatial edits require an online connection.

No production thoughts, database dumps, credentials or local deployment configuration belong in Git. Secrets remain at the selected host. The source repository and deployment artifacts contain application code only.
