// Pure logic of the order flow: prices, step validation, the draft kept between steps.
import type {
  Buyer,
  HintQuestion,
  LetterNote,
  Occasion,
  OrderPayload,
  PreviewStop,
  Question,
  Shop,
  ShopPalette,
  Theme,
} from './api.ts'
import { copy, type SiteForm, type SiteRecipient } from './copy.ts'

export const MAX_NOTES = 3
export const MAX_HINT_QUESTIONS = 5
export const MAX_PHOTOS = 5
const PHONE = /^[0-9+\-\s]{9,16}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SITE_FORMS: SiteForm[] = ['she', 'he', 'couple', 'group']
/** Who the game can be for, in the order they are offered: one person first. */
export const SITE_RECIPIENTS: SiteRecipient[] = ['she', 'he', 'couple', 'group', 'family']
export const RECIPIENT_FORM: Record<SiteRecipient, SiteForm> = {
  she: 'she',
  he: 'he',
  couple: 'couple',
  group: 'group',
  family: 'group',
}

export type Draft = {
  occasionKey: string | null
  /** Who the game is for; picks the questions with the occasion. */
  recipient: SiteRecipient | null
  /** The grammar of the recipient (kept with it). */
  form: SiteForm | null
  themeId: number | null
  /** The palette the map is played in; null plays the map's own colors. */
  paletteId: number | null
  people: number
  allergens: string[]
  diets: string[]
  honoreeName: string
  answers: Record<string, string>
  letterNotes: LetterNote[]
  /** Optional personal questions that unlock hints in the game. */
  hintQuestions: HintQuestion[]
  answersLater: boolean
  buyer: Buyer
  /** Set once the order exists on the server (end of step 2). */
  manageToken: string | null
  /** The payload last saved to the server, to skip saving when nothing changed. */
  savedKey: string | null
}

export function emptyDraft(minPeople = 1): Draft {
  return {
    occasionKey: null,
    recipient: null,
    form: null,
    themeId: null,
    paletteId: null,
    people: Math.max(minPeople, 4),
    allergens: [],
    diets: [],
    honoreeName: '',
    answers: {},
    letterNotes: [],
    hintQuestions: [],
    answersLater: false,
    buyer: { name: '', phone: '', email: '' },
    manageToken: null,
    savedKey: null,
  }
}

/** Order total in agorot, or null when the occasion has no price. Same formula as the server. */
export function priceAgorot(shop: Pick<Shop, 'prices'>, occasionKey: string | null, people: number) {
  if (!occasionKey) return null
  const p = shop.prices?.[occasionKey]
  if (!p) return null
  const total = Math.round(p.base + p.perPerson * people)
  return total > 0 ? total : null
}

/** "396 ₪", "12.50 ₪". */
export function formatShekels(agorot: number) {
  const s = agorot % 100 === 0 ? String(agorot / 100) : (agorot / 100).toFixed(2)
  return `${s.replace(/\B(?=(\d{3})+(?!\d))/g, ',')} ${copy.shekel}`
}

export const privateOccasions = (shop: Shop) => shop.occasions.filter((o) => o.audience === 'private')
export const companyOccasions = (shop: Shop) => shop.occasions.filter((o) => o.audience === 'company')

/** The grammatical forms the buyer can pick for an occasion (company is never a site form). */
export const formsFor = (occ: Occasion | undefined): SiteForm[] =>
  occ ? SITE_FORMS.filter((f) => occ.forms.includes(f)) : []

/** The recipient an old form stands for (a group on a family occasion is the family). */
const recipientOfForm = (form: SiteForm, occ: Occasion | undefined): SiteRecipient =>
  form === 'group' && occ?.decor === 'family' ? 'family' : form

/** Who the game can be for on an occasion, one person first. */
export function recipientsFor(occ: Occasion | undefined): SiteRecipient[] {
  if (!occ) return []
  const own = occ.recipients ?? formsFor(occ).map((f) => recipientOfForm(f, occ))
  return SITE_RECIPIENTS.filter((r) => own.includes(r))
}

/** Sets the recipient and its grammar. */
export const withRecipient = (d: Draft, recipient: SiteRecipient | null): Draft => ({
  ...d,
  recipient,
  form: recipient ? RECIPIENT_FORM[recipient] : null,
})

/** The draft's recipient, also for a draft saved before recipients existed (form only). */
export function draftRecipient(shop: Shop, d: Draft): SiteRecipient | null {
  const occ = shop.occasions.find((o) => o.key === d.occasionKey)
  const offered = recipientsFor(occ)
  const r = d.recipient ?? (d.form ? recipientOfForm(d.form, occ) : null)
  return r && offered.includes(r) ? r : null
}

/** Themes whose market has an active route: an order needs both. */
export const orderableThemes = (shop: Shop): Theme[] =>
  shop.themes.filter((t) => shop.routes.some((r) => r.marketId === t.marketId))

/** The route an order for this theme gets: the market's first route (same as the server). */
export const routeForTheme = (shop: Shop, themeId: number | null | undefined) => {
  const theme = shop.themes.find((t) => t.id === themeId)
  if (!theme) return undefined
  return shop.routes.filter((r) => r.marketId === theme.marketId).sort((a, b) => a.id - b.id)[0]
}

/** The stops as listed, before the buyer's allergens and diets are applied. */
export const listedStops = (route: Shop['routes'][number] | undefined): PreviewStop[] =>
  (route?.tastings ?? []).map((t) => ({
    teaser: t.teaser,
    icon: t.icon,
    finale: t.finale,
    status: 'as_listed',
  }))

/** The palettes a theme can be played in (the default first). */
export const palettesFor = (shop: Shop, themeId: number | null | undefined): ShopPalette[] =>
  shop.themes.find((t) => t.id === themeId)?.palettes ?? []

/** The palette shown for the draft: the chosen one, else the theme's first, else none. */
export const currentPalette = (shop: Shop, d: Pick<Draft, 'themeId' | 'paletteId'>) => {
  const list = palettesFor(shop, d.themeId)
  return list.find((p) => p.id === d.paletteId) ?? list[0] ?? null
}

/** Applies a theme choice: keeps the palette when the new map offers it, else its default. */
export function chooseTheme(shop: Shop, d: Draft, themeId: number): Draft {
  const list = palettesFor(shop, themeId)
  const paletteId = list.some((p) => p.id === d.paletteId) ? d.paletteId : (list[0]?.id ?? null)
  return { ...d, themeId, paletteId }
}

/** The doodle set of the draft's occasion, or null before one is picked. */
export const decorFor = (shop: Shop, occasionKey: string | null | undefined): string | null => {
  const occ = shop.occasions.find((o) => o.key === occasionKey)
  return occ ? (occ.decor ?? 'generic') : null
}

export const clampPeople = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)))

/**
 * Applies an occasion choice: keeps the recipient when the occasion offers it, else picks the
 * first one it offers. One person comes first, so a gift for her (or him) is the default.
 */
export function chooseOccasion(d: Draft, occ: Occasion): Draft {
  const offered = recipientsFor(occ)
  const keep = d.recipient && offered.includes(d.recipient) ? d.recipient : null
  return withRecipient({ ...d, occasionKey: occ.key }, keep ?? offered[0] ?? null)
}

export const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

/** Error message for step 1, or null when it is complete. */
export function step1Error(d: Draft, shop: Shop): string | null {
  const occ = shop.occasions.find((o) => o.key === d.occasionKey && o.audience === 'private')
  if (!occ || recipientsFor(occ).length === 0) return copy.home.pickOccasion
  if (!draftRecipient(shop, d)) return copy.home.pickRecipient
  if (!orderableThemes(shop).some((t) => t.id === d.themeId)) return copy.home.pickTheme
  const pals = palettesFor(shop, d.themeId)
  if (pals.length && !pals.some((p) => p.id === d.paletteId)) return copy.home.pickPalette
  if (d.people < Math.max(1, shop.minPeople) || d.people > shop.maxPeople) return copy.errors.bad_people
  if (priceAgorot(shop, d.occasionKey, d.people) === null) return copy.errors.no_price
  return null
}

const len = (s: string) => [...s.trim()].length

/**
 * The small she/he switch next to the name on the questions step: only for a gift to one person,
 * when the occasion offers both. Never for a couple, a group or a family.
 */
export function formChoice(shop: Shop, d: Draft): SiteRecipient[] {
  const r = draftRecipient(shop, d)
  if (r !== 'she' && r !== 'he') return []
  const offered = recipientsFor(shop.occasions.find((o) => o.key === d.occasionKey))
  return offered.includes('she') && offered.includes('he') ? ['she', 'he'] : []
}

/** Error message for step 2 (questions), or null. */
export function step2Error(d: Draft, questions: Question[], forms: SiteRecipient[] = []): string | null {
  if (!d.form || (forms.length > 0 && !(d.recipient && forms.includes(d.recipient))))
    return copy.questions.pickForm
  if (!d.honoreeName.trim()) return copy.questions.missingName(d.form)
  if (len(d.honoreeName) > 40) return copy.questions.tooLong
  if (d.answersLater) return null
  return answersError(d.answers, askedQuestions(questions, d.form)) ?? hintQuestionsError(d.hintQuestions)
}

/** Personal hint questions with both a question and an answer, trimmed. Empty rows are dropped. */
export const cleanHintQuestions = (list: HintQuestion[] | null | undefined): HintQuestion[] =>
  (list ?? [])
    .map((q) => ({ question: q.question.trim(), answer: q.answer.trim() }))
    .filter((q) => q.question && q.answer)

/** A row with only one side filled is an error (the game could not check it). */
export function hintQuestionsError(list: HintQuestion[] | null | undefined): string | null {
  for (const q of list ?? []) {
    const hasQ = !!q.question.trim()
    const hasA = !!q.answer.trim()
    if (hasQ !== hasA) return copy.hintQuestions.incomplete
    if (len(q.question) > 140 || len(q.answer) > 60) return copy.questions.tooLong
  }
  return null
}

/** The players stepper on the captain's start: 1..the portions bought. */
export const clampPlayers = (n: number, max: number) => clampPeople(n, 1, Math.max(1, max))

/**
 * The questions shown as fields. A group's name is asked in the name field (labelled with the
 * group_name question), so it is not asked twice.
 */
export const askedQuestions = (questions: Question[], form: string | null | undefined) =>
  form === 'group' ? questions.filter((q) => q.slot !== 'group_name') : questions

/** The name field's label: for a group, the question set's own group_name question. */
export function nameLabel(questions: Question[], form: SiteForm | null): string {
  const own = form === 'group' ? questions.find((q) => q.slot === 'group_name')?.text : undefined
  return own || copy.questions.name(form)
}

export function answersError(answers: Record<string, string>, questions: Question[]): string | null {
  for (const q of questions) {
    const v = answers[q.slot] ?? ''
    if (q.required && !v.trim()) return copy.questions.missingRequired
    if (q.maxLen > 0 && len(v) > q.maxLen) return copy.questions.tooLong
  }
  return null
}

export function buyerErrors(b: Buyer): Partial<Record<keyof Buyer, string>> {
  const e: Partial<Record<keyof Buyer, string>> = {}
  if (!b.name.trim()) e.name = copy.checkout.badName
  if (!PHONE.test(b.phone.trim())) e.phone = copy.checkout.badPhone
  if (!EMAIL.test(b.email.trim())) e.email = copy.checkout.badEmail
  return e
}

export const validPhone = (s: string) => PHONE.test(s.trim())
export const validEmail = (s: string) => EMAIL.test(s.trim())

export type Lead = {
  companyName: string
  contactName: string
  phone: string
  email: string
  occasionKey: string | null
  people: string
  preferredDate: string
  message: string
}

/** Field errors of a lead form, empty when it can be sent. */
export function leadErrors(l: Lead): Partial<Record<keyof Lead, string>> {
  const e: Partial<Record<keyof Lead, string>> = {}
  if (!l.companyName.trim()) e.companyName = copy.companies.badCompany
  if (!l.contactName.trim()) e.contactName = copy.companies.badContact
  if (!validPhone(l.phone)) e.phone = copy.checkout.badPhone
  if (!validEmail(l.email)) e.email = copy.checkout.badEmail
  if (l.people.trim() && !/^\d{1,3}$/.test(l.people.trim())) e.people = copy.companies.badPeople
  return e
}

/** Notes with any text, trimmed. */
export const cleanNotes = (notes: LetterNote[]) =>
  notes.map((n) => ({ text: n.text.trim(), signature: n.signature.trim() })).filter((n) => n.text)

/** The body for POST/PUT /api/orders (without the buyer, added at the last step). */
export function orderPayload(d: Draft, questions: Question[]): OrderPayload {
  const answers: Record<string, string> = {}
  if (!d.answersLater)
    for (const q of askedQuestions(questions, d.form)) {
      const v = (d.answers[q.slot] ?? '').trim()
      if (v) answers[q.slot] = v
    }
  // A group's name is the name field (the server fills the slot from it as well).
  if (d.form === 'group' && questions.some((q) => q.slot === 'group_name') && d.honoreeName.trim())
    answers.group_name = d.honoreeName.trim()
  const recipient = d.recipient ?? d.form ?? 'she'
  return {
    occasionKey: d.occasionKey ?? '',
    recipient,
    form: RECIPIENT_FORM[recipient],
    honoreeName: d.honoreeName.trim(),
    themeId: d.themeId ?? 0,
    paletteId: d.paletteId ?? null,
    people: d.people,
    allergens: d.allergens,
    diets: d.diets,
    answers,
    letterNotes: d.answersLater ? [] : cleanNotes(d.letterNotes),
    hintQuestions: d.answersLater ? [] : cleanHintQuestions(d.hintQuestions),
    answersLater: d.answersLater,
  }
}

export const payloadKey = (p: OrderPayload) => JSON.stringify(p)

/** What to do with the server order when leaving step 2. */
export function saveAction(d: Draft, key: string): 'create' | 'update' | 'none' {
  if (!d.manageToken) return 'create'
  return d.savedKey === key ? 'none' : 'update'
}

export const errorText = (code: string) => copy.errors[code] ?? copy.errors.generic

// Draft persistence. Storage can be missing (private mode); the flow still works in memory.
const KEY = 'market-race:draft'
export function loadDraft(): Draft | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const d = JSON.parse(raw)
    return d && typeof d === 'object' ? { ...emptyDraft(), ...d } : null
  } catch {
    return null
  }
}
export function saveDraft(d: Draft) {
  try {
    localStorage.setItem(KEY, JSON.stringify(d))
  } catch {}
}
export function clearDraft() {
  try {
    localStorage.removeItem(KEY)
  } catch {}
}

/** Parses the site path into a page. */
export type Route =
  | { page: 'landing' }
  | { page: 'tastings' }
  | { page: 'home' }
  | { page: 'questions' }
  | { page: 'photos'; token: string }
  | { page: 'checkout'; token: string }
  | { page: 'payDone' }
  | { page: 'payMock' }
  | { page: 'companyPay'; token: string }
  | { page: 'manage'; token: string }
  | { page: 'companies' }
  | { page: 'lostLink' }
  | { page: 'notFound' }

export function parseRoute(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/'
  // The landing page explains the product; the order starts at /order (old links to /order/... keep
  // working).
  if (p === '/') return { page: 'landing' }
  if (p === '/tastings') return { page: 'tastings' }
  if (p === '/order') return { page: 'home' }
  if (p === '/order/questions') return { page: 'questions' }
  if (p === '/companies') return { page: 'companies' }
  if (p === '/lost-link') return { page: 'lostLink' }
  if (p === '/pay/done') return { page: 'payDone' }
  if (p === '/pay/mock') return { page: 'payMock' }
  let m = p.match(/^\/order\/([A-Za-z0-9_-]{10,64})\/(photos|pay)$/)
  if (m) return { page: m[2] === 'photos' ? 'photos' : 'checkout', token: m[1] }
  m = p.match(/^\/pay\/([A-Za-z0-9_-]{10,64})$/)
  if (m) return { page: 'companyPay', token: m[1] }
  m = p.match(/^\/m\/([A-Za-z0-9_-]{10,64})$/)
  if (m) return { page: 'manage', token: m[1] }
  return { page: 'notFound' }
}

export const whatsappShare = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`

/** Message the /pay/done page posts to its parent window. */
export const PAY_MESSAGE = 'market-race:pay-done'
export type PayMessage = { type: typeof PAY_MESSAGE; token: string; ok: boolean }
export const isPayMessage = (data: unknown): data is PayMessage =>
  !!data && typeof data === 'object' && (data as PayMessage).type === PAY_MESSAGE

/** Error message for the manage page's edit form (name, answers), or null. */
export function editError(
  name: string,
  answers: Record<string, string>,
  questions: Question[],
  form: SiteForm,
  hintQuestions: HintQuestion[] = [],
): string | null {
  if (!name.trim()) return copy.questions.missingName(form)
  if (len(name) > 40) return copy.questions.tooLong
  return answersError(answers, questions) ?? hintQuestionsError(hintQuestions)
}
