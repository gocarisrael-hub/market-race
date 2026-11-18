# Architecture

One Node service (Railway) serves the API, the admin and the customer web apps. Postgres on Railway; uploads on a Railway volume.

## Stack

- Node 24, TypeScript run directly by Node (type stripping). No server build step. Use only erasable syntax: no `enum`, no parameter properties, no namespaces. Relative imports end in `.ts`.
- Fastify 5 (`src/server`). Drizzle ORM (`src/server/db/schema.ts`), migrations in `drizzle/` applied at boot.
- Database: `DATABASE_URL` = `postgres://...` on Railway; `pglite:<dir>` or `pglite:memory` (embedded Postgres) locally and in tests. No Docker needed.
- Web: React 19 + Vite, three bundles under `src/web`: `site` (order flow, `/`), `player` (`/g/:token`), `admin` (`/admin`). Built to `dist/web`, served by Fastify with SPA fallbacks.
- Tests: Vitest (`tests/unit`, uses `tests/helpers/app.ts` → in-memory PGlite + `app.inject`). Playwright (`tests/e2e`, mobile viewport, starts the real server on port 3999 with `E2E_SEED=1`).
- Lint/format: Biome (`npm run format`).

## Layout

```
src/server/
  index.ts            entry: config → db → app.listen
  app.ts              buildApp({db, config}); registers routes and static
  config.ts           env vars
  db/schema.ts        every table
  domain/             pure logic, no DB: types, matcher, builder, odd-check, daily code, settlement
  services/           DB-backed operations (build a game for an order, play actions, payments)
  routes/             HTTP: admin-*.ts (owner only), public-*.ts (site + player)
  lib/                auth, tokens, uploads, mail/whatsapp
src/web/{site,player,admin,shared}
tests/{unit,e2e,helpers}
```

## Conventions

- Money in agorot (integer). Dates of the market day use Israel time (`Asia/Jerusalem`).
- Business facts (prices, copy, odd-answer rules, profanity list, stall data) live in the DB (`settings` table and catalog tables) and are edited from the admin. Code only holds defaults used by the seed.
- Admin API: `/admin/api/*`, guarded by `requireOwner`. Public API: `/api/*`.
- Public links use random tokens (`orders.game_token`, `orders.manage_token`), never sequential ids.
- The player API never sends a future stop's answer, stall or tasting. Riddle answers are checked on the server.
- A sold game is a frozen snapshot (`orders.game`); catalog edits never change it.
- Every change ships with tests. Unit for logic and routes, e2e for player and order flows.

## Environment variables

| Var | Purpose |
|---|---|
| `DATABASE_URL` | Postgres URL (Railway reference to the Postgres service) |
| `UPLOAD_DIR` | Volume mount path for uploads, `/data/uploads` on Railway |
| `PUBLIC_BASE_URL` | Origin used in links sent to customers |
| `APP_ENV` | `development`, `test`, `staging`, `production` |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Creates the first owner when there are none |
| `TRANZILA_*` | Payment, see `docs/PAYMENT.md` (Phase 3) |
| `SMTP_*` / `WHATSAPP_*` | Delivery (Phase 3) |
