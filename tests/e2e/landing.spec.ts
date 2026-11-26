// The private landing (/), the companies landing (/companies, and / on a COMPANY_HOSTS domain) and
// the tastings page (/tastings): what you taste on the way, never which stall serves it. At phone
// and desktop widths.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { noBareLinks } from '../helpers/links.ts'

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

    test('landing: one call to action, the route teaser with the stalls blurred', async ({
      page,
      request,
    }) => {
      const shop = await (await request.get('/api/shop')).json()
      const names = await stallNames(request)
      await page.goto('/')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('מירוץ טעימות')
      await expect(page.getByText('סיור טעימות מותאם אישית לבן אדם שחוגגים לו')).toBeVisible()
      await expect(page.locator('.l-strip li')).toHaveCount(4)
      await expect(page.locator('body')).not.toContainText('המירוץ למיליון')
      await noHorizontalScroll(page)

      // One call to action, no choice between games; companies only in a quiet footer line.
      await expect(page.locator('.l-product')).toHaveCount(0)
      await expect(page.getByRole('heading', { name: 'איזה משחק?' })).toHaveCount(0)
      const cta = page.locator('main .brush')
      await expect(cta).toHaveCount(1)
      await expect(cta).toHaveText('בונים משחק')
      const companies = page.locator('main a[href="/companies"]')
      await expect(companies).toHaveCount(1)
      await expect(companies).toHaveClass(/l-footer-link/)

      // Above the fold: the map with the route, each stop numbered with its food.
      const teaser = page.getByTestId('route-teaser')
      await expect(teaser).toBeInViewport()
      await expect(cta).toBeInViewport()
      const route = shop.routes[0] as { tastings: { teaser: string; icon: string | null }[] }
      const stops = teaser.locator('.rt-stop')
      await expect(stops).toHaveCount(route.tastings.length)
      for (let i = 0; i < route.tastings.length; i++) {
        await expect(stops.nth(i).locator('.rt-no')).toHaveText(String(i + 1))
        await expect(stops.nth(i).locator('img.rt-food')).toBeVisible()
      }
      // The map is blurred; the stop details are blurred scribbles, no text, until opened.
      const blur = await teaser.locator('.rt-map').evaluate((el) => getComputedStyle(el).filter)
      expect(blur).toContain('blur(')
      await expect(teaser.locator('.rt-scribble')).toHaveCount(route.tastings.length)
      await expect(teaser.getByTestId('route-teaser-line')).toHaveCount(0)
      await expectNoStalls(page, names)

      // Opening a stop (tap on phones, hover on computers) shows only its teaser line.
      const second = stops.nth(1).getByRole('button')
      if (name === 'desktop') await second.hover()
      else await second.click()
      await expect(second).toHaveAttribute('aria-expanded', 'true')
      const line = teaser.getByTestId('route-teaser-line')
      await expect(line).toHaveCount(1)
      await expect(line).toHaveText(route.tastings[1].teaser)
      await expectNoStalls(page, names)
      if (name === 'desktop') {
        await page.mouse.move(5, 5)
        await expect(line).toHaveCount(0)
        // Text and map side by side.
        const text = await page.locator('.l-hero-body').boundingBox()
        const map = await page.locator('.l-hero-map').boundingBox()
        expect(text && map && (text.x >= map.x + map.width || map.x >= text.x + text.width)).toBe(true)
      } else {
        // Another tap closes it.
        await second.click()
        await expect(line).toHaveCount(0)
      }
      // The last stop is the finale.
      const last = stops.last().getByRole('button')
      await last.click()
      await expect(teaser.getByTestId('route-teaser-line')).toContainText('הסיום')

      // The tastings open in place, from a button that says whether it is open.
      const tastings = page.getByRole('button', { name: 'מה טועמים?' })
      await expect(tastings).toHaveAttribute('aria-expanded', 'false')
      await tastings.click()
      await expect(page.locator('.l-tastings .stop').first()).toBeVisible()
      await page.locator('.l-tastings').getByRole('checkbox', { name: 'טבעוני' }).click()
      await expect(page.locator('.l-tastings .stop.swapped, .l-tastings .stop.blocked').first()).toBeVisible()
      await expectNoStalls(page, names)

      // The FAQ is folded too; group size comes from the settings.
      await page.getByRole('button', { name: 'שאלות' }).click()
      await expect(page.getByText(`מ־${shop.minPeople} עד ${shop.maxPeople} משתתפים`)).toBeVisible()
      // No underlined text links anywhere on the page, the footer's way to the companies included.
      await noBareLinks(page)

      // The lowest per-person price from the settings, next to the call to action.
      const per = Object.values(shop.prices as Record<string, { perPerson: number }>)
        .map((p) => p.perPerson)
        .filter((p) => p > 0)
      if (per.length) {
        const shekels = String(Math.min(...per) / 100).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        await expect(page.locator('.l-price')).toContainText(shekels)
      }

      await cta.click()
      await expect(page).toHaveURL(/\/order$/)
      await expect(page.getByRole('radiogroup').first()).toBeVisible()
      // The order is about celebrating a person: no way to the companies there.
      await expect(page.locator('a[href="/companies"]')).toHaveCount(0)
      await page.goto('/')
      await companies.click()
      await expect(page).toHaveURL(/\/companies$/)
    })

    test('companies: their own landing, layout and lead form', async ({ page, request }) => {
      const shop = await (await request.get('/api/shop')).json()
      await page.goto('/companies')
      await expect(page.getByRole('heading', { level: 1 })).toContainText('יום צוות בשוק')
      // Its own layout: no private site nav, sheet or route teaser.
      await expect(page.locator('.site-nav, .page, [data-testid="route-teaser"]')).toHaveCount(0)
      await expect(page.locator('.co-bar')).toBeVisible()
      await expect(page.locator('body')).not.toContainText('המירוץ למיליון')
      // The logo and colours on the map, the group size range from the settings.
      await expect(page.locator('.co-stamp')).toContainText('הלוגו שלכם')
      await expect(page.locator('.co-swatch')).toHaveCount(3)
      const { min, max } = shop.companyPeople
      await expect(page.locator('.co-facts')).toContainText(`${min}–${max}`)
      await expect(page.locator('.co-features li')).toHaveCount(4)
      await expect(page.locator('.co-how li')).toHaveCount(4)
      await noHorizontalScroll(page)
      // The top bar's way to the form and the footer's way back are drawn, never underlined.
      await expect(page.locator('.co-bar-link.sketch .sketch-shape')).toBeVisible()
      await expect(page.locator('.co-foot-link.sketch .sketch-shape')).toBeVisible()
      await noBareLinks(page)

      // The call to action leads to the form; the form sends a lead.
      await page.getByRole('button', { name: 'לקבלת הצעת מחיר' }).click()
      await expect(page.getByLabel('שם החברה')).toBeInViewport()
      await page.getByRole('button', { name: 'שלחו לנו' }).click()
      await expect(page.getByText('כתבו את שם החברה')).toBeVisible()
      await page.getByRole('radio', { name: 'יום צוות' }).click()
      await page.getByLabel('שם החברה').fill('אקמה')
      await page.getByLabel('שם איש או אשת הקשר').fill('רון')
      await page.getByLabel('טלפון').fill('052-7654321')
      await page.getByLabel('אימייל').fill('ron@acme.co.il')
      await page.getByLabel('כמה משתתפים בערך?').fill('40')
      await page.getByRole('button', { name: 'שלחו לנו' }).click()
      await expect(page.getByText('נחזור אליכם בקרוב עם הצעה.')).toBeVisible()
      await noBareLinks(page)

      // A quiet way back to the private site.
      await page.getByRole('link', { name: 'לאתר החוגגים' }).click()
      await expect(page).toHaveURL(/\/$/)
      await expect(page.getByTestId('route-teaser')).toBeVisible()
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
      await noBareLinks(page)
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

test('a COMPANY_HOSTS domain serves the companies landing at /', async ({ page, baseURL }) => {
  const port = new URL(baseURL ?? 'http://localhost:3999').port
  await page.goto(`http://companies.localhost:${port}/`)
  await expect(page.locator('html')).toHaveAttribute('data-site', 'companies')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('יום צוות בשוק')
  await expect(page.locator('.co-bar')).toBeVisible()
  await expect(page.getByTestId('route-teaser')).toHaveCount(0)
  await noBareLinks(page)
  await expect(page).toHaveURL(new RegExp(`companies\\.localhost:${port}/$`))
  // The quiet link back goes to the private site's own origin.
  await expect(page.getByRole('link', { name: 'לאתר החוגגים' })).toHaveAttribute(
    'href',
    new RegExp(`^http://localhost:${port}$`),
  )
  // The private site's / is unchanged.
  await page.goto('/')
  await expect(page.locator('html')).not.toHaveAttribute('data-site', 'companies')
  await expect(page.getByTestId('route-teaser')).toBeVisible()
})

test('old order links keep working', async ({ page }) => {
  await page.goto('/order/questions')
  // Without a started draft, step 2 sends back to the order's first step, not the landing page.
  await expect(page).toHaveURL(/\/order$/)
})
