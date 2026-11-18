// Palettes and occasion doodles: chosen on the site, carried into the game. Saves screenshots for
// the owner in docs/screens/look.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

const SHOTS = 'docs/screens/look'

type ShopPalette = { id: number; name: string; palette: { background: string; mapTint?: string } }
type ShopTheme = { id: number; name: string; marketId: number; palettes: ShopPalette[] }

async function carmelWatercolor(request: APIRequestContext) {
  const shop = await (await request.get('/api/shop')).json()
  const theme: ShopTheme = shop.themes.find((t: ShopTheme) => t.name === 'כרמל בצבעי מים')
  const route = shop.routes.find((r: { marketId: number }) => r.marketId === theme.marketId)
  const palette = (name: string) => {
    const p = theme.palettes.find((x) => x.name === name)
    if (!p) throw new Error(`no palette ${name}`)
    return p
  }
  return { theme, route, palette }
}

const cssVar = (page: Page, name: string) =>
  page.evaluate((n) => document.documentElement.style.getPropertyValue(n), name)

test('step 1 recolors the map preview live, in three palettes', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'יום הולדת לחבר/ה' }).click()
  await page.getByRole('radio', { name: 'עליו' }).click()
  // The occasion's doodles and a playful line appear once it is picked.
  await expect(page.locator('main.page')).toHaveAttribute('data-decor', 'birthday')
  await expect(page.locator('.doodles [data-doodle="balloons"]')).toHaveCount(1)
  await expect(page.getByText('יאללה, נרות ועוגה!')).toBeVisible()

  const daubs = page.getByRole('radiogroup', { name: 'ובאיזה צבע?' })
  // The map's first palette is chosen by default.
  await expect(daubs.getByRole('radio', { name: 'אדום קלאסי' })).toHaveAttribute('aria-checked', 'true')
  const preview = page.getByTestId('look-preview')
  await expect(preview).toHaveAttribute('data-bg', '#EADBC8')
  await page.screenshot({ path: `${SHOTS}/site-1-home.png`, fullPage: true, animations: 'disabled' })

  for (const [i, name, bg] of [
    [1, 'כחול ים', '#DCE6EA'],
    [2, 'ירוק זית', '#E4E2CC'],
    [3, 'ורוד פטל', '#F1DDE2'],
  ] as const) {
    await daubs.getByRole('radio', { name }).click()
    await expect(daubs.getByRole('radio', { name })).toHaveAttribute('aria-checked', 'true')
    await expect(preview).toHaveAttribute('data-bg', bg)
    await expect(preview.locator('.map-tint')).toHaveCount(1)
    await expect(page.locator('.theme[aria-pressed="true"] .map-tint')).toHaveCount(1)
    // The map choice down to the preview, in page coordinates.
    const clip = await page.evaluate(() => {
      const top = document.getElementById('l-theme')!.getBoundingClientRect().top
      const end = document.querySelector('[data-testid="look-preview"]')!.getBoundingClientRect().bottom
      return { x: 0, y: top + window.scrollY - 16, width: 390, height: end - top + 40 }
    })
    await page.screenshot({
      path: `${SHOTS}/site-palette-${i}.png`,
      fullPage: true,
      animations: 'disabled',
      clip,
    })
  }
})

test('the occasion and palette picked on the site open the game in that look', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('radio', { name: 'יום הולדת לחבר/ה' }).click()
  await page.getByRole('radio', { name: 'עליה' }).click()
  await page.getByRole('radio', { name: 'כחול ים' }).click()
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()

  // Steps 2 to 4 keep the drawn trail and the occasion's doodles.
  await expect(page.getByRole('navigation', { name: 'שלב 2 מתוך 4' })).toBeVisible()
  await expect(page.locator('main.page')).toHaveAttribute('data-decor', 'birthday')
  await page.getByLabel(/איך קוראים לה/).fill('שירה')
  await page.screenshot({ path: `${SHOTS}/site-2-questions.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  await page.waitForURL(/\/photos$/)
  await page.getByRole('link', { name: 'לתשלום' }).click()
  await expect(page.getByRole('navigation', { name: 'שלב 4 מתוך 4' })).toBeVisible()
  await expect(page.getByText('כחול ים')).toBeVisible()
  await page.getByLabel('השם שלכם').fill('נועה')
  await page.getByLabel('טלפון').fill('050-1234567')
  await page.getByLabel('אימייל').fill('noa@example.com')
  await page.screenshot({ path: `${SHOTS}/site-4-checkout.png`, fullPage: true, animations: 'disabled' })
  await page.getByRole('button', { name: /^לתשלום/ }).click()
  await page.frameLocator('iframe').getByRole('button', { name: 'לשלם (לדוגמה)' }).click()

  const link = page.locator('a.big-link')
  await expect(link).toHaveAttribute('href', /\/g\//, { timeout: 30_000 })
  await page.goto((await link.getAttribute('href'))!)
  await expect(page.getByRole('heading', { name: 'המירוץ של שירה' })).toBeVisible()
  const opening = page.locator('main.opening')
  await expect(opening).toHaveAttribute('data-decor', 'birthday')
  await expect(opening.locator('[data-doodle="balloons"]')).toHaveCount(1)
  await expect(opening.locator('.opening-map .map-tint')).toHaveCount(1)
  expect(await cssVar(page, '--bg')).toBe('#DCE6EA')
  expect(await cssVar(page, '--accent')).toBe('#1F5E8C')
})

test('game openings for birthday, love and family', async ({ page, request }) => {
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  // Family is not a demo occasion yet: add one the way the owner would.
  const sets = (await (await request.get('/admin/api/catalog/question-sets')).json()).items
  const questionSetId = sets.find((q: { name: string }) => q.name === 'שאלות פרטיות').id
  const occ = await request.post('/admin/api/catalog/occasions', {
    data: {
      key: 'family_e2e',
      label: 'משפחה',
      audience: 'private',
      questionSetId,
      forms: ['she', 'he'],
      decor: 'family',
    },
  })
  expect(occ.ok()).toBe(true)
  const { theme, route, palette } = await carmelWatercolor(request)

  for (const [name, occasionKey, form, honoree, pal, decor, doodle] of [
    ['birthday', 'birthday_friend', 'he', 'יואב', 'כתום שקיעה', 'birthday', 'cake'],
    ['love', 'couple', 'couple', 'מיכל ודני', 'ורוד פטל', 'love', 'heart'],
    ['family', 'family_e2e', 'she', 'סבתא רחל', 'ירוק זית', 'family', 'house'],
  ] as const) {
    const p = palette(pal)
    const res = await request.post('/admin/api/orders/test', {
      data: {
        occasionKey,
        form,
        honoreeName: honoree,
        themeId: theme.id,
        paletteId: p.id,
        routeId: route.id,
        people: 4,
      },
    })
    expect(res.ok()).toBe(true)
    const { order, links } = await res.json()
    expect(order.game.theme.palette.background).toBe(p.palette.background)
    expect(order.game.decor).toBe(decor)
    await page.goto(links.game)
    const opening = page.locator('main.opening')
    await expect(opening).toHaveAttribute('data-decor', decor)
    await expect(opening.locator(`[data-doodle="${doodle}"]`)).toHaveCount(1)
    expect(await cssVar(page, '--bg')).toBe(p.palette.background)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: `${SHOTS}/player-opening-${name}.png`, animations: 'disabled' })
  }
})
