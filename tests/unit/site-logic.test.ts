import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { Occasion, Question, Shop } from '../../src/web/site/api.ts'
import { copy, peopleCount } from '../../src/web/site/copy.ts'
import {
  answersError,
  askedQuestions,
  buyerErrors,
  chooseOccasion,
  chooseTheme,
  clampPeople,
  clearDraft,
  currentPalette,
  decorFor,
  draftRecipient,
  emptyDraft,
  errorText,
  formatShekels,
  formChoice,
  formsFor,
  isPayMessage,
  leadErrors,
  listedStops,
  loadDraft,
  nameLabel,
  orderableThemes,
  orderPayload,
  PAY_MESSAGE,
  parseRoute,
  payloadKey,
  priceAgorot,
  recipientsFor,
  routeForTheme,
  saveAction,
  saveDraft,
  step1Error,
  step2Error,
  toggle,
  whatsappShare,
  withRecipient,
} from '../../src/web/site/logic.ts'

const PAL = { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' }
const occ = (
  key: string,
  forms: string[],
  audience: 'private' | 'company' = 'private',
  extra: Partial<Occasion> = {},
): Occasion => ({
  key,
  label: key,
  audience,
  forms,
  ...extra,
})
const shop: Shop = {
  brand: '[שם המותג]',
  occasions: [
    occ('bachelorette', ['she']),
    occ('birthday', ['she', 'he']),
    occ('family', ['group'], 'private', { decor: 'family' }),
    occ('couple', ['couple']),
    occ('team', ['company'], 'company'),
  ],
  markets: [
    { id: 1, name: 'שוק הכרמל' },
    { id: 2, name: 'מחנה יהודה' },
  ],
  themes: [
    { id: 10, name: 'a', marketId: 1, map: null, palette: PAL },
    { id: 20, name: 'b', marketId: 2, map: null, palette: PAL },
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
  validYears: 1,
  gameDuration: '',
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
    d = chooseOccasion({ ...d, recipient: 'he', form: 'he' }, shop.occasions[1])
    expect(d.form).toBe('he')
    // A recipient the new occasion does not offer: its first one (one person first).
    d = chooseOccasion({ ...d, recipient: 'couple', form: 'couple' }, shop.occasions[1])
    expect(d.recipient).toBe('she')
    expect(orderableThemes(shop).map((t) => t.id)).toEqual([10])
    expect(clampPeople(1, 2, 20)).toBe(2)
    expect(clampPeople(30, 2, 20)).toBe(20)
    expect(clampPeople(Number.NaN, 2, 20)).toBe(2)
    expect(toggle(['a'], 'b')).toEqual(['a', 'b'])
    expect(toggle(['a', 'b'], 'a')).toEqual(['b'])
  })

  it('validates step 1: the game and who it is for (one person picked first)', () => {
    const d = emptyDraft()
    expect(step1Error(d, shop)).toMatch(/איזה משחק/)
    const b = chooseOccasion(d, shop.occasions[1])
    expect(b.recipient).toBe('she')
    expect(step1Error({ ...b, recipient: null, form: null, themeId: 10 }, shop)).toMatch(/למי המשחק/)
    expect(step1Error({ ...b, themeId: 10 }, shop)).toMatch(/אין עדיין מחיר/)
    expect(step1Error({ ...b, form: 'she', themeId: 20 }, shop)).toMatch(/איך זה ייראה/)
    expect(step1Error({ ...b, form: 'she', themeId: 10 }, shop)).toMatch(/אין עדיין מחיר/)
    const ok = { ...chooseOccasion(d, shop.occasions[0]), themeId: 10 }
    expect(step1Error(ok, shop)).toBeNull()
    expect(step1Error({ ...ok, people: 21 }, shop)).toMatch(/טווח/)
    expect(step1Error({ ...ok, people: 1 }, shop)).toMatch(/טווח/)
    const solo = { ...shop, minPeople: 1 }
    expect(step1Error({ ...ok, people: 1 }, solo)).toBeNull()
    expect(step1Error({ ...ok, people: 0 }, { ...shop, minPeople: 0 })).toMatch(/טווח/)
    expect(priceAgorot(solo, 'bachelorette', 1)).toBe(5000 + 9900)
    expect(emptyDraft().people).toBe(4)
    expect(emptyDraft(1).people).toBe(4)
  })

  it('counts participants grammatically, one included', () => {
    expect(peopleCount(1)).toBe('משתתף אחד')
    expect(peopleCount(4)).toBe('4 משתתפים')
    expect(copy.home.peopleUnit(1)).toBe('משתתף אחד')
    expect(copy.manage.start.playersUnit(1, 1)).toBe('משתתף אחד מתוך 1')
    expect(copy.manage.start.playersUnit(3, 5)).toBe('3 משתתפים מתוך 5')
    expect(copy.manage.start.confirmBody(1)).toContain('עם משתתף אחד.')
    expect(copy.manage.share.players(1)).toBe('משחקים עם משתתף אחד.')
    expect(copy.manage.paused.players(1)).toBe('משתתף אחד, כמו בהתחלה.')
    expect(copy.manage.paused.players(3)).toBe('3 משתתפים, כמו בהתחלה.')
  })

  it('picks the recipient by the occasion, offers the she/he switch only for one person', () => {
    const pick = (key: string) => chooseOccasion(emptyDraft(), shop.occasions.find((o) => o.key === key)!)
    expect(pick('bachelorette').form).toBe('she')
    expect(pick('couple').form).toBe('couple')
    expect(pick('family').recipient).toBe('family')
    expect(pick('family').form).toBe('group')
    expect(pick('birthday').recipient).toBe('she')
    expect(formChoice(shop, pick('birthday'))).toEqual(['she', 'he'])
    expect(formChoice(shop, pick('family'))).toEqual([])
    // Switching from a birthday (she chosen) to a family game drops the she.
    expect(chooseOccasion(pick('birthday'), shop.occasions[2]).form).toBe('group')
    const b = { ...pick('birthday'), themeId: 10, honoreeName: 'דנה' }
    expect(step2Error({ ...b, recipient: null, form: null }, [], ['she', 'he'])).toMatch(/עליה או עליו/)
    expect(step2Error(withRecipient(b, 'he'), [], ['she', 'he'])).toBeNull()
  })

  it('reads recipients from the shop, or from the forms of an older server', () => {
    const o = (forms: string[], extra: Partial<Occasion> = {}) => occ('k', forms, 'private', extra)
    expect(recipientsFor(o(['group'], { decor: 'family' }))).toEqual(['family'])
    expect(recipientsFor(o(['couple', 'he', 'she']))).toEqual(['she', 'he', 'couple'])
    expect(recipientsFor(o([], { recipients: ['family', 'couple', 'he', 'she'] }))).toEqual([
      'she',
      'he',
      'couple',
      'family',
    ])
    // A draft saved before recipients existed (form only) maps to its recipient.
    const old = { ...emptyDraft(), occasionKey: 'birthday', form: 'he' as const }
    expect(draftRecipient(shop, old)).toBe('he')
    const p = orderPayload(withRecipient({ ...old, honoreeName: 'רון' }, 'family'), [])
    expect(p.recipient).toBe('family')
    expect(p.form).toBe('group')
  })

  it('asks a group its name in the name field, labelled by the group_name question', () => {
    const qs: Question[] = [
      { slot: 'group_name', text: 'שם המשפחה?', required: true, maxLen: 40 },
      { slot: 'group_food', text: 'המאכל?', required: false, maxLen: 40 },
    ]
    const d = { ...chooseOccasion(emptyDraft(), shop.occasions[2]), themeId: 10 }
    expect(nameLabel(qs, 'group')).toBe('שם המשפחה?')
    expect(nameLabel([], 'group')).toBe('שם הקבוצה / המשפחה')
    expect(nameLabel(qs, 'she')).toBe('איך קוראים לה?')
    expect(askedQuestions(qs, 'group').map((q) => q.slot)).toEqual(['group_food'])
    expect(askedQuestions(qs, 'she')).toHaveLength(2)
    expect(step2Error(d, qs)).toMatch(/שם הקבוצה או המשפחה/)
    // The required group_name is the name field: filled, nothing else is missing.
    const named = { ...d, honoreeName: ' משפחת כהן ' }
    expect(step2Error(named, qs)).toBeNull()
    expect(orderPayload(named, qs)).toMatchObject({
      form: 'group',
      honoreeName: 'משפחת כהן',
      answers: { group_name: 'משפחת כהן' },
    })
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
    expect(parseRoute('/')).toEqual({ page: 'landing' })
    expect(parseRoute('/tastings')).toEqual({ page: 'tastings' })
    expect(parseRoute('/order')).toEqual({ page: 'home' })
    expect(parseRoute('/order/')).toEqual({ page: 'home' })
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

describe('palettes and decor', () => {
  const sea = { ...PAL, background: '#DCE6EA', accent: '#1F5E8C', mapTint: '#2F6E9E' }
  const withPalettes: Shop = {
    ...shop,
    occasions: [...shop.occasions, { ...occ('bday', ['she']), decor: 'birthday' }],
    themes: [
      {
        ...shop.themes[0],
        palettes: [
          { id: 1, name: 'אדום', palette: PAL },
          { id: 2, name: 'כחול', palette: sea },
        ],
      },
      { ...shop.themes[1], palettes: [{ id: 2, name: 'כחול', palette: sea }] },
    ],
    prices: { bday: { base: 0, perPerson: 9900 } },
  }

  it('picks the map default and keeps a palette the new map also offers', () => {
    const d = chooseTheme(withPalettes, emptyDraft(), 10)
    expect(d.paletteId).toBe(1)
    expect(currentPalette(withPalettes, d)?.name).toBe('אדום')
    const blue = chooseTheme(withPalettes, { ...d, paletteId: 2 }, 20)
    expect(blue.paletteId).toBe(2)
    expect(chooseTheme(withPalettes, d, 20).paletteId).toBe(2)
    expect(chooseTheme(shop, d, 10).paletteId).toBeNull()
  })

  it('requires a palette of the chosen map and sends it with the order', () => {
    const d = {
      ...chooseOccasion(emptyDraft(), withPalettes.occasions.find((o) => o.key === 'bday')!),
      themeId: 10,
      paletteId: 99,
    }
    expect(step1Error(d, withPalettes)).toBe('בחרו צבע')
    const ok = { ...d, paletteId: 2 }
    expect(step1Error(ok, withPalettes)).toBeNull()
    expect(orderPayload({ ...ok, honoreeName: 'דנה' }, []).paletteId).toBe(2)
  })

  it('finds the doodle set of the occasion', () => {
    expect(decorFor(withPalettes, 'bday')).toBe('birthday')
    expect(decorFor(withPalettes, 'bachelorette')).toBe('generic')
    expect(decorFor(withPalettes, null)).toBeNull()
  })
})
