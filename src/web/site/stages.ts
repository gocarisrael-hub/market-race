// The order as a guided build: many short stages, one decision each. Pure logic: which stages a
// draft goes through, their paths, what each one checks, and where a visitor may land.
// The order is created on the server when the personal questions are done (photos need it); every
// later stage that changes the order updates it.
import type { Question, Shop } from './api.ts'
import { copy } from './copy.ts'
import {
  answersError,
  type BuildStageKey,
  buyerErrors,
  type Draft,
  draftRecipient,
  formChoice,
  hintQuestionsError,
  orderableThemes,
  palettesFor,
  priceAgorot,
  recipientsFor,
} from './logic.ts'

export type StageKey = BuildStageKey

/** Every stage in build order. `for` is skipped when the occasion has one recipient; notes and
 * hints when the questions are answered later. How many come is asked right after who it is for,
 * so the price is clear from the start. */
export const STAGE_ORDER: StageKey[] = [
  'occasion',
  'for',
  'people',
  'name',
  'look',
  'questions',
  'photos',
  'notes',
  'hints',
  'diet',
  'details',
  'pay',
]

/** Stages that need the order on the server. */
const NEEDS_ORDER: StageKey[] = ['photos', 'notes', 'hints', 'diet', 'details', 'pay']
/** Stages whose path carries the order's token (also opened from the manage page or an email). */
export const TOKEN_STAGES: StageKey[] = ['photos', 'details', 'pay']
/** Stages that edit what the order holds: leaving them saves it (once the order exists). */
export const SAVES_ORDER: StageKey[] = ['notes', 'hints', 'people', 'diet']

export const QUESTIONS_PER_STAGE = 3

export type Stage = { key: StageKey; part: number }

export const sameStage = (a: Stage, b: Stage) => a.key === b.key && a.part === b.part
export const needsOrder = (key: StageKey) => NEEDS_ORDER.includes(key)
/** From the name on, a stage needs the occasion's questions (the name label, the question parts). */
export const needsQuestions = (key: StageKey) => STAGE_ORDER.indexOf(key) >= STAGE_ORDER.indexOf('name')

/**
 * The questions in small groups, a few per screen, as even as possible (7 → 3, 2, 2). Answering
 * later leaves one screen with only that choice; no questions at all, no screen.
 */
export function questionParts(asked: Question[], answersLater: boolean): Question[][] {
  if (answersLater) return [[]]
  if (!asked.length) return []
  const n = Math.ceil(asked.length / QUESTIONS_PER_STAGE)
  const parts: Question[][] = []
  let at = 0
  for (let i = 0; i < n; i++) {
    const size = Math.ceil((asked.length - at) / (n - i))
    parts.push(asked.slice(at, at + size))
    at += size
  }
  return parts
}

/** The stages of this draft, in order. Before the questions are known, they count as one part. */
export function buildStages(shop: Shop, d: Draft, parts: Question[][] | null): Stage[] {
  const occ = shop.occasions.find((o) => o.key === d.occasionKey)
  const out: Stage[] = []
  for (const key of STAGE_ORDER) {
    if (key === 'for' && occ && recipientsFor(occ).length <= 1) continue
    if ((key === 'notes' || key === 'hints') && d.answersLater) continue
    if (key === 'questions') {
      const n = parts ? parts.length : 1
      for (let p = 1; p <= n; p++) out.push({ key, part: p })
      continue
    }
    out.push({ key, part: 1 })
  }
  return out
}

/** The path of a stage. Token stages need the order's token. */
export function stagePath(s: Stage, token: string | null): string {
  if (s.key === 'occasion') return '/order'
  if (s.key === 'questions') return s.part > 1 ? `/order/questions/${s.part}` : '/order/questions'
  if (TOKEN_STAGES.includes(s.key)) return `/order/${token ?? ''}/${s.key}`
  return `/order/${s.key}`
}

/** The name step: the she/he switch (when offered), then the name. */
export function nameError(d: Draft, shop: Shop): string | null {
  const forms = formChoice(shop, d)
  if (!d.form || (forms.length > 0 && !(d.recipient && forms.includes(d.recipient))))
    return copy.questions.pickForm
  if (!d.honoreeName.trim()) return copy.questions.missingName(d.form)
  if ([...d.honoreeName.trim()].length > 40) return copy.questions.tooLong
  return null
}

/** What is missing on a stage before moving on, or null. */
export function stageError(s: Stage, d: Draft, shop: Shop, parts: Question[][] | null): string | null {
  switch (s.key) {
    case 'occasion': {
      const occ = shop.occasions.find((o) => o.key === d.occasionKey && o.audience === 'private')
      return !occ || recipientsFor(occ).length === 0 ? copy.home.pickOccasion : null
    }
    case 'for':
      return draftRecipient(shop, d) ? null : copy.home.pickRecipient
    case 'name':
      return nameError(d, shop)
    case 'look': {
      if (!orderableThemes(shop).some((t) => t.id === d.themeId)) return copy.home.pickTheme
      const pals = palettesFor(shop, d.themeId)
      return pals.length && !pals.some((p) => p.id === d.paletteId) ? copy.home.pickPalette : null
    }
    case 'questions':
      if (d.answersLater) return null
      return answersError(d.answers, parts?.[s.part - 1] ?? [])
    case 'hints':
      return hintQuestionsError(d.hintQuestions)
    case 'people':
      if (d.people < Math.max(1, shop.minPeople) || d.people > shop.maxPeople) return copy.errors.bad_people
      return priceAgorot(shop, d.occasionKey, d.people) === null ? copy.errors.no_price : null
    case 'details':
      return Object.values(buyerErrors(d.buyer))[0] ?? null
    default:
      return null
  }
}

/**
 * Where a visitor asking for stage `index` may land: the first earlier stage that is not done,
 * else the last stage before the photos when the order does not exist yet, else `index`.
 */
export function gateStage(
  stages: Stage[],
  index: number,
  d: Draft,
  shop: Shop,
  parts: Question[][] | null,
): number {
  for (let i = 0; i < index; i++) if (stageError(stages[i], d, shop, parts)) return i
  if (needsOrder(stages[index].key) && !d.manageToken) {
    const photos = stages.findIndex((s) => s.key === 'photos')
    return Math.max(0, photos - 1)
  }
  return index
}

/**
 * The index of the asked stage in the list. A stage this draft skips (or a question part beyond
 * the last) lands on the next stage that exists.
 */
export function findStage(stages: Stage[], asked: Stage): number {
  const exact = stages.findIndex((s) => sameStage(s, asked))
  if (exact >= 0) return exact
  const rank = (s: Stage) => STAGE_ORDER.indexOf(s.key) * 100 + s.part
  const after = stages.findIndex((s) => rank(s) >= rank(asked))
  return after >= 0 ? after : stages.length - 1
}

/** The last question part leads to the photos: leaving it creates (or updates) the order. */
export const createsOrder = (stages: Stage[], index: number) => stages[index + 1]?.key === 'photos'

/** Where stops sit on the drawn route: `n` points evenly along it, 0..1 (first and last at the ends). */
export const stopFractions = (n: number) => (n <= 1 ? [0] : Array.from({ length: n }, (_, i) => i / (n - 1)))
