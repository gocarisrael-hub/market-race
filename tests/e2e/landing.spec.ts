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

    test('landing: a short explanation, the tastings folded, a choice of two games', async ({
      page,
      request,
    }) => {
      const shop = await (await request.get('/api/shop')).json()
      const names = await stallNames(request)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('מירוץ טעימות')
      await expect(page.locator('.l-strip li')).toHaveCount(4)
      await expect(page.locator('body')).not.toContainText('המירוץ למיליון')
      await noHorizontalScroll(page)

      // The tastings open in place, from a button that says whether it is open.
      const tastings = page.getByRole('button', { name: 'מה טועמים?' })
      await expect(tastings).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('.l-tastings .stop')).toHaveCount(0)
      await tastings.click()
      await expect(tastings).toHaveAttribute('aria-expanded', 'true')
      await expect(page.locator('.l-tastings .stop').first()).toBeVisible()
      await expect(page.locator('.l-tastings .stop img').first()).toBeVisible()
      await expectNoStalls(page, names)
      await page.locator('.l-tastings').getByRole('checkbox', { name: 'טבעוני' }).click()
      await expect(page.locator('.l-tastings .stop.swapped, .l-tastings .stop.blocked').first()).toBeVisible()
      await expectNoStalls(page, names)
      await tastings.click()
      await expect(tastings).toHaveAttribute('aria-expanded', 'false')

      // The FAQ is folded too; group size comes from the settings.
      const faq = page.getByRole('button', { name: 'שאלות' })
      await expect(faq).toHaveAttribute('aria-expanded', 'false')
      await faq.click()
      await expect(page.getByText(`מ־${shop.minPeople} עד ${shop.maxPeople} משתתפים`)).toBeVisible()

      // Two products; the private one shows its lowest per-person price from the settings.
      const cards = page.locator('.l-product')
      await expect(cards).toHaveCount(2)
      const per = Object.values(shop.prices as Record<string, { perPerson: number }>)
        .map((p) => p.perPerson)
        .filter((p) => p > 0)
      if (per.length) {
        const shekels = String(Math.min(...per) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        await expect(cards.first()).toContainText(shekels)
      }
      const a = await cards.nth(0).boundingBox()
      const b = await cards.nth(1).boundingBox()
      if (name === 'desktop') {
        // Side by side, the text beside the map in the hero.
        expect(a && b && Math.abs(a.y - b.y) < 40).toBe(true)
        const text = await page.locator('.l-hero-text').boundingBox()
        const map = await page.locator('.l-hero-map').boundingBox()
        expect(text && map && (text.x >= map.x + map.width || map.x >= text.x + text.width)).toBe(true)
      } else {
        expect(a && b && b.y >= a.y + a.height - 1).toBe(true)
      }

      await cards.nth(0).getByRole('link', { name: 'בונים משחק' }).click()
      await expect(page).toHaveURL(/\/order$/)
      await expect(page.getByRole('radiogroup').first()).toBeVisible()
      await page.goto('/')
      await page.locator('.l-product').nth(1).getByRole('link', { name: 'מתחילים' }).click()
      await expect(page).toHaveURL(/\/companies$/)
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
