import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Occasion, Question, Shop } from '../../src/web/site/api.ts'
import {
  answersError,
  buyerErrors,
  chooseOccasion,
  clampPeople,
  clearDraft,
  emptyDraft,
  errorText,
  formatShekels,
  formsFor,
  isPayMessage,
  leadErrors,
  listedStops,
  loadDraft,
  orderableThemes,
  orderPayload,
  PAY_MESSAGE,
  parseRoute,
  payloadKey,
  priceAgorot,
  routeForTheme,
  saveAction,
  saveDraft,
  step1Error,
  step2Error,
  toggle,
  whatsappShare,
} from '../../src/web/site/logic.ts'

const occ = (key: string, forms: string[], audience: 'private' | 'company' = 'private'): Occasion => ({
  key,
  label: key,
  audience,
  forms,
})
const shop: Shop = {
  brand: '[שם המותג]',
  occasions: [
    occ('bachelorette', ['she']),
    occ('birthday', ['she', 'he']),
    occ('team', ['company'], 'company'),
  ],
  markets: [
    { id: 1, name: 'שוק הכרמל' },
    { id: 2, name: 'מחנה יהודה' },
  ],
  themes: [
    { id: 10, name: 'a', marketId: 1, map: null, palette: {} },
    { id: 20, name: 'b', marketId: 2, map: null, palette: {} },
  ],
  routes: [
    {
      id: 1,
      marketId: 1,
      name: 'r',
      stops: 2,
      tastings: [
        { teaser: 'משהו חם', icon: '/static/icons/coffee.png', allergens: [], diets: [], finale: false },
        { teaser: 'משהו קר', icon: null, allergens: ['גלוטן'], diets: [], finale: true },
      ],
    },
  ],
  prices: { bachelorette: { base: 5000, perPerson: 9900 }, birthday: { base: 0, perPerson: 0 } },
  minPeople: 2,
  maxPeople: 20,
  allergens: ['בוטנים'],
  diets: ['vegan'],
  cardEnabled: false,
}
const questions: Question[] = [
  { slot: 'first_love', text: 'x', required: true, maxLen: 5 },
  { slot: 'food', text: 'y', required: false, maxLen: 0 },
]

describe('site logic', () => {
  beforeAll(() => {
    // A plain in-memory Storage (Node's own global localStorage needs a file to work).
    const m = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => m.get(k) ?? null,
      setItem: (k: string, v: string) => void m.set(k, v),
      removeItem: (k: string) => void m.delete(k),
    })
  })

  it('prices like the server', () => {
    expect(priceAgorot(shop, 'bachelorette', 4)).toBe(5000 + 4 * 9900)
    expect(priceAgorot(shop, 'birthday', 4)).toBeNull()
    expect(priceAgorot(shop, 'nope', 4)).toBeNull()
    expect(priceAgorot(shop, null, 4)).toBeNull()
    expect(formatShekels(39600)).toBe('396 ₪')
    expect(formatShekels(1250)).toBe('12.50 ₪')
    expect(formatShekels(123400)).toBe('1,234 ₪')
  })

  it('handles occasions, forms, themes and people', () => {
    expect(formsFor(occ('x', ['she', 'he', 'company']))).toEqual(['she', 'he'])
    let d = chooseOccasion(emptyDraft(), shop.occasions[0])
    expect(d.form).toBe('she')
    d = chooseOccasion({ ...d, form: 'he' }, shop.occasions[1])
    expect(d.form).toBe('he')
    d = chooseOccasion({ ...d, form: 'couple' }, shop.occasions[1])
    expect(d.form).toBeNull()
    expect(orderableThemes(shop).map((t) => t.id)).toEqual([10])
    expect(clampPeople(1, 2, 20)).toBe(2)
    expect(clampPeople(30, 2, 20)).toBe(20)
    expect(clampPeople(Number.NaN, 2, 20)).toBe(2)
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('validates step 1', () => {
    const d = emptyDraft()
    expect(step1Error(d, shop)).toMatch(/לכבוד מה/)
    const b = chooseOccasion(d, shop.occasions[1])
    expect(step1Error(b, shop)).toMatch(/על מי/)
    expect(step1Error({ ...b, form: 'she', themeId: 20 }, shop)).toMatch(/איך זה ייראה/)
    expect(step1Error({ ...b, form: 'she', themeId: 10 }, shop)).toMatch(/אין עדיין מחיר/)
    const ok = { ...chooseOccasion(d, shop.occasions[0]), themeId: 10 }
    expect(step1Error(ok, shop)).toBeNull()
    expect(step1Error({ ...ok, people: 21 }, shop)).toMatch(/טווח/)
  })

  it('validates step 2 and builds the payload', () => {
    const d = { ...chooseOccasion(emptyDraft(), shop.occasions[0]), themeId: 10 }
    expect(step2Error(d, questions)).toMatch(/איך קוראים לה/)
    const named = { ...d, honoreeName: ' מיכל ' }
    expect(step2Error(named, questions)).toMatch(/חובה/)
    expect(step2Error({ ...named, answersLater: true }, questions)).toBeNull()
    expect(step2Error({ ...named, answers: { first_love: 'יואב מהשכבה' } }, questions)).toMatch(/ארוכה/)
    const full = {
      ...named,
      answers: { first_love: ' יואב ', food: '', extra: 'x' },
      letterNotes: [
        { text: ' מזל טוב ', signature: ' נועה ' },
        { text: '  ', signature: 'x' },
      ],
    }
    expect(step2Error(full, questions)).toBeNull()
    const p = orderPayload(full, questions)
    expect(p).toMatchObject({
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      answers: { first_love: 'יואב' },
      letterNotes: [{ text: 'מזל טוב', signature: 'נועה' }],
      answersLater: false,
    })
    const later = orderPayload({ ...full, answersLater: true }, questions)
    expect(later.answers).toEqual({})
    expect(later.letterNotes).toEqual([])
    expect(answersError({ first_love: 'אבג' }, questions)).toBeNull()
  })

  it('decides when to create or update the order', () => {
    const d = emptyDraft()
    expect(saveAction(d, 'k')).toBe('create')
    expect(saveAction({ ...d, manageToken: 't', savedKey: 'k' }, 'k')).toBe('none')
    expect(saveAction({ ...d, manageToken: 't', savedKey: 'k' }, 'k2')).toBe('update')
    const p = orderPayload({ ...d, honoreeName: 'a' }, [])
    expect(payloadKey(p)).toBe(payloadKey({ ...p }))
  })

  it('validates buyer and lead details', () => {
    expect(Object.keys(buyerErrors({ name: '', phone: 'abc', email: 'x@' }))).toEqual([
      'name',
      'phone',
      'email',
    ])
    expect(buyerErrors({ name: 'נועה', phone: '050-1234567', email: 'noa@example.com' })).toEqual({})
    const lead = {
      companyName: 'אקמה',
      contactName: 'רון',
      phone: '052 7654321',
      email: 'ron@acme.co.il',
      occasionKey: null,
      people: '',
      preferredDate: '',
      message: '',
    }
    expect(leadErrors(lead)).toEqual({})
    expect(Object.keys(leadErrors({ ...lead, companyName: ' ', people: '3x' }))).toEqual([
      'companyName',
      'people',
    ])
  })

  it('finds the route of a theme and lists its stops as listed', () => {
    expect(routeForTheme(shop, 10)?.id).toBe(1)
    expect(routeForTheme(shop, 20)).toBeUndefined()
    expect(routeForTheme(shop, null)).toBeUndefined()
    expect(listedStops(routeForTheme(shop, 10))).toEqual([
      { teaser: 'משהו חם', icon: '/static/icons/coffee.png', finale: false, status: 'as_listed' },
      { teaser: 'משהו קר', icon: null, finale: true, status: 'as_listed' },
    ])
    expect(listedStops(undefined)).toEqual([])
  })

  it('parses routes', () => {
    const t = 'abcDEF123_-xyz'
    expect(parseRoute('/')).toEqual({ page: 'home' })
    expect(parseRoute('/order/questions')).toEqual({ page: 'questions' })
    expect(parseRoute(`/order/${t}/photos`)).toEqual({ page: 'photos', token: t })
    expect(parseRoute(`/order/${t}/pay/`)).toEqual({ page: 'checkout', token: t })
    expect(parseRoute('/pay/done')).toEqual({ page: 'payDone' })
    expect(parseRoute(`/pay/${t}`)).toEqual({ page: 'companyPay', token: t })
    expect(parseRoute(`/m/${t}`)).toEqual({ page: 'manage', token: t })
    expect(parseRoute('/companies')).toEqual({ page: 'companies' })
    expect(parseRoute('/m/short')).toEqual({ page: 'notFound' })
  })

  it('keeps the draft in storage and maps errors', () => {
    clearDraft()
    expect(loadDraft()).toBeNull()
    saveDraft({ ...emptyDraft(), honoreeName: 'מיכל', manageToken: 'tok' })
    expect(loadDraft()).toMatchObject({ honoreeName: 'מיכל', manageToken: 'tok', people: 4 })
    clearDraft()
    expect(loadDraft()).toBeNull()
    expect(errorText('card_disabled')).toMatch(/לא פתוח/)
    expect(errorText('whatever')).toMatch(/השתבש/)
    expect(isPayMessage({ type: PAY_MESSAGE, token: 't', ok: true })).toBe(true)
    expect(isPayMessage({ type: 'other' })).toBe(false)
    expect(whatsappShare('הנה https://x.y/g/1')).toBe(
      `https://wa.me/?text=${encodeURIComponent('הנה https://x.y/g/1')}`,
    )
  })
})
