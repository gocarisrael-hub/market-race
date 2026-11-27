// Game styles: the look stage offers the styles of the occasion, the order carries the chosen one,
// and the player draws that style's tokens (colors, font, treatment, illustrations). Saves the
// riddle screen of every style at 390 for the owner in docs/screens/themes.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { buildToPhotos, photosToPay } from '../helpers/order.ts'

test.use({ viewport: { width: 390, height: 844 } })

const SHOTS = 'docs/screens/themes'

type ShopTheme = {
  id: number
  key: string
  name: string
  marketId: number
  map: string
  palette: Record<string, unknown>
  style: Record<string, unknown>
}

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name)
const rootData = (page: Page) => page.evaluate(() => ({ ...document.documentElement.dataset }))

/** Pays an order on the mock provider and starts its game; returns the game link. */
async function payAndStart(page: Page) {
  await page.getByRole('button', { name: /^לתשלום/ }).click()
  await page.frameLocator('iframe').getByRole('button', { name: 'לשלם (לדוגמה)' }).click()
  await expect(page.getByRole('heading', { name: 'מתחילים לשחק' })).toBeVisible({ timeout: 30_000 })
  const manageToken = new URL(page.url()).pathname.split('/m/')[1]
  const m = await (await page.request.get(`/api/manage/${manageToken}`)).json()
  const started = await page.request.post(`/api/manage/${manageToken}/start`, { data: { players: 4 } })
  expect(started.ok()).toBe(true)
  return m.gameLink as string
}

const ORDERS = [
  {
    key: 'neon',
    occasion: 'רווקות',
    name: 'מיכל',
    theme: 'ניאון בשוק',
    bg: '#100C22',
    treat: 'neon',
    mode: 'dark',
    font: 'amatic',
    family: 'Amatic SC',
  },
  {
    key: 'gold',
    occasion: 'דייט רומנטי',
    recipient: 'למישהי',
    name: 'נועה',
    theme: 'זהב על שמנת',
    bg: '#F7F0E2',
    treat: 'foil',
    mode: 'light',
    font: 'frank',
    family: 'Frank Ruhl Libre',
  },
  {
    key: 'ink',
    occasion: 'יום הולדת',
    recipient: 'למישהו',
    name: 'יואב',
    theme: 'דיו וקרפט',
    bg: '#D8C39E',
    treat: 'brush',
    mode: 'light',
    font: 'suez',
    family: 'Suez One',
  },
] as const

for (const o of ORDERS) {
  test(`orders in ${o.key} and plays in its style`, async ({ page }) => {
    await buildToPhotos(page, {
      occasion: o.occasion,
      recipient: 'recipient' in o ? o.recipient : undefined,
      name: o.name,
      theme: o.theme,
    })
    await photosToPay(page)
    await expect(page.getByText(o.theme).first()).toBeVisible()
    const game = await payAndStart(page)

    await page.goto(game)
    await expect(page.locator('main.riddle')).toBeVisible()
    expect(await cssVar(page, '--bg')).toBe(o.bg)
    expect(await cssVar(page, '--hand')).toContain(o.family)
    const data = await rootData(page)
    expect(data).toMatchObject({ treat: o.treat, mode: o.mode, font: o.font, riddleTop: 'banner' })
    // Only the style's own display font is loaded.
    const fonts = await page
      .locator('link[data-font]')
      .evaluateAll((ls) => ls.map((l) => l.getAttribute('href')))
    expect(fonts).toHaveLength(1)
    expect(fonts[0]).toContain(o.family.replace(/ /g, '+'))
    // Its illustrations, and the map strip above the trail.
    await expect(page.locator(`.trail img[src*="/icons/${o.key}/"]`).first()).toBeVisible()
    expect(await cssVar(page, '--map')).toContain(`carmel-${o.key}.webp`)
    const ribbonFill = await page.evaluate(
      () => getComputedStyle(document.querySelector('.brush path')!).fill,
    )
    expect(ribbonFill).not.toBe('')
  })
}

test('the look stage offers each occasion its own styles', async ({ page }) => {
  const names = async () =>
    page.locator('.themes .theme .name').evaluateAll((els) => els.map((e) => e.textContent?.trim()))
  await buildToLook(page, 'רווקות', 'מיכל')
  expect(await names()).toEqual(['כרמל בצבעי מים', 'כרמל כחול־ורוד', 'ניאון בשוק', 'ורוד פודרה'])
  // Picking neon: no palettes (a locked style), and the map being built glows.
  await page.getByRole('button', { name: 'ניאון בשוק' }).click()
  await expect(page.getByRole('radiogroup', { name: 'ובאיזה צבע?' })).toHaveCount(0)
  await expect(page.getByTestId('build-map')).toHaveAttribute('data-treat', 'neon')
  await expect(page.getByTestId('look-preview')).toHaveAttribute('data-bg', '#100C22')
  await page.screenshot({
    path: `${SHOTS}/site-look-bachelorette.jpg`,
    fullPage: true,
    animations: 'disabled',
    type: 'jpeg',
    quality: 75,
  })

  await buildToLook(page, 'יום משפחתי', 'משפחת לוי')
  expect(await names()).toEqual(['כרמל בצבעי מים', 'כחול קרמיקה'])
  // The style chosen for the bachelorette is not offered here: the first one is picked.
  await expect(page.getByRole('button', { name: 'כרמל בצבעי מים' })).toHaveAttribute('aria-pressed', 'true')

  // A kid's birthday: only the light, friendly styles (no neon, gold or ink).
  await buildToLook(page, 'יום הולדת לילד', 'נועה')
  expect(await names()).toEqual(['כרמל בצבעי מים', 'כרמל כחול־ורוד', 'כחול קרמיקה'])
  // An anniversary: gold on cream, with the watercolor and cobalt.
  await buildToLook(page, 'יום נישואים', 'נועה')
  expect(await names()).toEqual(['כרמל בצבעי מים', 'זהב על שמנת', 'כחול קרמיקה'])
})

async function buildToLook(page: Page, occasion: string, name: string) {
  await page.goto('/order')
  await page.getByRole('radio', { name: occasion, exact: true }).click()
  for (let i = 0; i < 4 && !page.url().endsWith('/order/name'); i++) {
    const from = page.url()
    await page.locator('.stage-nav .brush').click()
    await expect.poll(() => page.url()).not.toBe(from)
  }
  await page.locator('input[name=honoreeName]').fill(name)
  await page.locator('.stage-nav .brush').click()
  await page.waitForURL(/\/order\/look$/)
}

async function testGame(request: APIRequestContext, themeId: number) {
  const res = await request.post('/admin/api/orders/test', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId,
      routeId: 1,
      people: 4,
      answers: { first_love: 'יואב מהשכבה', favorite_food: 'שקשוקה' },
    },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  const start = await request.post(`/api/manage/${body.order.manageToken}/start`, { data: { players: 4 } })
  expect(start.ok()).toBe(true)
  return body.links.game as string
}

test('the riddle screen in every style', async ({ page, request }) => {
  test.setTimeout(180_000)
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  const shop = await (await request.get('/api/shop')).json()
  const themes: ShopTheme[] = shop.themes
  expect(themes).toHaveLength(10)
  const carmel = themes.find((t) => t.key === 'carmel')!
  for (const t of themes) {
    // The demo has a route in the Carmel only: a Mahane Yehuda style is shown on a Carmel game.
    const own = t.marketId === carmel.marketId
    const url = await testGame(request, own ? t.id : carmel.id)
    const token = url.split('/g/')[1]
    await page.unrouteAll()
    if (!own)
      await page.route(`**/api/game/${token}`, async (route) => {
        const res = await route.fetch()
        const v = await res.json()
        v.theme = { name: t.name, map: t.map, palette: t.palette, style: t.style }
        await route.fulfill({ response: res, json: v })
      })
    await page.goto(url)
    await expect(page.locator('main.riddle')).toBeVisible()
    expect(await cssVar(page, '--bg')).toBe(t.palette.background)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')
    await page.screenshot({
      path: `${SHOTS}/riddle-${t.key}.jpg`,
      animations: 'disabled',
      type: 'jpeg',
      quality: 75,
    })
  }
})
