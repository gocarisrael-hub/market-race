// Thin client for the site API (src/server/routes/public-orders.ts).
import type { SiteForm } from './copy.ts'

export type Occasion = { key: string; label: string; audience: 'private' | 'company'; forms: string[] }
export type Theme = {
  id: number
  name: string
  marketId: number
  map: string | null
  palette: Record<string, string | boolean>
}
export type Shop = {
  brand: string
  occasions: Occasion[]
  markets: { id: number; name: string }[]
  themes: Theme[]
  routes: { id: number; marketId: number; name: string; stops: number }[]
  prices: Record<string, { base: number; perPerson: number }>
  minPeople: number
  maxPeople: number
  allergens: string[]
  diets: string[]
  cardEnabled: boolean
}
export type Question = { slot: string; text: string; required: boolean; maxLen: number }
export type LetterNote = { text: string; signature: string }
export type Buyer = { name: string; phone: string; email: string }
export type OrderPayload = {
  occasionKey: string
  form: SiteForm
  honoreeName: string
  themeId: number
  people: number
  allergens: string[]
  diets: string[]
  answers: Record<string, string>
  letterNotes: LetterNote[]
  answersLater: boolean
}
export type Manage = {
  orderNo: string
  kind: 'private' | 'company'
  status: string
  paid: boolean
  honoree: string
  form: string
  occasionKey: string
  people: number
  amountAgorot: number
  validUntil: string | null
  gameLink: string | null
  qr: string | null
  progress: { step: string; stopIndex: number; total: number; redeemed: number } | null
  needsAnswers: boolean
  answers?: Record<string, string>
  questions?: Question[]
}
export type Photo = { id: string | number; url: string; previewUrl: string }

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

export const getQuestions = (occasion: string, form: string) =>
  api<{ questions: Question[] }>(
    `/api/shop/questions?occasion=${encodeURIComponent(occasion)}&form=${encodeURIComponent(form)}`,
  ).then((r) => r.questions)

type Created = { orderNo: string; manageToken: string; amountAgorot: number }
export const createOrder = (p: OrderPayload) => api<Created>('/api/orders', { method: 'POST', json: p })
export const updateOrder = (token: string, p: OrderPayload | { buyer: Buyer }) =>
  api<Created>(`/api/orders/${encodeURIComponent(token)}`, { method: 'PUT', json: p })
export const startPay = (token: string) =>
  api<{ url: string }>(`/api/orders/${encodeURIComponent(token)}/pay`, { method: 'POST' })
export const getManage = (token: string) => api<Manage>(`/api/manage/${encodeURIComponent(token)}`)
export const submitAnswers = (token: string, answers: Record<string, string>, letterNotes: LetterNote[]) =>
  api<{ status: string }>(`/api/manage/${encodeURIComponent(token)}/answers`, {
    method: 'PUT',
    json: { answers, letterNotes },
  })
export const sendLead = (lead: Record<string, unknown>) =>
  api<{ ok: true }>('/api/leads', { method: 'POST', json: lead })

export const listPhotos = (token: string) =>
  api<{ photos: Photo[] }>(`/api/orders/${encodeURIComponent(token)}/photos`).then((r) => r.photos)
export const uploadPhoto = (token: string, file: File) => {
  const body = new FormData()
  body.append('file', file)
  return api<{ photo: Photo }>(`/api/orders/${encodeURIComponent(token)}/photos`, {
    method: 'POST',
    body,
  }).then((r) => r.photo)
}
export const deletePhoto = (token: string, id: Photo['id']) =>
  api<unknown>(`/api/orders/${encodeURIComponent(token)}/photos/${encodeURIComponent(String(id))}`, {
    method: 'DELETE',
  })
