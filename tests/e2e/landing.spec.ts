// The landing page (/) and the tastings page (/tastings): what the product is, and what you taste
// on the way, never which stall serves it. At phone and desktop widths.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

const DESKTOP = { viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false }

async function stallNames(request: APIRequestContext) {
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  const res = await request.get('/admin/api/catalog/stalls')
  expect(res.ok()).toBe(true)
  const { items } = (await res.json()) as { items: { name: string; locationHint?: string }[] }
  expect(items.length).toBeGreaterThan(0)
  return items.flatMap((s) => [s.name, s.locationHint ?? ''].filter((x) => x.trim().length > 2))
}

async function expectNoStalls(page: Page, names: string[]) {
  const text = (await page.locator('main').textContent()) ?? ''
  for (const n of names) expect(text, `stall "${n}" on the page`).not.toContain(n)
}

async function noHorizontalScroll(page: Page) {
  const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(over).toBeLessThanOrEqual(1)
}

for (const [name, opts] of [
  ['phone', {}],
  ['desktop', DESKTOP],
] as const) {
  test.describe(name, () => {
    test.use(opts)

    test('landing explains the game and leads into the order', async ({ page, request }) => {
      const shop = await (await request.get('/api/shop')).json()
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('מירוץ טעימות')
      await expect(page.getByRole('heading', { name: 'איך זה עובד' })).toBeVisible()
      await expect(page.locator('.l-step')).toHaveCount(4)
      await expect(page.getByRole('heading', { name: 'שאלות' })).toBeVisible()
      // Validity and group size come from the settings.
      await expect(page.getByText(`מ־${shop.minPeople} עד ${shop.maxPeople} משתתפים`)).toBeVisible()
      // Prices come from the settings too.
      const priced = Object.entries(shop.prices as Record<string, { base: number }>).find(
        ([, p]) => p.base > 0,
      )
      if (priced) {
        const shekels = String(priced[1].base / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        await expect(page.getByTestId('landing-prices')).toContainText(shekels)
      }
      await expect(page.locator('body')).not.toContainText('המירוץ למיליון')
      await expect(page.getByTestId('tastings-peek').locator('li').first()).toBeVisible()
      await noHorizontalScroll(page)
      if (name === 'desktop') {
        // The hero is two columns: the text beside the map.
        const text = await page.locator('.l-hero-text').boundingBox()
        const map = await page.locator('.l-hero-map').boundingBox()
        expect(text && map && (text.x >= map.x + map.width || map.x >= text.x + text.width)).toBe(true)
      }

      await page.getByRole('link', { name: 'בונים מירוץ' }).first().click()
      await expect(page).toHaveURL(/\/order$/)
      await expect(page.getByRole('radiogroup').first()).toBeVisible()
      // The order's header links back to the landing page and the tastings.
      await page.getByRole('navigation').getByRole('link', { name: 'מה טועמים' }).click()
      await expect(page).toHaveURL(/\/tastings$/)
      await page.getByRole('navigation').getByRole('link', { name: 'מה זה' }).click()
      await expect(page).toHaveURL(/\/$/)
    })

    test('tastings show the teasers and swaps, never a stall', async ({ page, request }) => {
      const names = await stallNames(request)
      await page.goto('/tastings')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('מה טועמים')
      const stops = page.locator('.t-route .stop')
      await expect(stops.first()).toBeVisible()
      await expect(page.locator('.t-route .stop img').first()).toBeVisible()
      await expectNoStalls(page, names)
      // Marking a diet shows the swaps live.
      await page.getByRole('checkbox', { name: 'טבעוני' }).click()
      await expect(page.locator('.t-route .stop.swapped, .t-route .stop.blocked').first()).toBeVisible()
      await expectNoStalls(page, names)
      await noHorizontalScroll(page)
      if (name === 'desktop') {
        const filter = await page.locator('.t-filter').boundingBox()
        const routes = await page.locator('.t-routes').boundingBox()
        expect(filter && routes && filter.x >= routes.x + routes.width).toBe(true)
      }
      await page.getByRole('link', { name: 'בונים מירוץ' }).click()
      await expect(page).toHaveURL(/\/order$/)
    })
  })
}

test('old order links keep working', async ({ page }) => {
  await page.goto('/order/questions')
  // Without a started draft, step 2 sends back to the order's first step, not the landing page.
  await expect(page).toHaveURL(/\/order$/)
})
