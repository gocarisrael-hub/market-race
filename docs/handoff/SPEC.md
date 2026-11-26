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
- Types (`types` in the setting): "מי אמר את זה?" (the honoree's saying among 3 curated lines from `lines`), "נכון או לא נכון" (3-4 statements from the answers via `facts`; false ones swap in an alternative from `swaps`, e.g. another food or place; at least one of each), "מה בתמונה?" (the first photo zoomed in on a spot and revealed step by step, "where was this?" with places from `swaps.place`; needs a photo and the optional `photo_where` answer), "צופן אישי" (a short answer shifted along the alef-bet by the letter count of another personal answer, with a hint naming that answer, e.g. "כמספר האותיות של המקום שהכי עושה למיכל טוב"). All lists and texts are in the `minigames` setting, edited in the admin (a stored value without a key keeps the default).
- The builder picks, per placement, a type the order has enough data for (seeded by the order number, so a sold game is reproducible), each type once, preferring answers the earlier riddles have not shown. Fewer answers: fewer games, or none.
- Reward, the same every time: a line of the closing letter, on a torn taped piece of paper with confetti ("קטע מהמכתב, המכתב המלא מחכה בסוף"). The buyer's letter notes in order, else a line we write from `rewards`.
- Play: the `minigame` step of the shared, version-guarded state, with `game_states.minigames_solved` and `minigames_skipped`. The server never sends a solution, and the reward only once solved. Wrong answers say so; a solved game waits for "ממשיכים לחידה הבאה". Only the captain (captain token) can skip one, after a confirm. Pause and resume work on it like on a stop.
- Progress counts stops and mini-games: "שלב X מתוך Y" on the trail (mini-games drawn as their doodle) and the side list. Emails, the manage page and the paused screen still speak of stops.
- Admin: the order view lists the mini-games with their solutions and rewards, and "לייצר מחדש" per game (another type or other choices), allowed until the group reaches it.
- Questions: every demo set has the optional `photo_where` ("אם תוסיפו תמונות: איפה צולמה הראשונה?"); everything else maps from answers the sets already ask.
- Cipher screen: the line saying what the hidden word is reads "המילה המוצפנת היא: …" and the hint reads "המפתח: …", so the two answers are never confused.

## Demo content on seeded databases

Decided 2026-11-26. Demo content (staging, local, e2e) is versioned: `DEMO_SEED_VERSION` in `src/server/services/demo-refresh.ts`. At boot, only with SEED_DEMO or E2E_SEED and never when APP_ENV is production, a database whose `demo_seed_version` setting is lower gets the current demo riddles (keyed by the demo market's stall name and the answer), question sets (by name), the demo occasions' recipients (by key) and the `minigames` setting. Riddles, question sets and occasions carry `updated_at`; the refresh records when it ran (`demo_seed_at`), and a later refresh leaves any row changed after that (an admin edit) alone. A database refreshed for the first time has no record, so its demo-keyed rows are overwritten. Then every game built but not started (status review or ready, still on its opening) is rebuilt, keeping its tokens, so it gets the new riddles and its mini-games. A fresh seed records the current version and needs no refresh. Bump the version whenever the demo content changes.
