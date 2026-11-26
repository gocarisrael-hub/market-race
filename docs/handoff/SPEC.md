# Market race — product and system spec

Status: decisions taken with the owner on 2026-11-16/17. Anything not decided is in "Open" at the end.

## The product

A group walks a fixed route of food stalls in one market. At each stop they solve a riddle; the answer reveals the next stall; they show the screen at the stall and get a tasting. The riddles are personalized for one person being celebrated (the honoree) or for a company.

- Occasions (private): bachelorette, love and couples, birthday for a parent, birthday, family, friends, generic. More can be added from the admin. Each lists who it can be for (see Questions).
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
- Group games (family, friends or a unit, generic) use the `group` form: plural, about a group named by `{group_name}`. The site asks the group's name in the name field.
- Recipient first (decided 2026-11-25). Most orders are a gift for one specific person, so right after "which game" (the occasion) the order asks who it is for: למישהי (she), למישהו (he), לזוג (couple), לקבוצה (group), למשפחה (family). Only the recipients the occasion offers are shown, one person first and drawn larger, and the first one offered is picked by default. An occasion that offers one recipient (bachelorette: her; family) shows no choice; gender is never asked for a couple, a group or a family. On the questions step a small she/he switch next to the name corrects the choice for a gift to one person.
- Occasion × recipient picks the question set (`occasions.recipients`: each offered recipient with its set, empty = the occasion's default set) and the form: she → she, he → he, couple → couple, group and family → group. So a birthday for her asks about her; a love game for him asks about him from the giver's side (where it started between you, what he always orders, a nickname or line he says only to you); a couple's questions are about the two of them; a group gets "who is the most…" questions; a family its family questions. Every set fills the same riddle slots, so one template per form serves every occasion. The order stores `recipient`; orders placed before it are mapped from their form (a group on a family occasion is the family).
- Players' grammar: the player addresses the players in the feminine plural only when the occasion says so (`occasions.players_feminine`, a bachelorette). A game for her from a mixed group reads in the plain plural. Riddles, the letter and emails follow the recipient's form.
- A question can be marked hidden ("not asked"): the buyer never sees it and riddles get its fallback. This lets one group template use slots that only some question sets ask.
- Every slot has a fallback phrase used when its question was left empty.
- One question can feed several riddles.
- Hints are plain, no wordplay.
- Answer checking is forgiving: trim, case-fold, strip niqqud and punctuation, then exact match against the accepted list, then edit distance ≤ 1.

Personal text is shown in the riddle in the theme's accent color, in the handwritten font (see the mockup).

## Questions

- One person answers. There is no link for friends to add answers.
- A question set per occasion × recipient (and one per company type), all editable in the admin. Demo sets: birthday for her, birthday for him, love for her, love for him (both from the giver's side), couple (about the two of them), "who is the most…" for a group, family, friends, and the general personal set. Each question: slot key, Hebrew text per form, required or not, fallback, max length.
- Example slots: name, first_love, favorite_food, catchphrase, favorite_place, one_word, dream; for companies: company_name, company_catchphrase, memorable_project, kitchen_favorite, last_offsite.
- Optional sentences for the final letter (from the buyer).
- Optional personal questions for hints (decided 2026-11-18): in the order flow and on the edit page the buyer can add questions about the honoree, each with its answer ("we'll ask these during the game to unlock hints"). When an order has them, tapping a riddle's hint asks one of them (one per stop, in turn); a right answer (the same forgiving matcher as riddles) opens the hint for everyone, a wrong one lets the group try again or skip with the hint still hidden. Without them, hints open on a tap as before. The answers stay on the server; the game client only ever gets the question.

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

Palettes are separate from maps (`palettes` table, admin "צבעים"): each palette lists the themes (maps) it is offered on, and the buyer picks one on step 1 from paint daubs (each a single clean smear of the accent; the chosen one circled by hand, its name below), with a live preview (the map tinted toward the palette's `mapTint`, the ribbon and button in its colors). The first palette of a map is the default. The order stores `palette_id`; the game snapshot freezes the resolved palette (company palette > chosen palette > theme palette). Every palette must pass the contrast checks in `src/server/domain/look.ts` (the same derivation the player uses); the admin refuses one that does not. Demo palettes: classic red, sea blue, olive green, sunset orange, berry pink (watercolor maps), blue-pink (riso), night (Mahane Yehuda night).

Occasion doodles: each occasion has a `decor` set (birthday, love, family, friends, company, generic), chosen in the admin. Hand-drawn inline SVG doodles of that set appear around the opening ribbon, as confetti on each reveal, on the final letter and through the order flow once the occasion is picked (`src/web/shared/decor.tsx`). Food illustrations stay.

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
| question_sets | id, name, questions[] {slot, text per form, required, fallback, max_len, hidden} |
| occasions | key, label, audience, question_set_id (default), recipients {she/he/couple/group/family: set id or null}, forms (kept in step), players_feminine, decor |
| routes | id, market_id, name, stops[] {stall_id, tasting_id, riddle_id, backup_stall_id}; the last stop is the finale |
| themes | id, name, market_id, map file, palette |
| settings | prices, texts, odd-answer rules, everything else business-side |

Allergens are a fixed list, never free text: גלוטן, חלב, אגוזים, בוטנים, ביצים, שומשום, סויה, דגים, פירות ים. Diets: vegan, vegetarian, gluten_free.

Stall closed on the day: market hours are global; a stall can be switched "closed today" with a note. A closed stall is replaced by its stop's backup stall when the game reaches it. In the game, a help control (WhatsApp to the `support_whatsapp` setting, prefilled with `support_message` or a default naming the honoree and stop) also lets the group report the shown stall closed: the stop switches to its backup at once and the owner is alerted; with no backup the game stays put, the group is told to contact us, and the owner is alerted. A report never closes the stall for other games.

## Orders and the game

```
orders: id, order_no, kind (private|company), created_at, paid_at, price, payment_ref,
        buyer {name, phone, email}, occasion, recipient (she|he|couple|group|family, null for companies),
        form (she|he|couple|group|company, from the recipient), honoree_name,
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
- The buyer is the captain (decided 2026-11-18). Until the game starts, the game link shows only a waiting screen (the honoree's ribbon, "the game hasn't started, whoever ordered it starts it at the market"): no riddle, no progress, no start button. Only the manage link starts the game, on a day it is valid (Israel time), after a clear confirm. At the start the captain picks how many players arrived, 1 to the portions bought (e.g. bought 5, 3 came); it is stored on the game state. Then the captain gets a share step (a brush-stroke WhatsApp button with the `players_invite` text of the `message_templates` setting and the game link) and goes on into the game; players who open the link join the live game.
- At the start the buyer is emailed the players' link with its QR (the `game_started` template: "the game started, here is the players' link, and if you stop you continue from your link: <manage link>"). Once per start; resuming sends nothing.
- Pause and resume (decided 2026-11-22). Only the captain starts, pauses and resumes; players only play.
  - The captain's phone: the manage page's "continue to the game" link carries a captain token in the URL hash (`#c=…`, derived from the manage token, so it does not reveal it). The player keeps it in localStorage for that game, removes it from the address bar and sends it in an `x-captain` header; the server checks it. The bare game link never grants pause or resume.
  - On that phone the help sheet has "עוצרים להיום", after a confirm. Any number of times. Every phone then shows a paused screen ("המשחק בהפסקה, ממשיכים בפעם הבאה", where they stopped: stop X of Y): no riddle, no next stop is sent, and every play action is refused on the server. The buyer is emailed the `game_paused` template ("you stopped at stop X of Y, continue from your link: <manage link>").
  - The manage page of a paused game shows "המשחק בהפסקה, עצרתם בתחנה X מתוך Y" and a brush-stroke "ממשיכים". Resume is allowed any day while the game is valid (one year from purchase), any number of times. Everyone continues at exactly the same stop and step, on the same game link. The players count is fixed at the start and does not change on resume. The closed-stall check and backup work as on any day (stall availability is checked on the day each stop is played).
  - State: `game_states.paused_at` (null while playable). The admin's live view and order view show a paused game.
- Lost link: the site has "איבדתי את הקישור" (`/lost-link`). The buyer enters the email they ordered with; if it has paid, valid orders, that address gets one email with their manage links (the `links_reminder` template). The page answers the same whether or not the address has orders, and the email goes out after the answer. Rate limited per client (5 per 15 minutes) and one email per address per 10 minutes; both lifted in the test env.
- Stop flow: riddle → correct answer → stall revealed on the map → "we're here" → redemption screen.
- The game never sends a later stop's answer or stall to the client before it is reached.

## Redemption (screen only, no SMS)

- The redemption screen shows: the day's code (changes daily, per market), the honoree or company name, the number of portions (= the players who arrived, chosen at the start), the tasting and the group's allergens.
- The vendor checks the screen and serves. The player taps "קיבלנו" to log it.
- Every redemption is stored: order, stop, stall, tasting, portions (the players who arrived), fee (frozen), time.
- The number bought is fixed at purchase. Portions not served (fewer players came, or stops never reached) are not refunded automatically; the admin order view shows them, and make-up coupons are issued by the owner only.
- Monthly settlement per stall: fee × portions served over the month's redemptions, exportable.
- The daily code and the vendor-facing rules are in a printable one-pager for stalls.

## What the buyer receives

- After payment: confirmation and a link to answer the questions (if not answered during the order).
- When ready: the game link + QR and a short how-to-play, by email and WhatsApp. The email says the buyer starts the game from the manage link at the market; the game link opens once it has started.
- At the start, on a pause, and on request ("איבדתי את הקישור"): see Playing. Every customer message is a template in the `message_templates` setting, edited in the admin: `paid_answers_needed`, `game_ready`, `company_payment_link`, `players_invite`, `game_started`, `game_paused`, `links_reminder`. A saved set without a key falls back to that key's default text.
- A manage link to see progress and to edit: until the game starts (status before `active`, the shared game still on its opening screen) the buyer can change the name, the answers, the letter notes, the photos and the color, any number of times. A paid game that is already built is rebuilt at once; odd answers send it to review as on the first build, while flags the owner already approved stay approved. The paid and game-ready emails say so ("אפשר לשנות תשובות, תמונות וצבע עד שמתחילים לשחק").

## Admin (new, separate, plain)

- Orders: list, filters, status, odd-answer review queue with inline edit.
- Live: each active game's stop and step, last activity.
- Bought vs. used per order: players who arrived, and portions not served.
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
- ~~Whether a game, once started, stays open only for that day.~~ Decided 2026-11-22: it can be paused and resumed any day while valid (see Playing).
