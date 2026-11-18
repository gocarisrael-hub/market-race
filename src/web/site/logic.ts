// Pure logic of the order flow: prices, step validation, the draft kept between steps.
import type { Buyer, LetterNote, Occasion, OrderPayload, Question, Shop, Theme } from './api.ts'
import { copy, type SiteForm } from './copy.ts'

export const MAX_NOTES = 3
export const MAX_PHOTOS = 5
const PHONE = /^[0-9+\-\s]{9,16}$/
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const SITE_FORMS: SiteForm[] = ['she', 'he', 'couple']

export type Draft = {
  occasionKey: string | null
  form: SiteForm | null
  themeId: number | null
  people: number
  allergens: string[]
  diets: string[]
  honoreeName: string
  answers: Record<string, string>
  letterNotes: LetterNote[]
  answersLater: boolean
  buyer: Buyer
  /** Set once the order exists on the server (end of step 2). */
  manageToken: string | null
  /** The payload last saved to the server, to skip saving when nothing changed. */
  savedKey: string | null
}

export function emptyDraft(minPeople = 2): Draft {
  return {
    occasionKey: null,
    form: null,
    themeId: null,
    people: Math.max(minPeople, 4),
    allergens: [],
    diets: [],
    honoreeName: '',
    answers: {},
    letterNotes: [],
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

/** Themes whose market has an active route: an order needs both. */
export const orderableThemes = (shop: Shop): Theme[] =>
  shop.themes.filter((t) => shop.routes.some((r) => r.marketId === t.marketId))

export const clampPeople = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(Number.isFinite(n) ? n : min)))

/** Applies an occasion choice: keeps the form when still allowed, auto-picks a single one. */
export function chooseOccasion(d: Draft, occ: Occasion): Draft {
  const forms = formsFor(occ)
  const form = d.form && forms.includes(d.form) ? d.form : forms.length === 1 ? forms[0] : null
  return { ...d, occasionKey: occ.key, form }
}

export const toggle = (list: string[], v: string) =>
  list.includes(v) ? list.filter((x) => x !== v) : [...list, v]

/** Error message for step 1, or null when it is complete. */
export function step1Error(d: Draft, shop: Shop): string | null {
  const occ = shop.occasions.find((o) => o.key === d.occasionKey && o.audience === 'private')
  if (!occ) return copy.home.pickOccasion
  if (!d.form || !formsFor(occ).includes(d.form)) return copy.home.pickForm
  if (!orderableThemes(shop).some((t) => t.id === d.themeId)) return copy.home.pickTheme
  if (d.people < shop.minPeople || d.people > shop.maxPeople) return copy.errors.bad_people
  if (priceAgorot(shop, d.occasionKey, d.people) === null) return copy.errors.no_price
  return null
}

const len = (s: string) => [...s.trim()].length

/** Error message for step 2 (questions), or null. */
export function step2Error(d: Draft, questions: Question[]): string | null {
  if (!d.honoreeName.trim()) return copy.questions.missingName(d.form ?? 'she')
  if (len(d.honoreeName) > 40) return copy.questions.tooLong
  if (d.answersLater) return null
  return answersError(d.answers, questions)
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
    for (const q of questions) {
      const v = (d.answers[q.slot] ?? '').trim()
      if (v) answers[q.slot] = v
    }
  return {
    occasionKey: d.occasionKey ?? '',
    form: d.form ?? 'she',
    honoreeName: d.honoreeName.trim(),
    themeId: d.themeId ?? 0,
    people: d.people,
    allergens: d.allergens,
    diets: d.diets,
    answers,
    letterNotes: d.answersLater ? [] : cleanNotes(d.letterNotes),
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
  | { page: 'home' }
  | { page: 'questions' }
  | { page: 'photos'; token: string }
  | { page: 'checkout'; token: string }
  | { page: 'payDone' }
  | { page: 'payMock' }
  | { page: 'companyPay'; token: string }
  | { page: 'manage'; token: string }
  | { page: 'companies' }
  | { page: 'notFound' }

export function parseRoute(pathname: string): Route {
  const p = pathname.replace(/\/+$/, '') || '/'
  if (p === '/') return { page: 'home' }
  if (p === '/order/questions') return { page: 'questions' }
  if (p === '/companies') return { page: 'companies' }
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
