# Market race — product and system spec

Status: decisions taken with the owner on 2026-11-16/17. Anything not decided is in "Open" at the end.

## The product

A group walks a fixed route of food stalls in one market. At each stop they solve a riddle; the answer reveals the next stall; they show the screen at the stall and get a tasting. The riddles are personalized for one person being celebrated (the honoree) or for a company.

- Occasions (private): bachelorette, couple, birthday for a parent, birthday for a friend. More can be added from the admin.
- Companies: team day, retirement, new employee. Sold by quote (see Companies).
- One game per order, played together on any number of phones with one shared progress. No teams, no competition, no splitting into groups.
- Valid any day within a year of purchase. Stall availability is checked on the day it is played.

## Riddles: the core mechanic

Every riddle is written once and is the same for every customer. Its answer is fixed. Personalization comes from slots in the riddle text that are filled from the buyer's answers.

```
template:  "מאז {first_love}, {name} יודעת שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?"
answer:    תקווה      accepted: תקווה, התקווה, תיקווה
hint:      זה גם שם של המנון
filled:    "מאז יואב מהשכבה, מיכל יודעת שאסור לוותר עליה. ..."
```

Rules:
- The fixed lines alone must lead to the answer. Slots add personal color, never the clue.
- The answer can be the stall, its dish, the street it is on, or a landmark next to it.
- Each riddle has a version per grammatical form: she / he / couple (and company).
- Every slot has a fallback phrase used when its question was left empty.
- One question can feed several riddles.
- Hints are plain, no wordplay.
- Answer checking is forgiving: trim, case-fold, strip niqqud and punctuation, then exact match against the accepted list, then edit distance ≤ 1.

Personal text is shown in the riddle in the theme's accent color, in the handwritten font (see the mockup).

## Questions

- One person answers. There is no link for friends to add answers.
- A question set per occasion (and one per company type). Each question: slot key, Hebrew text per form, required or not, fallback, max length.
- Example slots: name, first_love, favorite_food, catchphrase, favorite_place, one_word, dream; for companies: company_name, company_catchphrase, memorable_project, kitchen_favorite, last_offsite.
- Optional sentences for the final letter (from the buyer).

## Photos

- Up to 5 photos per order, optional.
- Converted automatically into the illustrated style with a simple image filter (no AI model in this phase): edge-preserving smoothing, color flattening, ink outlines, paper grain, background cut where possible. Works well for pets and places, weaker for faces; that is accepted for now. Keep the converter behind one function so it can be swapped for an AI model later.
- Used in riddles (taped onto the riddle note) and in the final letter.
- Stored on the Railway volume. Retention policy: Open.

## Design themes

The buyer picks a look. Each theme = a market map illustration + a palette applied to ribbon, buttons, drawn lines, accent text and paper.

| Theme | Map | Background | Accent | Ink |
|---|---|---|---|---|
| Carmel watercolor | `assets/maps/carmel-watercolor.jpg` | #EADBC8 | #B4161B | #2B2420 |
| Mahane Yehuda watercolor | `assets/maps/mahane-yehuda-watercolor.jpg` | #EADBC8 | #B4161B | #2B2420 |
| Carmel blue-pink | `assets/maps/carmel-riso.jpg` | #737FB0 | #F3859F / #0A297D | #0A297D |
| Mahane Yehuda night | `assets/maps/mahane-yehuda-night.jpg` | #0B2B47 | #AFC7AE | #08223A |

Themes are rows in the database (admin can add one: upload map, set colors). The map's market and the route's market must match.

## Companies

- Sold by quote: the company leaves details on the site; the owner sends a quote and a payment link (Tranzila); the owner fills the company questions together with the company in the admin.
- Their game gets their logo (opening screen, a stamp on the map, the final letter) and their colors. Colors are extracted automatically from the logo (dominant colors, then the one with enough contrast against the background becomes the accent); the owner can override. Market illustrations stay as they are.
- Riddles about the company use the company question set and the company form of each riddle.

## Catalog (admin-edited)

| Table | Fields |
|---|---|
| markets | id, name, hours (one set per market), active |
| stalls | id, market_id, name, location_hint, phone, active, closed_today, closed_note |
| tastings | id, stall_id, name, allergens[], diets[], fee_per_portion (₪), active |
| riddles | id, stall_id, answer, accepted[], hint, templates {she, he, couple, company}, slots[] |
| question_sets | id, kind (occasion or company type), questions[] {slot, text per form, required, fallback, max_len} |
| routes | id, market_id, name, stops[] {stall_id, tasting_id, riddle_id, backup_stall_id}; the last stop is the finale |
| themes | id, name, market_id, map file, palette |
| settings | prices, texts, odd-answer rules, everything else business-side |

Allergens are a fixed list, never free text: גלוטן, חלב, אגוזים, בוטנים, ביצים, שומשום, סויה, דגים, פירות ים. Diets: vegan, vegetarian, gluten_free.

Stall closed on the day: market hours are global; a stall can be switched "closed today" with a note. A closed stall is replaced by its stop's backup stall when the game reaches it.

## Orders and the game

```
orders: id, order_no, kind (private|company), created_at, paid_at, price, payment_ref,
        buyer {name, phone, email}, occasion, form (she|he|couple|company), honoree_name,
        theme_id, route_id, people, allergens[], diets[],
        answers {slot: value}, letter_notes[], photos[], company {name, logo, palette},
        status, valid_until, game (frozen snapshot), flags[]
status: awaiting_answers -> review (only if flagged) -> ready -> active -> done | expired
```

Building the game (when answers are complete):
1. For each stop, check the tasting against the order's allergens and diets. Unsafe: another safe tasting at the same stall; none: the backup stall. Still none: block and flag for the owner. Never silently shorten a game.
2. Fill each riddle's template for the order's form with the answers and fallbacks; attach photos.
3. Freeze the result into `orders.game`. Later catalog edits never change a sold game.
4. Odd-answer check (empty required slot, too long, profanity list, repeated characters). Clean: status `ready` and the game is sent. Odd: status `review`, waits for the owner in the admin.

Playing:
- One game link (plus QR). Any number of phones open it and see the same state; progress is stored on the server and polled every few seconds.
- Stop flow: riddle → correct answer → stall revealed on the map → "we're here" → redemption screen.
- The game never sends a later stop's answer or stall to the client before it is reached.

## Redemption (screen only, no SMS)

- The redemption screen shows: the day's code (changes daily, per market), the honoree or company name, the number of portions (= people), the tasting and the group's allergens.
- The vendor checks the screen and serves. The player taps "קיבלנו" to log it.
- Every redemption is stored: order, stop, stall, tasting, portions, fee (frozen), time.
- Portions are fixed as bought. Unused portions stay unused; make-up coupons are issued by the owner only.
- Monthly settlement per stall: sum of fees over the month's redemptions, exportable.
- The daily code and the vendor-facing rules are in a printable one-pager for stalls.

## What the buyer receives

- After payment: confirmation and a link to answer the questions (if not answered during the order).
- When ready: the game link + QR and a short how-to-play, by email and WhatsApp.
- A manage link to see progress.

## Admin (new, separate, plain)

- Orders: list, filters, status, odd-answer review queue with inline edit.
- Live: each active game's stop and step, last activity.
- Bought vs. used per order.
- Catalog: markets, stalls (with closed-today switch), tastings, riddles (with a live preview per form and an answer-matcher tester), question sets, routes, themes.
- Companies: leads, quotes, payment links, company questions, logo upload with extracted palette.
- Settlement per stall per month, export.
- Login: owner accounts only.

## Payment

Tranzila, copied from the Dugri codebase (see `PAYMENT_FROM_DUGRI.md`). Private orders pay on the site; companies pay through a link the owner generates.

## Open

- Brand name and domain (working name `market-race`).
- Photo retention period.
- Prices per occasion and per person, and the company quote template.
- Whether a game, once started, stays open only for that day.
