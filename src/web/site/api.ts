// Thin client for the site API (src/server/routes/public-orders.ts).
import type { Palette, ThemeStyle } from '../../server/domain/types.ts'
import type { SiteForm, SiteRecipient } from './copy.ts'

export type Occasion = {
  key: string
  label: string
  audience: 'private' | 'company'
  forms: string[]
  /** Who the game can be for, one person first. Missing from older servers: derived from forms. */
  recipients?: string[]
  /** The occasion's own name for a recipient (e.g. "לילדה"); missing: the default. */
  recipientLabels?: Record<string, string>
  /** Doodle set of the occasion (birthday, love, ...). */
  decor?: string
  /** A kids' game (some tastings are served differently). Missing from older servers. */
  forKids?: boolean
}
/** A color palette a map can be played in. */
export type ShopPalette = { id: number; name: string; palette: Palette }
export type Theme = {
  id: number
  /** Stable key of a seeded style; null for the owner's own. */
  key?: string | null
  name: string
  marketId: number
  map: string | null
  palette: Palette
  /** Fonts, treatment and illustrations. Missing from older servers: the base look. */
  style?: ThemeStyle
  /** The occasions (and recipients) it is offered for; empty or missing: every one. */
  occasionKeys?: string[]
  recipients?: string[]
  /** The palettes offered for this map, the default first. Empty: the map's own colors. */
  palettes?: ShopPalette[]
}
/** What a stop serves, as buyers see it before purchase: no stall or tasting names. */
export type RouteTasting = {
  teaser: string
  icon: string | null
  allergens: string[]
  diets: string[]
  finale: boolean
}
export type PreviewStatus = 'as_listed' | 'swapped' | 'blocked'
export type PreviewStop = { teaser: string; icon: string | null; finale: boolean; status: PreviewStatus }
export type Shop = {
  brand: string
  occasions: Occasion[]
  markets: { id: number; name: string }[]
  themes: Theme[]
  routes: { id: number; marketId: number; name: string; stops: number; tastings: RouteTasting[] }[]
  prices: Record<string, { base: number; perPerson: number }>
  minPeople: number
  maxPeople: number
  /** The companies site's group size range. Missing from older servers. */
  companyPeople?: { min: number; max: number }
  validYears: number
  /** How long a game takes, in the owner's words; empty when not set. */
  gameDuration: string
  allergens: string[]
  diets: string[]
  cardEnabled: boolean
}
export type Question = {
  slot: string
  text: string
  /** A short example answer, shown as "למשל: …" in the empty field. Missing from older servers. */
  example?: string
  required: boolean
  maxLen: number
}
export type LetterNote = { text: string; signature: string }
/** A personal question about the honoree, asked in the game to unlock a hint. */
export type HintQuestion = { question: string; answer: string }
export type Buyer = { name: string; phone: string; email: string }
export type OrderPayload = {
  occasionKey: string
  recipient: SiteRecipient
  form: SiteForm
  honoreeName: string
  themeId: number
  paletteId: number | null
  people: number
  allergens: string[]
  diets: string[]
  answers: Record<string, string>
  letterNotes: LetterNote[]
  hintQuestions: HintQuestion[]
  answersLater: boolean
}
export type Manage = {
  orderNo: string
  kind: 'private' | 'company'
  status: string
  paid: boolean
  honoree: string
  form: string
  /** Who the game is for (null for a company game). */
  recipient?: string | null
  occasionKey: string
  /** The occasion's doodle set. */
  decor?: string
  people: number
  amountAgorot: number
  validUntil: string | null
  gameLink: string | null
  qr: string | null
  /** The captain's start: whether it can start now (or why not), and up to how many players. */
  start: { can: boolean; reason: 'not_ready' | 'started' | 'expired' | null; maxPlayers: number }
  started: boolean
  /** Players who arrived, chosen at the start. */
  players: number | null
  /** After the start: the WhatsApp text for the players (the owner's template, filled). */
  invite: { text: string } | null
  /** Paused by the captain: the stop they stopped at, of how many. */
  paused: { stop: number; total: number } | null
  /** Whether the captain can resume now, or why not. */
  resume: { can: boolean; reason: 'not_paused' | 'expired' | null }
  /** The game link with the captain token: the captain's own phone, which can pause the game. */
  captainLink: string | null
  progress: { step: string; stopIndex: number; total: number; redeemed: number } | null
  needsAnswers: boolean
  photos: { count: number; editable: boolean }
  /** The buyer can still change name, answers, notes, photos and color (until the game starts). */
  editable: boolean
  honoreeName?: string
  letterNotes?: LetterNote[]
  hintQuestions?: HintQuestion[]
  /** The color choice for the edit form: the map, its palettes (default first) and the chosen id. */
  look?: {
    /** The chosen style, and the styles it can change to (offered for the occasion, same market). */
    themeId?: number
    map: string | null
    themePalette: Palette
    paletteId: number | null
    palettes: ShopPalette[]
    themes?: (Pick<Theme, 'id' | 'name' | 'map' | 'palette' | 'style'> & { palettes: ShopPalette[] })[]
  } | null
  answers?: Record<string, string>
  questions?: Question[]
}
export type PhotoBackground = 'keep' | 'remove'
export type Photo = {
  id: string | number
  url: string
  previewUrl: string
  /** Keep the background, or the subject cut out on paper. */
  background: PhotoBackground
  /** A cutout is stored: switching to "without background" needs no new cut. */
  hasCutout: boolean
  /** The buyer asked for a cutout and the browser could not make one. */
  cutFailed: boolean
}

/** An API error with the server's code (`bad_people`, `card_disabled`, ...) or `network`. */
export class ApiError extends Error {
  code: string
  status: number
  constructor(code: string, status: number) {
    super(code)
    this.code = code
    this.status = status
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init
  let res: Response
  try {
    res = await fetch(path, {
      ...rest,
      headers: json !== undefined ? { 'content-type': 'application/json', ...rest.headers } : rest.headers,
      body: json !== undefined ? JSON.stringify(json) : rest.body,
    })
  } catch {
    throw new ApiError('network', 0)
  }
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(res.status === 429 ? 'rate' : data?.error || 'generic', res.status)
  return data as T
}

let shopPromise: Promise<Shop> | null = null
export const getShop = () => {
  shopPromise ??= api<Shop>('/api/shop').catch((e) => {
    shopPromise = null
    throw e
  })
  return shopPromise
}

export const getQuestions = (occasion: string, recipient: string) =>
  api<{ questions: Question[] }>(
    `/api/shop/questions?occasion=${encodeURIComponent(occasion)}&recipient=${encodeURIComponent(recipient)}`,
  ).then((r) => r.questions)

export const getRoutePreview = (
  themeId: number,
  allergens: string[],
  diets: string[],
  signal?: AbortSignal,
  occasionKey?: string | null,
) =>
  api<{ stops: PreviewStop[] }>(
    `/api/shop/route-preview?themeId=${themeId}&allergens=${encodeURIComponent(allergens.join(','))}&diets=${encodeURIComponent(diets.join(','))}${occasionKey ? `&occasion=${encodeURIComponent(occasionKey)}` : ''}`,
    { signal },
  ).then((r) => r.stops)

type Created = { orderNo: string; manageToken: string; amountAgorot: number }
export const createOrder = (p: OrderPayload) => api<Created>('/api/orders', { method: 'POST', json: p })
export const updateOrder = (token: string, p: OrderPayload | { buyer: Buyer }) =>
  api<Created>(`/api/orders/${encodeURIComponent(token)}`, { method: 'PUT', json: p })
export const startPay = (token: string) =>
  api<{ url: string }>(`/api/orders/${encodeURIComponent(token)}/pay`, { method: 'POST' })
export const getManage = (token: string) => api<Manage>(`/api/manage/${encodeURIComponent(token)}`)
export type OrderEdit = {
  honoreeName?: string
  /** Another style (offered for the occasion, same market); its palettes follow. */
  themeId?: number
  paletteId?: number | null
  answers: Record<string, string>
  letterNotes: LetterNote[]
  hintQuestions?: HintQuestion[]
}
export const submitAnswers = (token: string, edit: OrderEdit) =>
  api<{ status: string }>(`/api/manage/${encodeURIComponent(token)}/answers`, {
    method: 'PUT',
    json: edit,
  })
export const startGame = (token: string, players: number) =>
  api<{ ok: true; gameLink: string; players: number }>(`/api/manage/${encodeURIComponent(token)}/start`, {
    method: 'POST',
    json: { players },
  })
export const resumeGame = (token: string) =>
  api<{ ok: true; stop: number; captainLink: string }>(`/api/manage/${encodeURIComponent(token)}/resume`, {
    method: 'POST',
  })
export const lostLink = (email: string) =>
  api<{ ok: true }>('/api/lost-link', { method: 'POST', json: { email } })
export const sendLead = (lead: Record<string, unknown>) =>
  api<{ ok: true }>('/api/leads', { method: 'POST', json: lead })

export const listPhotos = (token: string) =>
  api<{ photos: Photo[]; paid: boolean; editable: boolean }>(
    `/api/orders/${encodeURIComponent(token)}/photos`,
  )
export const uploadPhoto = (token: string, file: File) => {
  const body = new FormData()
  body.append('file', file)
  return api<{ photo: Photo }>(`/api/orders/${encodeURIComponent(token)}/photos`, {
    method: 'POST',
    body,
  }).then((r) => r.photo)
}
/** Sets a photo's background; a new cutout (transparent PNG from the browser) travels along. */
export const setPhotoBackground = (
  token: string,
  id: Photo['id'],
  choice: { background: PhotoBackground; cutout?: Blob; failed?: boolean },
) => {
  const url = `/api/orders/${encodeURIComponent(token)}/photos/${encodeURIComponent(String(id))}/background`
  if (choice.cutout) {
    const body = new FormData()
    body.append('background', choice.background)
    body.append('cutout', choice.cutout, 'cutout.png')
    return api<{ photo: Photo }>(url, { method: 'PUT', body }).then((r) => r.photo)
  }
  return api<{ photo: Photo }>(url, {
    method: 'PUT',
    json: { background: choice.background, ...(choice.failed ? { failed: true } : {}) },
  }).then((r) => r.photo)
}
export const deletePhoto = (token: string, id: Photo['id']) =>
  api<unknown>(`/api/orders/${encodeURIComponent(token)}/photos/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
