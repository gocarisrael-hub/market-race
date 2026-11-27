# Market race — product and system spec

Status: decisions taken with the owner on 2026-11-16/17. Anything not decided is in "Open" at the end.

## The product

A group walks a fixed route of food stalls in one market. At each stop they solve a riddle; the answer reveals the next stall; they show the screen at the stall and get a tasting. The riddles are personalized for one person being celebrated (the honoree) or for a company.

- Occasions (private), as the site names them (decided 2026-11-26): רווקות, דייט רומנטי, יום נישואים, יום הולדת, יום הולדת לילד, יום משפחתי, חבר'ה, כללי. More can be added from the admin. Each lists who it can be for (see Questions). "יום הולדת להורה" was folded into "יום הולדת" (which offers her and him, and the gold, cobalt and ink styles): it is inactive, not deleted, so its orders keep working.
- An occasion can name its recipients itself (`occasions.recipient_labels`, edited in the admin), e.g. a kid's birthday offers "לילדה" and "לילד" (she and he). Empty: the site's default (למישהי, למישהו…).
- A kid's birthday: a parent fills in questions about the child (favourite food, game or show, what they want to be, a funny thing they say, best friend, a sweet thing they did this year). The riddles' "first love" slot is never asked of a child: a hidden question gives it "היום שנולדה". Doodles: balloons, cake, crowns, stars. Styles: the light, friendly ones only (the watercolors, blue-pink, cobalt). Mini-games: true/false, then the photo, then "who said it", never the cipher (`minigames.byOccasion`).
- Kids get no alcohol (decided 2026-11-26). An occasion can be for kids (`occasions.for_kids`, admin; set on the kid's birthday) and a tasting adults-only (`tastings.adults_only`, admin: alcohol). In a kids' game an adults-only tasting is treated like one the group cannot eat: another tasting at the same stall first (the demo beer stall pours "מיץ", fresh juice or lemonade), else the backup stall, else block and flag. Buyers are never told: the tastings preview simply shows the kids' teaser. The admin's order view says why each stop was swapped (allergens/diet, kids, unavailable). Production gets the flags and the juice from `scripts/kids-juice-2026-11.ts` (a dry run unless `--apply`).
- A wedding anniversary: for her, for him (from the spouse) or for the couple (from someone close). Questions: where they met, the wedding song, the first apartment, their dish, a funny moment from the wedding, a wish. Doodles: rings, hearts, a toast. Styles: gold on cream, cobalt and the watercolors.
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
- Group games (family, a group of friends, generic) use the `group` form: plural, about a group named by `{group_name}`. The site asks the group's name in the name field, worded per occasion ("איך קוראים למשפחה?", "איך קוראים לחבר'ה?", "איך קוראים לקבוצה?").
- Questions are short and direct, one line each, with a short example answer shown in the empty field (`example`, "למשל: סושי") and the length limit counted quietly. The questions stage says once what the answers are for ("התשובות נכנסות לחידות ולמכתב. מילה או שתיים מספיקות."); the hint-questions stage says "שאלה שרק מי שמכיר אותה יודע לענות עליה. מי שעונה נכון מקבל רמז." with an example pair in the empty fields.
- Recipient first (decided 2026-11-25). Most orders are a gift for one specific person, so right after "which game" (the occasion) the order asks who it is for: למישהי (she), למישהו (he), לזוג (couple), לקבוצה (group), למשפחה (family). Only the recipients the occasion offers are shown, one person first and drawn larger, and the first one offered is picked by default. An occasion that offers one recipient (bachelorette: her; family) shows no choice; gender is never asked for a couple, a group or a family. On the questions step a small she/he switch next to the name corrects the choice for a gift to one person.
- Occasion × recipient picks the question set (`occasions.recipients`: each offered recipient with its set, empty = the occasion's default set) and the form: she → she, he → he, couple → couple, group and family → group. So a birthday for her asks about her; a love game for him asks about him from the giver's side (where it started between you, what he always orders, a nickname or line he says only to you); a couple's questions are about the two of them; a group gets "who is the most…" questions; a family its family questions. Every set fills the same riddle slots, so one template per form serves every occasion. The order stores `recipient`; orders placed before it are mapped from their form (a group on a family occasion is the family).
- Players' grammar: the player addresses the players in the feminine plural only when the occasion says so (`occasions.players_feminine`, a bachelorette). A game for her from a mixed group reads in the plain plural. Riddles, the letter and emails follow the recipient's form.
- A question can be marked hidden ("not asked"): the buyer never sees it and riddles get its fallback. This lets one group template use slots that only some question sets ask.
- Every slot has a fallback phrase used when its question was left empty.
- One question can feed several riddles.
- Hints are plain, no wordplay.
- Answer checking is forgiving: trim, case-fold, strip niqqud and punctuation, then exact match against the accepted list, then edit distance ≤ 1.

Riddles in lines (decided 2026-11-26). A riddle is 3-4 lines, rhymed where it reads naturally, each line bringing the group closer to the stall, with at least one line weaving in a personal memory ("וכמו שיואב לא מוותר על הקפה של שמונה בבוקר…"). Template syntax, one line per line of text:
- A plain line is always shown; its slots use the answer or the fallback.
- A line starting with `?` is a personal line: shown only when the buyer answered every slot in it (name slots always count; a hidden question's set phrase counts; a fallback never does). `||` separates alternatives tried in order, so the last one can be a plain line that keeps the rhyme. When none fits, the line is skipped and nothing is flagged.
- Grammar per recipient comes from the per-form templates (she, he, couple, group for group and family, company).
- The player keeps the line breaks and sets the final short question ("מה אני?") apart. The admin editor takes multi-line text, explains the syntax, previews the riddle with sample answers and with none, and lists each line as fixed or personal with its slots.
- `catchphrase`, `group_saying` and `company_catchphrase` are kept out of the demo riddles: they feed "מי אמר את זה?" and would give it away.

Personal text is shown in the riddle in the theme's accent color, in the handwritten font (see the mockup).

## Personal mini-games

Decided 2026-11-26. Besides the stall riddles, a game has up to two personal mini-games between stops, built only from the order's own answers and photos, so only people who know the honoree can solve them.
- Placement: the `minigames` setting's `after` (default `[2, 4]`: after stop 2 and after stop 4). Always after a stop and before the last one; a shorter route gets fewer.
- Types (`types` in the setting): "מי אמר את זה?" (the honoree's saying among 3 curated lines from `lines`), "נכון או לא נכון" (3-4 statements from the answers via `facts`; false ones swap in an alternative from `swaps`, e.g. another food or place; at least one of each), "מה בתמונה?" (the first photo zoomed in on a spot and revealed step by step, "where was this?" with places from `swaps.place`; needs a photo and the optional `photo_where` answer), "צופן אישי" (a short answer shifted along the alef-bet by the letter count of another personal answer, with a hint naming that answer, e.g. "כמספר האותיות של המקום שהכי עושה למיכל טוב"). An occasion can narrow and order the types (`byOccasion`, by occasion key: tried in that order). All lists and texts are in the `minigames` setting, edited in the admin (a stored value without a key keeps the default).
- The builder picks, per placement, a type the order has enough data for (seeded by the order number, so a sold game is reproducible), each type once, preferring answers the earlier riddles have not shown. Fewer answers: fewer games, or none.
- Reward, the same every time: a line of the closing letter, on a torn taped piece of paper with confetti ("קטע מהמכתב, המכתב המלא מחכה בסוף"). The buyer's letter notes in order, else a line we write from `rewards`.
- Play: the `minigame` step of the shared, version-guarded state, with `game_states.minigames_solved` and `minigames_skipped`. The server never sends a solution, and the reward only once solved. Wrong answers say so; a solved game waits for "ממשיכים לחידה הבאה". Only the captain (captain token) can skip one, after a confirm. Pause and resume work on it like on a stop.
- Progress counts stops and mini-games: "שלב X מתוך Y" on the trail (mini-games drawn as their doodle) and the side list. Emails, the manage page and the paused screen still speak of stops.
- Admin: the order view lists the mini-games with their solutions and rewards, and "לייצר מחדש" per game (another type or other choices), allowed until the group reaches it.
- Questions: every demo set has the optional `photo_where` ("אם תוסיפו תמונות: איפה צולמה הראשונה?"); everything else maps from answers the sets already ask.
- Cipher screen: the line saying what the hidden word is reads "המילה המוצפנת היא: …" and the hint reads "המפתח: …", so the two answers are never confused.

## Allergens and diets, per person

Decided 2026-11-27 (the owner: "what if it's only one person and not the whole gang?"). The diet stage "מישהו לא אוכל משהו?" keeps its allergen chips and diet chips (טבעוני, צמחוני, ללא גלוטן); for each ticked one it asks "כמה מכם?" with a small stepper from 1 (the default when ticked) up to the participants. Buyers are never told about swaps. The manage page edits them too, until the game starts; a paid order is rebuilt on save.
- Data: `orders.restriction_counts`, a count per allergen or diet key (1..people). A ticked one without a count is everyone: orders placed before counts were migrated that way (`drizzle/0017`), so they keep the whole-group behaviour, and a page that sends no counts gets the same.
- Builder, per stop (`src/server/domain/diet.ts`). The group is split into profiles: restrictions are dealt out to different people in turn, so one person carries several only when the counts force it (the worst case). The regular tasting (the listed one, else the first other one at the stall) goes to every profile it fits; each other profile gets a tasting at the same stall that fits it (one already served at the stop first, then the lowest id). A mixed stop is fine. When a profile has nothing at the stall, the whole group goes to the backup stall (computed the same way), then block-and-flag. A kids' game's adults-only rule stays whole-group (the regular tasting is never adults-only there).
- The snapshot keeps `portions` per stop (tasting, count, the restrictions it serves) and per day-of backup, and the game keeps `restrictionCounts`. Older games without portions serve `tasting` to everyone.
- Redeem screen: a mixed stop lists each tasting by its own name, e.g. "3 × בוריק תפוחי אדמה וביצה" and "1 × בוריק טבעוני (בלי ביצה)". When fewer players came than were bought, the regular portions shrink first.
- Redemptions: one row per tasting of a stop (unique order, stop, tasting), each with its own fee; settlement counts the stop once as a visit and sums portions per tasting (shown in the admin drill-down; the CSV has a row per tasting).
- Admin: the order and game views show each restriction with its count, each stop's portions and, for an alternative, whom it is for; a stop that serves nobody its listed tasting keeps its swap reason. The test-game form takes counts.
- Route preview before purchase follows the counts: a mixed stop reads as listed.
- Demo: the bakery (לחוח עם רסק וסחוג), the burik stall (בוריק טבעוני (בלי ביצה)) and the coffee stall (קפה הפוך בחלב סויה) have alternatives; the kebab stall has none on purpose. Added by the seed and by the demo refresh (`DEMO_SEED_VERSION` 6).

## Demo content on seeded databases

Decided 2026-11-26. Demo content (staging, local, e2e) is versioned: `DEMO_SEED_VERSION` in `src/server/services/demo-refresh.ts`. At boot, only with SEED_DEMO or E2E_SEED and never when APP_ENV is production, a database whose `demo_seed_version` setting is lower gets the current demo riddles (keyed by the demo market's stall name and the answer), question sets (by name, or a former name it renames), the demo occasions (by key: name, order, doodles, recipients and their labels, active; a missing one is added, and a demo price is added for one with none) and the `minigames` setting. Riddles, question sets and occasions carry `updated_at`; the refresh records when it ran (`demo_seed_at`), and a later refresh leaves any row changed after that (an admin edit) alone. A database refreshed for the first time has no record, so its demo-keyed rows are overwritten. Then every demo game built but not started (status review or ready, still on its opening) is rebuilt, keeping its tokens, so it gets the new riddles and its mini-games. A demo game is an admin test game (`notes = 'test game'`) or an order paid through the mock provider; any other order is left alone. Two guards on top of the environment check: if the database holds any order paid for real (a paid window of a real provider, or marked paid with no mock payment and not a test game; unknown counts as real), the whole refresh is skipped and the reason logged, even with SEED_DEMO set. A fresh seed records the current version and needs no refresh. Bump the version whenever the demo content changes. Production is never seeded: occasion changes reach it through the admin, or a one-off script (`scripts/occasions-2026-11.ts`, a dry run unless `--apply`) that only changes rows still as they were.

## Game styles

Decided 2026-11-26 (the owner approved all ten styles of the style showcase). A style is a `themes` row, edited in the admin: its map, its palette, its look (`style`: display font among Amatic SC, Suez One and Frank Ruhl Libre; treatment brush, neon or foil; light or dark; the riddle top as the food trail or a map banner above it; a recolored illustration set in `assets/icons/<set>`; fixed colors for ribbon, button, lines, kicker, personal text, hint and labels) and who it is offered to (`occasion_keys` and `recipients`, empty = every one). Every look must pass the contrast checks (sunlight), with its fixed colors.
- The ten demo styles, keyed for the demo refresh: carmel (the base), mahane, night, riso, corporate, neon (the only dark one), blush, ink, gold, cobalt. The recolored maps and icons were made once by `scripts/themes/process.py` and are committed as WebP; nothing is processed at runtime.
- Offered per occasion: neon for friends, bachelorette and a friend's birthday; blush for a bachelorette or a birthday, for her; ink and kraft for him or a group (birthdays, friends, generic); gold for love, an anniversary and a birthday; cobalt for family, a birthday, a kid's birthday, an anniversary and generic; blue-pink (riso) also for a kid's birthday; the night map for evening games (friends, birthday, generic, team day); corporate for the company occasions; the two watercolor maps for every occasion.
- Palettes: only the watercolor maps offer color variants; every other style is locked to its own colors. A game played in a variant (or a company's colors) keeps the style's font and treatment and derives its colors from that palette.
- The order's look stage shows only the styles offered for the occasion and recipient, as illustrated thumbnails; a new occasion or recipient that no longer offers the chosen style falls back to the first one offered. The server refuses a style the occasion does not offer.
- The game snapshot keeps the style; the player loads only that style's display font. The manage page can change the style (on the same market, so the route stays) until the game starts. Game photos are framed in the style's ink and accent.
