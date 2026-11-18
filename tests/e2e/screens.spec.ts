// Screenshots of every player screen for design review (docs/screens/player/).
// Not part of CI: run with `SCREENSHOTS=1 npx playwright test tests/e2e/screens.spec.ts`.
import { type APIRequestContext, type Browser, expect, test } from '@playwright/test'

test.skip(!process.env.SCREENSHOTS, 'screenshots only on demand')

const OUT = 'docs/screens/player'
const SIZES = [
  { width: 390, height: 844 },
  { width: 360, height: 740 },
]

// biome-ignore lint/suspicious/noExplicitAny: test-only JSON patching
type Json = Record<string, any>
type Patch = (v: Json) => Json

const NIGHT = {
  map: '/static/maps/mahane-yehuda-night.jpg',
  palette: { background: '#0B2B47', accent: '#AFC7AE', ink: '#08223A', paper: '#F3EFE4', dark: true },
}
const MJ = {
  map: '/static/maps/mahane-yehuda-watercolor.jpg',
  palette: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
}
// A stand-in company logo (the real one is uploaded by the owner).
const LOGO = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect x="4" y="4" width="152" height="72" rx="10" fill="#0F6E74"/><text x="80" y="50" text-anchor="middle" font-family="Heebo, sans-serif" font-size="24" font-weight="800" fill="#fff">ACME</text></svg>',
)}`
const PHOTO = '/static/icons/flowers.webp' // stand-in for an illustrated customer photo

async function game(request: APIRequestContext, themeId = 1) {
  await request.post('/admin/api/login', { data: { email: 'owner@example.com', password: 'e2e-password' } })
  const res = await request.post('/admin/api/orders/test', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId,
      routeId: 1,
      people: 4,
      allergens: ['בוטנים'],
      answers: { first_love: 'יואב מהשכבה', favorite_food: 'שקשוקה', catchphrase: 'עוד חמש דקות' },
      letterNotes: [
        {
          text: 'מהשכבה ועד חוף הצוק, את תמיד אומרת עוד חמש דקות. נחכה לך עוד חמישים שנה.',
          signature: 'נועה',
        },
        { text: 'שתפתחי את הקפה בליסבון, ושיהיה לנו שם שולחן קבוע.', signature: 'שירה' },
      ],
    },
  })
  expect(res.ok()).toBe(true)
  const url: string = (await res.json()).links.game
  const token = url.split('/g/')[1]
  const act = async (data: Json) => {
    const r = await request.post(`/api/game/${token}/action`, { data })
    expect(r.ok()).toBe(true)
  }
  return { url, token, act }
}

async function shoot(browser: Browser, url: string, token: string, name: string, patch?: Patch) {
  for (const size of SIZES) {
    const ctx = await browser.newContext({
      viewport: size,
      deviceScaleFactor: 2,
      locale: 'he-IL',
      isMobile: true,
    })
    const page = await ctx.newPage()
    if (patch) {
      await page.route(`**/api/game/${token}`, async (route) => {
        const res = await route.fetch()
        await route.fulfill({ response: res, json: patch(await res.json()) })
      })
    }
    await page.goto(url)
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1800) // let the entrance animations settle
    await page.screenshot({
      path: `${OUT}/${name}-${size.width}x${size.height}.jpg`,
      type: 'jpeg',
      quality: 78,
    })
    await ctx.close()
  }
}

const finish = async (act: (d: Json) => Promise<void>, from: number) => {
  const answers = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']
  for (let i = from; i < 5; i++) {
    await act({ type: 'answer', stopIndex: i, answer: answers[i] })
    await act({ type: 'arrived', stopIndex: i })
    await act({ type: 'redeemed', stopIndex: i })
  }
}

test.describe.configure({ timeout: 400_000 })

test('watercolor: every screen', async ({ browser, request }) => {
  const g = await game(request, 1)
  await shoot(browser, g.url, g.token, 'watercolor-1-opening')
  await g.act({ type: 'start' })
  await shoot(browser, g.url, g.token, 'watercolor-2-riddle')
  await g.act({ type: 'hint', stopIndex: 0 })
  await shoot(browser, g.url, g.token, 'watercolor-3-riddle-hint')
  await g.act({ type: 'answer', stopIndex: 0, answer: 'תקווה' })
  await shoot(browser, g.url, g.token, 'watercolor-4-reveal')
  await g.act({ type: 'arrived', stopIndex: 0 })
  await shoot(browser, g.url, g.token, 'watercolor-5-redeem')
  await g.act({ type: 'redeemed', stopIndex: 0 })
  await g.act({ type: 'answer', stopIndex: 1, answer: "ג'חנון" })
  await shoot(browser, g.url, g.token, 'watercolor-6-reveal-backup', (v) => {
    v.current.reveal = {
      ...v.current.reveal,
      usingBackup: true,
      originalStallName: 'המאפייה התימנית',
      closedNote: 'סגורים היום לאירוע משפחתי',
      stall: { ...v.current.reveal.stall, name: 'בוריק', locationHint: 'באמצע השוק, ליד הדגים' },
    }
    return v
  })
  await g.act({ type: 'arrived', stopIndex: 1 })
  await g.act({ type: 'redeemed', stopIndex: 1 })
  await finish(g.act, 2)
  await shoot(browser, g.url, g.token, 'watercolor-7-letter')
  await shoot(browser, g.url, g.token, 'watercolor-8-expired', (v) => ({ ...v, status: 'expired' }))
})

test('photos: riddle and letter', async ({ browser, request }) => {
  const g = await game(request, 1)
  await g.act({ type: 'start' })
  await g.act({ type: 'answer', stopIndex: 0, answer: 'תקווה' })
  await g.act({ type: 'arrived', stopIndex: 0 })
  await g.act({ type: 'redeemed', stopIndex: 0 })
  await shoot(browser, g.url, g.token, 'photo-1-riddle', (v) => {
    v.current.photo = PHOTO
    return v
  })
  await finish(g.act, 1)
  await shoot(browser, g.url, g.token, 'photo-2-letter', (v) => {
    v.letter.photos = [PHOTO, '/static/icons/fruit.webp']
    return v
  })
})

test('riso theme', async ({ browser, request }) => {
  const g = await game(request, 2)
  await shoot(browser, g.url, g.token, 'riso-1-opening')
  await g.act({ type: 'start' })
  await shoot(browser, g.url, g.token, 'riso-2-riddle')
  await g.act({ type: 'answer', stopIndex: 0, answer: 'תקווה' })
  await shoot(browser, g.url, g.token, 'riso-3-reveal')
  await g.act({ type: 'arrived', stopIndex: 0 })
  await shoot(browser, g.url, g.token, 'riso-4-redeem')
})

test('Mahane Yehuda themes (night, watercolor)', async ({ browser, request }) => {
  const g = await game(request, 1)
  const as = (t: Json, name: string) => (v: Json) => ({ ...v, theme: { name, ...t } })
  await shoot(browser, g.url, g.token, 'night-1-opening', as(NIGHT, 'מחנה יהודה בלילה'))
  await shoot(browser, g.url, g.token, 'mj-1-opening', as(MJ, 'מחנה יהודה בצבעי מים'))
  await g.act({ type: 'start' })
  await shoot(browser, g.url, g.token, 'night-2-riddle', as(NIGHT, 'מחנה יהודה בלילה'))
  await g.act({ type: 'answer', stopIndex: 0, answer: 'תקווה' })
  await g.act({ type: 'arrived', stopIndex: 0 })
  await shoot(browser, g.url, g.token, 'night-3-redeem', as(NIGHT, 'מחנה יהודה בלילה'))
})

test('company: logo on the opening, the map and the letter', async ({ browser, request }) => {
  const g = await game(request, 1)
  const corp: Patch = (v) => ({
    ...v,
    form: 'company',
    honoree: 'צוות המכירות',
    company: { name: 'ACME', logo: LOGO },
    theme: {
      ...v.theme,
      palette: {
        background: '#EADBC8',
        accent: '#0F6E74',
        accent2: '#1E2A5A',
        ink: '#2B2420',
        paper: '#FFFBF4',
      },
    },
  })
  await shoot(browser, g.url, g.token, 'company-1-opening', corp)
  await g.act({ type: 'start' })
  await g.act({ type: 'answer', stopIndex: 0, answer: 'תקווה' })
  await shoot(browser, g.url, g.token, 'company-2-reveal', corp)
  await g.act({ type: 'arrived', stopIndex: 0 })
  await g.act({ type: 'redeemed', stopIndex: 0 })
  await finish(g.act, 1)
  await shoot(browser, g.url, g.token, 'company-3-letter', corp)
})
