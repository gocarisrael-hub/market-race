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
| `COMPANY_HOSTS` | Optional. Comma-separated host names (no scheme, no port) served as the companies site, see "Two sites" below. Empty: one site |
| `APP_ENV` | `development`, `test`, `staging`, `production` |
| `ADMIN_BOOTSTRAP_EMAIL` / `ADMIN_BOOTSTRAP_PASSWORD` | Creates the first owner when there are none |
| `TRANZILA_*` | Payment, see `docs/PAYMENT.md` (Phase 3) |
| `SMTP_*` / `WHATSAPP_*` | Delivery (Phase 3) |

## Two sites: private and companies

One service serves two sites from the same `site` bundle:

- **The private site** (`/` and the whole order flow) is only about celebrating a person: `/` is the landing with the route teaser (`RouteTeaser.tsx`: the market map blurred, the route and the food on it, each stop's teaser only on hover or tap) and one call to action into `/order`. A quiet footer line links to `/companies`.
- **The companies site** (`pages/Companies.tsx`, `companies.css`) has its own look and layout (no private site nav or desk): team events, the company's logo and colours on the map, the group size range (settings `company_min_people` / `company_max_people`), and the lead form (`POST /api/leads`). The owner then sends a quote with a payment link (`/pay/:token`).

**Separate domain.** Set `COMPANY_HOSTS` to the companies domain(s), e.g. `COMPANY_HOSTS=teams.example.co.il`, and add the domain to the Railway service. For a request whose Host (or `X-Forwarded-Host` behind Railway's proxy, `trustProxy` is on) is listed, the server sends the site's `index.html` marked `<html data-site="companies" data-home="<PUBLIC_BASE_URL>">` (`src/server/lib/site.ts`). The app reads the mark (`siteOf` in `logic.ts`) and routes `/` there to the companies landing; its link back goes to `data-home`, the private site's origin. Every other path (API, order, manage, payment links) works the same on both hosts. No domain is hard-coded; without `COMPANY_HOSTS` the companies landing is at `/companies` only.

## Photos: with or without background

Each order photo carries the buyer's choice (`uploads.background`: `keep` or `remove`).

- **Cutout = Dugri's algorithm, run in the buyer's browser.** `src/web/shared/cutout.ts` is a port of Dugri's `site/js/pawn-cutout.js`: MediaPipe Tasks Vision `ImageSegmenter` with the `selfie_multiclass_256x256` model (category mask; every class but background is the subject; largest connected blob only; under 2% coverage is a miss; the mask is drawn scaled up over the photo with bilinear smoothing, which is the feathered edge; 15s timeout; any failure resolves to null). The pure part is `src/web/shared/cutout-mask.ts`, shared with the unit tests.
- **How it ships.** The runtime and model (Apache-2.0) are copied from Dugri into `vendor/mediapipe/` (see its README) and served from our origin by `src/server/routes/vendor.ts` (the `.wasm` is stored brotli-compressed and sent with `Content-Encoding: br`). Nothing is imported from Dugri, no CDN, no server-side model, no sidecar: the same code and model in the same environment (a browser) gives the same result, and the Railway service stays one Node process. The ~18MB download happens only when a buyer first picks "without background".
- **Server.** `PUT /api/orders/:token/photos/:id/background` takes the choice and, the first time, the cutout PNG. The server checks it (`checkCutout`: PNG with alpha, same shape as the original, a subject in it), stores it (`cutoutPath`) and its illustration on paper (`illustrateCutout`, `cutPath`), and points `path` (what the game plays) at the illustration matching the choice (`bgPath` keeps the with-background one). Switching back and forth needs no new cut. A cut the browser could not make is recorded as `cutFailed` and the photo keeps its background.
- **Style prototypes.** `src/server/photos/styles.ts` holds numbered style treatments, none live. `node scripts/photo-styles-showcase.ts <dir> <out.html> name...` renders them on sample photos (each `<name>.jpg` plus `<name>-cut.png`) into one HTML page.
