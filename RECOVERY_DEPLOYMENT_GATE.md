# Published Site v13 → Render deployment gate

Canonical source evidence:
- Published Site: https://idea-grove.heleshiheiheleshihei.chatgpt.site/
- Published Site source version: 13
- Projection revision: 23
- Recovery bundle: published production assets captured from the live Site.
- Existing Render backend: `deployment/render/server.ts`

## Required files to add from the recovery bundle

The recovered production application must be committed verbatim before deployment:
- `deployment/render/public/assets/grove-BWXu0UId.js`
- `deployment/render/public/assets/framework-D_rUT4EX.js`
- `deployment/render/public/assets/rolldown-runtime-C60lm6uB.js`
- `deployment/render/public/assets/index.DdvT-Eqh.css`
- `deployment/render/public/assets/recovered-entry.js`

Then `deployment/render/index.html` must load the recovered entry and stylesheet.

Do not regenerate or rewrite the recovered JavaScript. The recovery bundle is the authoritative production behavior captured from Site source version 13.

## Verification gate

Run:
```
pnpm install --frozen-lockfile --prod=false
pnpm test
pnpm typecheck
pnpm build:render
```

Then deploy the resulting commit to the existing Render service. Render is configured with `autoDeployTrigger: "off"`, so the deployment must be initiated explicitly.

Do not alter:
- Neon schema/data
- GitHub OAuth credentials
- `APP_READ_ONLY`
- production authentication policy

This branch is intentionally a staging branch until the recovered bundle is committed and the Render build passes.
