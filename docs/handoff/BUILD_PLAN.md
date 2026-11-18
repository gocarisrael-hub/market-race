# Market race — build plan

Two streams in parallel: engineering (the agent) and operations (Hadar). Each phase ends with something the owner can try.

## Phase 0 — Setup (engineering, ~2 days)

- Repo, CI (lint, unit, end-to-end), Railway service + Postgres + volume, staging environment.
- Data model and migrations for everything in `SPEC.md`.
- Admin login (owner accounts).

Done when: staging is up, the admin opens, CI is green.

## Phase 1 — Catalog and game engine (~1 week)

- Admin: markets, stalls (closed-today switch + note), tastings with allergens/diets/fees, riddles with forms and a live preview, question sets, routes, themes.
- Answer matcher (normalize, accepted list, edit distance ≤ 1) with an admin tester.
- Game builder: allergen/diet swap, backup stall, block-and-flag, slot filling with fallbacks, frozen snapshot.
- Odd-answer check and the review queue.

Done when: the owner can enter Carmel's real stalls and riddles and generate a game from test answers in the admin.

## Phase 2 — Player (~1 week)

- Game link + QR, shared progress across phones (polling), resume on any phone.
- Screens per the mockup: opening, riddle, hint, stall revealed on the map, redemption (daily code, portions, allergens), "קיבלנו", final letter.
- Themes applied (map + palette). Start with Carmel watercolor, then the other three.

Done when: a full game can be played end to end on two phones at once on staging.

## Phase 3 — Selling (~1 week)

- Order flow on the site: occasion, form, theme, people, allergens/diets, questions, optional letter notes, payment (Tranzila copied from Dugri).
- Delivery: email + WhatsApp with the game link and QR; manage link.
- Admin: orders, live games, bought vs. used, monthly settlement per stall with export.

Done when: a real card payment on staging produces a playable game in the buyer's inbox.

## Phase 4 — Personal and companies (~1 week)

- Photos: upload (up to 5), the filter converter (swappable), photos in riddles and the letter.
- Companies: lead form on the site, quotes and payment links in the admin, company questions filled by the owner, logo upload with automatic palette extraction and override, logo on opening screen / map stamp / letter.

Done when: a company game with a logo and company riddles can be quoted, paid and played.

## Phase 5 — Beta and launch (~1 week)

- Closed beta at Carmel with friends and real stalls; the owner shadows games.
- Fixes from beta, low-end Android and slow network checks.
- Production deploy (owner), domain, monitoring.

## Operations stream (Hadar)

| When | What |
|---|---|
| Phase 0–1 | Walk Carmel; confirm 5 stops (Tikva's juice stall, the Yemenite bakery, Burik, a falafel or kebab stall, a coffee or beer finale) and a backup for each. Per stall: phone, dishes, allergens, fee per portion. |
| Phase 1 | Write the riddles (one per stall, she/he/couple/company forms, fixed answer, hint) and the question sets per occasion. Enter them in the admin. |
| Phase 2 | The vendor one-pager: what the screen shows, the daily code, how settlement works. Brief every stall in person. |
| Phase 3 | Brand name and domain, prices, quote template for companies, WhatsApp number. |
| Phase 5 | Recruit 5–10 beta players, run the beta weekend, collect feedback. |

Total: about 5 weeks to launch, with engineering on the critical path.
