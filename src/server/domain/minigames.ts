// Personal mini-games between stops. Pure: the content lists come from the `minigames` setting.
//
// Each game is built only from this order's answers and photos, so only people who know the
// honoree can solve it. The builder picks the types the order has enough data for. Solutions stay
// on the server: publicMinigame strips them before anything reaches a phone.
import { matchAnswer } from './matcher.ts'
import { fillTemplate, textFor } from './template.ts'
import type {
  Form,
  LetterNote,
  MinigameReward,
  MinigameType,
  Question,
  SnapshotMinigame,
  TextPart,
} from './types.ts'
import { MINIGAME_TYPES } from './types.ts'

type PerForm = Partial<Record<Form, string>>

/** The `minigames` setting: placement and the curated, admin-edited content. */
export interface MinigameContent {
  /** After how many stops each mini-game is played, e.g. [2, 4]. Empty: no mini-games. */
  after: number[]
  /** Types the builder may use. */
  types: MinigameType[]
  /** "מי אמר את זה?": plausible lines to mix with the honoree's own. */
  lines: string[]
  /** Plausible alternatives per kind, to make false statements and wrong choices. A kind can have
   * a version per form ("word.she"), tried before the plain kind ("word"). */
  swaps: Record<string, string[]>
  whoSaid: { slots: string[]; prompt: PerForm }
  /** "נכון או לא נכון": statements, {x} is the answer (or its swapped alternative). */
  facts: { slot: string; kind: string; text: PerForm }[]
  trueFalsePrompt: PerForm
  photo: { slot: string; kind: string; prompt: PerForm }
  /** "צופן אישי": what can be enciphered (the prompt says what it is), and what gives the key. */
  cipherWords: { slot: string; prompt: PerForm }[]
  cipherKeys: { slot: string; about: PerForm }[]
  /** The key hint; {about} is the key's description, {name} etc. as in riddles. */
  cipherHint: PerForm
  /** The reward line when the buyer left fewer letter notes than mini-games. */
  rewards: PerForm[]
}

const all = (text: string): PerForm => ({ she: text, he: text, couple: text, group: text, company: text })

export const DEFAULT_MINIGAMES: MinigameContent = {
  after: [2, 4],
  types: [...MINIGAME_TYPES],
  lines: [
    'יאללה, זזים',
    'עוד חמש דקות',
    'מה אוכלים?',
    'יהיה בסדר',
    'אין על הים',
    'קודם כל קפה',
    'זה בכלל לא היה ככה',
    'מי בא איתי?',
    'רגע, רגע, רגע',
    'פעם אחרונה, נשבע',
    'אמרתי לכם',
    'שקט, זה השיר שלי',
    'תנו לי רגע',
    'בואו נזמין משהו',
  ],
  swaps: {
    food: [
      'פיצה',
      'סושי',
      'שקשוקה',
      'חומוס',
      'פסטה',
      'המבורגר',
      'שניצל',
      'מלאווח',
      'גלידה',
      'עוגת שוקולד',
      'מרק עוף',
      'קרואסון',
    ],
    place: [
      'הים',
      'הכנרת',
      'תל אביב',
      'ירושלים',
      'אילת',
      'הגולן',
      'מכתש רמון',
      'ברצלונה',
      'פריז',
      'הבית של סבתא',
      'בית הקפה בשכונה',
      'סיני',
    ],
    'word.she': ['רכה', 'מצחיקה', 'עקשנית', 'חולמת', 'שקטה', 'סקרנית', 'נדיבה', 'אמיצה', 'מתוקה'],
    'word.he': ['רך', 'מצחיק', 'עקשן', 'חולם', 'שקט', 'סקרן', 'נדיב', 'אמיץ', 'מתוק'],
    word: ['מתוקים', 'משוגעים', 'רגועים', 'מצחיקים', 'עקשנים', 'שקטים', 'סקרנים', 'חולמים'],
    dream: [
      'לטוס לתאילנד',
      'לפתוח בית קפה',
      'לרוץ מרתון',
      'לגדל כלב',
      'ללמוד לנגן בגיטרה',
      'לטייל בדרום אמריקה',
      'לכתוב ספר',
      'לראות את הזוהר הצפוני',
    ],
    tradition: [
      'קידוש בשישי בערב',
      'ארוחת בוקר בשבת',
      'מנגל ביום העצמאות',
      'טיול בפסח',
      'ערב סרט בחמישי',
      'פיצה ביום ראשון',
    ],
  },
  whoSaid: {
    slots: ['catchphrase', 'group_saying', 'company_catchphrase'],
    prompt: {
      she: 'איזה משפט {name} אומרת כל הזמן?',
      he: 'איזה משפט {name} אומר כל הזמן?',
      couple: 'איזה משפט {name} אומרים כל הזמן?',
      group: 'איזה משפט אומרים כל הזמן אצל {group_name}?',
      company: 'איזה משפט כולם אומרים ב{company_name}?',
    },
  },
  facts: [
    {
      slot: 'favorite_food',
      kind: 'food',
      text: {
        she: '{name} לא מוותרת אף פעם על {x}',
        he: '{name} לא מוותר אף פעם על {x}',
        couple: '{name} לא מוותרים אף פעם על {x}',
      },
    },
    { slot: 'favorite_place', kind: 'place', text: all('המקום שהכי עושה ל{name} טוב: {x}') },
    { slot: 'one_word', kind: 'word', text: all('{name} במילה אחת: {x}') },
    { slot: 'dream', kind: 'dream', text: all('החלום של {name}: {x}') },
    { slot: 'group_food', kind: 'food', text: { group: 'אצל {group_name} תמיד יש {x}' } },
    { slot: 'group_place', kind: 'place', text: { group: '{group_name} לא ישכחו את {x}' } },
    { slot: 'family_tradition', kind: 'tradition', text: { group: 'המסורת של {group_name}: {x}' } },
    {
      slot: 'kitchen_favorite',
      kind: 'food',
      text: { company: 'במטבחון של {company_name}, {x} נגמר ראשון' },
    },
    { slot: 'last_offsite', kind: 'place', text: { company: 'האוף-סייט האחרון של {company_name}: {x}' } },
  ],
  trueFalsePrompt: {
    she: 'מה נכון על {name}, ומה סתם?',
    he: 'מה נכון על {name}, ומה סתם?',
    couple: 'מה נכון על {name}, ומה סתם?',
    group: 'מה נכון על {group_name}, ומה סתם?',
    company: 'מה נכון על {company_name}, ומה סתם?',
  },
  photo: { slot: 'photo_where', kind: 'place', prompt: all('איפה צולמה התמונה הזאת?') },
  cipherWords: [
    { slot: 'one_word', prompt: all('המילה שהכי מתארת את {name}') },
    {
      slot: 'favorite_food',
      prompt: {
        she: 'מה {name} לא מוותרת עליו אף פעם',
        he: 'מה {name} לא מוותר עליו אף פעם',
        couple: 'מה {name} לא מוותרים עליו אף פעם',
      },
    },
    { slot: 'favorite_place', prompt: all('המקום שהכי עושה ל{name} טוב') },
    { slot: 'who_late', prompt: { group: 'מי תמיד מגיע אחרון אצל {group_name}' } },
    { slot: 'group_food', prompt: { group: 'מה תמיד יש אצל {group_name}' } },
    { slot: 'kitchen_favorite', prompt: { company: 'מה נגמר ראשון במטבחון של {company_name}' } },
  ],
  cipherKeys: [
    { slot: 'favorite_place', about: all('המקום שהכי עושה ל{name} טוב') },
    {
      slot: 'favorite_food',
      about: {
        she: 'מה ש{name} לא מוותרת עליו',
        he: 'מה ש{name} לא מוותר עליו',
        couple: 'מה ש{name} לא מוותרים עליו',
      },
    },
    { slot: 'one_word', about: all('המילה שהכי מתארת את {name}') },
    { slot: 'who_late', about: { group: 'השם של מי שתמיד מגיע אחרון' } },
    { slot: 'group_place', about: { group: 'המקום ש{group_name} לא ישכחו' } },
    { slot: 'last_offsite', about: { company: 'המקום של האוף-סייט האחרון' } },
  ],
  cipherHint: all('כל אות זזה קדימה באלף-בית. מזיזים כל אות אחורה כמספר האותיות (בלי רווחים) של: {about}'),
  rewards: [
    {
      she: '{name}, שכל מה שעוד מחכה לך יהיה טעים כמו היום.',
      he: '{name}, שכל מה שעוד מחכה לך יהיה טעים כמו היום.',
      couple: '{name}, שכל מה שעוד מחכה לכם יהיה טעים כמו היום.',
      group: '{group_name}, שכל מה שעוד מחכה לכם יהיה טעים כמו היום.',
      company: '{company_name}, שכל מה שעוד נבנה ביחד יהיה טעים כמו היום.',
    },
    {
      she: 'ושהחלום יתגשם, {name}: {dream}.',
      he: 'ושהחלום יתגשם, {name}: {dream}.',
      couple: 'ושהחלום יתגשם, {name}: {dream}.',
      group: 'ולכבוד {group_name}: {group_wish}.',
      company: 'ולכבוד {company_name}: עוד הרבה הצלחות.',
    },
  ],
}

// ---------- Seeded randomness (a sold game is reproducible from its seed) ----------

export function rng(seed: string): () => number {
  let h = 1779033703 ^ seed.length
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  let a = h >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function shuffle<T>(list: readonly T[], rand: () => number): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

// ---------- The Hebrew letter cipher ----------

export const ALEFBET = 'אבגדהוזחטיכלמנסעפצקרשת'
const FINALS: Record<string, string> = { ך: 'כ', ם: 'מ', ן: 'נ', ף: 'פ', ץ: 'צ' }

export const toNonFinal = (s: string) => s.replace(/[ךםןףץ]/g, (c) => FINALS[c])
export const hebrewLetterCount = (s: string) => [...toNonFinal(s)].filter((c) => ALEFBET.includes(c)).length

/** Shifts every Hebrew letter `by` places along the alef-bet (finals as their plain letter). */
export function shiftHebrew(text: string, by: number): string {
  const n = ALEFBET.length
  return [...toNonFinal(text)]
    .map((c) => {
      const i = ALEFBET.indexOf(c)
      return i < 0 ? c : ALEFBET[(((i + by) % n) + n) % n]
    })
    .join('')
}

// ---------- Building ----------

export interface MinigameInput {
  form: Form
  /** The answers as riddles see them (with the name slots filled). */
  answers: Record<string, string>
  questions: Question[]
  photos: string[]
  letterNotes: LetterNote[]
  content: MinigameContent
  /** How many stops the route has: a mini-game always comes before the last one. */
  stopCount: number
  /** Personal slots each stop's riddle shows, in route order: games prefer what was not seen yet. */
  riddleSlots?: string[][]
  seed: string
}

const norm = (s: string) => matchAnswerKey(s)
function matchAnswerKey(s: string) {
  return toNonFinal(s.normalize('NFC'))
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .toLowerCase()
}

/** The placements that fit the route: 1..stops-1, sorted, once each. */
export function placements(after: number[], stopCount: number): number[] {
  return [...new Set(after.filter((n) => Number.isInteger(n) && n >= 1 && n <= stopCount - 1))].sort(
    (a, b) => a - b,
  )
}

type Ctx = MinigameInput & { rand: () => number; avoid: Set<string> }

const answer = (c: Ctx, slot: string) => (c.answers[slot] ?? '').trim()
// Only the buyer's own answers count: a fallback or a hidden question's phrase is not personal.
const answered = (c: Ctx, slot: string) => !!answer(c, slot)
const fill = (c: Ctx, text: PerForm, extra: Record<string, string> = {}): TextPart[] =>
  fillTemplate(textFor(text, c.form) ?? '', { ...c.answers, ...extra }, c.questions, c.form).parts
const hasText = (text: PerForm, form: Form) => !!text[form]

function swapsFor(c: Ctx, kind: string): string[] {
  return c.content.swaps[`${kind}.${c.form}`] ?? c.content.swaps[kind] ?? []
}

/** Alternatives that are not the real answer, in a random order. */
function others(c: Ctx, pool: string[], real: string): string[] {
  const r = norm(real)
  return shuffle(
    [...new Set(pool.map((p) => p.trim()).filter(Boolean))].filter((p) => norm(p) !== r),
    c.rand,
  )
}

/** Slots not shown before this game first, then the rest (each group shuffled). */
function preferFresh<T extends { slot: string }>(c: Ctx, list: T[]): T[] {
  const s = shuffle(list, c.rand)
  return [...s.filter((x) => !c.avoid.has(x.slot)), ...s.filter((x) => c.avoid.has(x.slot))]
}

type Built = Omit<SnapshotMinigame, 'afterStop' | 'reward'>

function buildWhoSaid(c: Ctx): Built | null {
  if (!hasText(c.content.whoSaid.prompt, c.form)) return null
  const slot = c.content.whoSaid.slots.find((s) => answered(c, s))
  if (!slot) return null
  const real = answer(c, slot)
  const wrong = others(c, c.content.lines, real).slice(0, 3)
  if (wrong.length < 2) return null
  const options = shuffle([real, ...wrong], c.rand)
  return {
    type: 'who_said',
    prompt: fill(c, c.content.whoSaid.prompt),
    options,
    solution: { option: options.indexOf(real) },
    slots: [slot],
  }
}

function buildTrueFalse(c: Ctx): Built | null {
  if (!hasText(c.content.trueFalsePrompt, c.form)) return null
  const facts = preferFresh(
    c,
    c.content.facts.filter(
      (f) =>
        hasText(f.text, c.form) &&
        answered(c, f.slot) &&
        others(c, swapsFor(c, f.kind), answer(c, f.slot)).length > 0,
    ),
  )
  if (facts.length < 3) return null
  const chosen = facts.slice(0, 4)
  // At least one true and one false; the rest by chance.
  const truths = chosen.map(() => c.rand() < 0.5)
  if (truths.every(Boolean)) truths[Math.floor(c.rand() * truths.length)] = false
  if (!truths.some(Boolean)) truths[Math.floor(c.rand() * truths.length)] = true
  const statements = chosen.map((f, i) => {
    const real = answer(c, f.slot)
    const x = truths[i] ? real : others(c, swapsFor(c, f.kind), real)[0]
    return fill(c, f.text, { x }).map((p) => (p.t === 'slot' && p.slot === 'x' ? { ...p, slot: f.slot } : p))
  })
  return {
    type: 'true_false',
    prompt: fill(c, c.content.trueFalsePrompt),
    statements,
    solution: { truths },
    slots: chosen.map((f) => f.slot),
  }
}

function buildPhoto(c: Ctx): Built | null {
  const p = c.content.photo
  const photo = c.photos.find((x) => typeof x === 'string' && x.trim())
  if (!photo || !hasText(p.prompt, c.form) || !answered(c, p.slot)) return null
  const real = answer(c, p.slot)
  const wrong = others(c, swapsFor(c, p.kind), real).slice(0, 3)
  if (wrong.length < 2) return null
  const options = shuffle([real, ...wrong], c.rand)
  return {
    type: 'photo',
    prompt: fill(c, p.prompt),
    options,
    photo,
    focus: { x: 30 + Math.round(c.rand() * 40), y: 28 + Math.round(c.rand() * 40) },
    solution: { option: options.indexOf(real) },
    slots: [p.slot],
  }
}

function buildCipher(c: Ctx): Built | null {
  if (!hasText(c.content.cipherHint, c.form)) return null
  const words = preferFresh(
    c,
    c.content.cipherWords.filter((w) => {
      if (!hasText(w.prompt, c.form) || !answered(c, w.slot)) return false
      const v = answer(c, w.slot)
      const letters = hebrewLetterCount(v)
      // Hebrew letters and spaces only, short enough to decode on a phone.
      return /^[א-ת ]+$/.test(v) && letters >= 2 && letters <= 12 && v.split(/\s+/).length <= 2
    }),
  )
  for (const w of words) {
    const keys = preferFresh(
      c,
      c.content.cipherKeys.filter((k) => {
        if (k.slot === w.slot || !hasText(k.about, c.form) || !answered(c, k.slot)) return false
        const n = hebrewLetterCount(answer(c, k.slot))
        return n >= 2 && n <= 12
      }),
    )
    const key = keys[0]
    if (!key) continue
    const shift = hebrewLetterCount(answer(c, key.slot))
    const text = answer(c, w.slot)
    const about = fill(c, key.about)
      .map((p) => p.v)
      .join('')
    return {
      type: 'cipher',
      prompt: fill(c, w.prompt),
      cipher: shiftHebrew(text, shift),
      keyHint: fill(c, c.content.cipherHint, { about }).map((p) =>
        // The key's description reads as plain text; the honoree's name stays personal.
        p.t === 'slot' && p.slot === 'about' ? { t: 'text', v: p.v } : p,
      ),
      solution: { text, accepted: [toNonFinal(text)], shift },
      slots: [w.slot, key.slot],
    }
  }
  return null
}

const BUILDERS: Record<MinigameType, (c: Ctx) => Built | null> = {
  who_said: buildWhoSaid,
  true_false: buildTrueFalse,
  photo: buildPhoto,
  cipher: buildCipher,
}

/** The reward of the i-th game: the buyer's i-th letter note, else one of our lines. */
export function rewardFor(input: MinigameInput, i: number): MinigameReward {
  const note = input.letterNotes.filter((n) => n.text.trim())[i]
  if (note) return { text: note.text.trim(), signature: note.signature.trim() }
  const lines = input.content.rewards.filter((r) => textFor(r, input.form))
  const line = lines[i % Math.max(1, lines.length)]
  if (!line) return { text: '', signature: '' }
  const parts = fillTemplate(
    textFor(line, input.form) ?? '',
    input.answers,
    input.questions,
    input.form,
  ).parts
  return { text: parts.map((p) => p.v).join(''), signature: '' }
}

function seen(input: MinigameInput, afterStop: number): Set<string> {
  return new Set((input.riddleSlots ?? []).slice(0, afterStop).flat())
}

/** One game for a placement: the first type (in seeded order) the order has the data for. */
function buildOne(
  input: MinigameInput,
  afterStop: number,
  types: MinigameType[],
  used: Set<string>,
  seed: string,
) {
  const rand = rng(seed)
  const c: Ctx = { ...input, rand, avoid: new Set([...seen(input, afterStop), ...used]) }
  for (const type of shuffle(types, rand)) {
    const built = BUILDERS[type](c)
    if (built) return built
  }
  return null
}

/**
 * The order's mini-games: one per placement while the data lasts, each of a different type. An
 * order without enough personal content simply gets fewer (or none).
 */
export function buildMinigames(input: MinigameInput): SnapshotMinigame[] {
  const out: SnapshotMinigame[] = []
  const used = new Set<string>()
  const left = new Set(input.content.types.filter((t) => MINIGAME_TYPES.includes(t)))
  for (const afterStop of placements(input.content.after, input.stopCount)) {
    const built = buildOne(input, afterStop, [...left], used, `${input.seed}:${afterStop}`)
    if (!built) continue
    left.delete(built.type)
    for (const s of built.slots) used.add(s)
    out.push({ ...built, afterStop, reward: rewardFor(input, out.length) })
  }
  return out
}

/**
 * Builds the i-th game again with a new seed (the admin's "regenerate"): any type except the
 * other games' types. Null when the order has no data for another one.
 */
export function regenerateMinigame(
  input: MinigameInput,
  games: SnapshotMinigame[],
  index: number,
  seed: string,
): SnapshotMinigame | null {
  const current = games[index]
  if (!current) return null
  const otherTypes = new Set(games.filter((_, i) => i !== index).map((g) => g.type))
  const used = new Set(games.filter((_, i) => i !== index).flatMap((g) => g.slots))
  const types = input.content.types.filter((t) => MINIGAME_TYPES.includes(t) && !otherTypes.has(t))
  const built = buildOne(input, current.afterStop, types, used, seed)
  return built ? { ...built, afterStop: current.afterStop, reward: current.reward } : null
}

// ---------- Playing ----------

export type MinigameAnswer = { option?: number; truths?: boolean[]; text?: string }

export function checkMinigame(game: SnapshotMinigame, a: MinigameAnswer): boolean {
  const s = game.solution
  switch (game.type) {
    case 'who_said':
    case 'photo':
      return a.option != null && a.option === s.option
    case 'true_false':
      return (
        !!a.truths &&
        !!s.truths &&
        a.truths.length === s.truths.length &&
        a.truths.every((v, i) => v === s.truths![i])
      )
    case 'cipher':
      return matchAnswer(a.text ?? '', s.text ?? '', s.accepted ?? []).ok
  }
}

/** What a phone may see of a game: never the solution; the reward only once it is solved. */
export interface PublicMinigame {
  index: number
  type: MinigameType
  prompt: TextPart[]
  options: string[] | null
  statements: TextPart[][] | null
  photo: string | null
  focus: { x: number; y: number } | null
  cipher: string | null
  keyHint: TextPart[] | null
  alefbet: string | null
  solved: boolean
  reward: MinigameReward | null
}

export function publicMinigame(
  game: SnapshotMinigame,
  index: number,
  solved: boolean,
  fileUrl: (f: string) => string | null,
): PublicMinigame {
  return {
    index,
    type: game.type,
    prompt: game.prompt,
    options: game.options ?? null,
    statements: game.statements ?? null,
    photo: game.photo ? fileUrl(game.photo) : null,
    focus: game.focus ?? null,
    cipher: game.cipher ?? null,
    keyHint: game.keyHint ?? null,
    alefbet: game.type === 'cipher' ? ALEFBET : null,
    solved,
    reward: solved ? game.reward : null,
  }
}
