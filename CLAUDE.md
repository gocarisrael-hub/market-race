# Market race — agent brief

You are building a new product from scratch: a personalized tasting race in an Israeli food market (Carmel Market first, Mahane Yehuda next). It is a standalone product with its own codebase, its own admin panel, its own domain and its own Railway service. It is not part of Dugri and must not depend on Dugri's code at runtime.

Read these before writing code, in this order:
1. `docs/handoff/SPEC.md`: what the product is, the data, the flows, every decision taken so far.
2. `docs/handoff/BUILD_PLAN.md`: the phases and what "done" means for each.
3. `docs/handoff/PAYMENT_FROM_DUGRI.md`: how to copy the Tranzila payment code from the Dugri repo.

## Working rules

- Working language: English in code and docs. All customer-facing text is Hebrew, RTL.
- Style: concise. No emojis in UI or docs unless asked.
- Language, framework and libraries are your choice. Constraints: runs as one Railway service, Postgres on Railway, uploaded files (photos, logos) on a Railway volume.
- Never hard-code business facts (prices, texts, stall data, hours). They live in the database and are edited from the admin.
- Every change ships with tests that cover it (unit for logic, end-to-end for the player and order flows). CI must be green before merge.
- Branch per change, PR to main. Nobody pushes to main.
- Deploys: staging is yours to run; production deploys are the owner's.
- Secrets only in Railway variables, never in the repo.
- Never use the name "המירוץ למיליון" in anything customer-facing (a TV format's trademark). The brand name is not decided yet: use the working name `market-race` in code and a placeholder `[שם המותג]` in UI copy.

## Design source

- Mockup (the visual and UX reference for the player and order screens): https://claude.ai/artifact/834DFVCMRJkUiqQByVEGnz
- Illustrations: `assets/` in this folder (market maps, food icons cut from the maps, Dugri-style logos are for the mockup only and are NOT the new brand's logo).
- Look: hand-drawn and illustrated. Handwritten display font (Amatic SC) over a plain Hebrew sans (Heebo). No boxes, pills, offset shadows or marker highlights: torn-paper shapes, hand-drawn circles and arrows, brush-stroke buttons. Light backgrounds (the owner dislikes dark UI) except where a theme is dark by design.
- The admin panel is a separate, plain, functional tool. It does not follow the player look.
