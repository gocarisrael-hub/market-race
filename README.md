# market-race

Personalized tasting race in an Israeli food market. See `docs/handoff/SPEC.md` and `docs/ARCHITECTURE.md`.

```
npm install
npm run dev          # server on :3000 (PGlite in .data/), Vite on :5173
npm run ci           # lint, typecheck, unit, build, e2e
```

First admin login locally: set `ADMIN_BOOTSTRAP_EMAIL` and `ADMIN_BOOTSTRAP_PASSWORD` before the first start.
