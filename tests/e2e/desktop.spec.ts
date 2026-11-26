// Tablets and computers: the page is a sheet on the desk, the corner and action buttons belong
// to the sheet, and from 1024px the pages use the width (side panels, spreads). Phones keep the
// sticky button, the fixed help and their single column.
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

async function startedGame(request: APIRequestContext) {
  const g = await newOrder(request)
  const start = await request.post(`/api/manage${g.manage.slice(2)}/start`, { data: { players: 4 } })
  expect(start.ok()).toBe(true)
  return g.url
}

async function newOrder(request: APIRequestContext) {
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  // The help button shows when there is a WhatsApp number to reach us.
  const set = await request.put('/admin/api/catalog/settings/support_whatsapp', {
    data: { value: '054-6577715' },
  })
  expect(set.ok()).toBe(true)
  const res = await request.post('/admin/api/orders/test', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: 1,
      routeId: 1,
      people: 4,
      allergens: [],
      answers: { first_love: 'יואב מהשכבה' },
    },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  return { url: body.links.game as string, manage: `/m/${body.order.manageToken}` }
}

const box = async (l: Locator) => {
  const b = await l.boundingBox()
  if (!b) throw new Error('not visible')
  return b
}

async function expectInside(inner: Locator, outer: Locator) {
  const i = await box(inner)
  const o = await box(outer)
  expect(i.x).toBeGreaterThanOrEqual(o.x)
  expect(i.y).toBeGreaterThanOrEqual(o.y)
  expect(i.x + i.width).toBeLessThanOrEqual(o.x + o.width)
  expect(i.y + i.height).toBeLessThanOrEqual(o.y + o.height)
}

/** Side by side: no horizontal overlap, and they share some height. */
async function expectBeside(a: Locator, b: Locator) {
  const x = await box(a)
  const y = await box(b)
  expect(x.x + x.width <= y.x || y.x + y.width <= x.x).toBe(true)
  expect(x.y < y.y + y.height && y.y < x.y + x.height).toBe(true)
}

const sheetWidth = (page: Page, sel: string) =>
  page.locator(sel).evaluate((el) => el.getBoundingClientRect().width)

test.afterAll(async ({ request }) => {
  await request.delete('/admin/api/catalog/settings/support_whatsapp')
})

test('game at 1440: help and the main button sit inside the sheet, the button under the answer', async ({
  page,
  request,
}) => {
  await page.goto(await startedGame(request))
  const sheet = page.locator('main.scr.riddle')
  await expect(sheet).toBeVisible()
  await expect(page.getByTestId('desk')).toBeVisible()
  // Wide: the map and the route beside the riddle, the riddle card large.
  const side = page.locator('.game-side')
  await expect(side).toBeVisible()
  await expectInside(side, sheet)
  await expectBeside(side, page.locator('.riddle .note'))
  expect(await sheetWidth(page, 'main.scr')).toBeGreaterThan(1000)

  const help = page.getByRole('button', { name: 'עזרה' })
  const submit = page.getByRole('button', { name: 'בודקות!' })
  await expectInside(help, sheet)
  await expectInside(submit, sheet)

  // Right under the answer line, not pinned to the bottom of the window.
  const answer = await box(page.getByLabel('התשובה שלכן'))
  const button = await box(submit)
  expect(button.y - (answer.y + answer.height)).toBeLessThan(120)
  expect(button.y + button.height).toBeLessThan(900 - 60)
})

test('site at 1440: the map being built beside the stage, back and next inside the sheet', async ({
  page,
}) => {
  await page.goto('/order')
  const sheet = page.locator('main.page')
  await expect(page.getByTestId('desk')).toBeVisible()
  const cta = page.locator('.stage-nav .brush')
  await expectInside(cta, sheet)
  await expectInside(page.getByRole('button', { name: 'חזרה לשלב הקודם' }), sheet)
  // The live preview beside the stage, not above it.
  const side = page.locator('.order-side')
  await expect(side.getByTestId('build-map')).toBeVisible()
  await expect(page.locator('.build-map.strip')).toHaveCount(0)
  await expectBeside(side, page.locator('main.page h1'))
  expect(await sheetWidth(page, 'main.page')).toBeGreaterThan(1000)
  await page.screenshot({ path: 'docs/screens/site/build-1440-occasion.png', animations: 'disabled' })

  // The colour stage: the map beside is the preview (no second one inline).
  await page.getByRole('radio', { name: 'רווקות' }).click()
  await cta.click()
  await page.locator('input[name=honoreeName]').fill('מיכל')
  await cta.click()
  await expect(page).toHaveURL(/\/order\/look$/)
  await expect(side.getByTestId('build-map')).toHaveAttribute('data-painted', 'true')
  await expect(side.getByTestId('build-ribbon')).toHaveText('המירוץ של מיכל')
  await expect(page.getByTestId('look-preview')).toHaveCount(0)
  await expect(side.getByTestId('price')).toContainText('396 ₪')
  await page.screenshot({ path: 'docs/screens/site/build-1440-look.png', animations: 'disabled' })
})

test('manage at 1440: the edit form is a two-page spread', async ({ page, request }) => {
  const g = await newOrder(request)
  await page.goto(g.manage)
  await page.locator('.m-edit-entry button').click()
  const pages = page.locator('.m-edit .m-page')
  await expect(pages).toHaveCount(2)
  await expectBeside(pages.nth(0), pages.nth(1))
  await expect(pages.nth(1).getByTestId('look-preview')).toBeVisible()
})

for (const viewport of [
  { width: 1024, height: 768 },
  { width: 1280, height: 800 },
  { width: 1728, height: 1117 },
]) {
  test(`game at ${viewport.width}: help and the button stay in the sheet, the side beside the riddle`, async ({
    browser,
    request,
  }) => {
    const ctx = await browser.newContext({ viewport, locale: 'he-IL' })
    const page = await ctx.newPage()
    await page.goto(await startedGame(request))
    const sheet = page.locator('main.scr.riddle')
    await expectInside(page.getByRole('button', { name: 'עזרה' }), sheet)
    await expectInside(page.getByRole('button', { name: 'בודקות!' }), sheet)
    await expectBeside(page.locator('.game-side'), page.locator('.riddle .note'))
    await ctx.close()
  })
}

test.describe('phone', () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })

  test('keeps the phone layout: no desk, sticky button, help in the window corner', async ({
    page,
    request,
  }) => {
    await page.goto(await startedGame(request))
    await expect(page.locator('main.scr.riddle')).toBeVisible()
    await expect(page.getByTestId('desk')).toBeHidden()
    const pos = (sel: string) => page.locator(sel).evaluate((el) => getComputedStyle(el).position)
    expect(await pos('.foot')).toBe('sticky')
    expect(await pos('.help-btn')).toBe('fixed')
    expect(await sheetWidth(page, 'main.scr')).toBe(390)
    await expect(page.locator('.game-side')).toHaveCount(0)
  })

  test('the order keeps one column, the map being built as a strip above the stage', async ({ page }) => {
    await page.goto('/order')
    await expect(page.locator('.order-side')).toHaveCount(0)
    const strip = page.locator('.build-map.strip')
    await expect(strip).toBeVisible()
    const s = await box(strip)
    const h = await box(page.locator('main.page h1'))
    expect(s.y + s.height).toBeLessThanOrEqual(h.y)
    expect(s.height).toBeLessThan(160)
    // Back and next stay at the bottom of the window.
    expect(await page.locator('.stage-nav').evaluate((el) => getComputedStyle(el).position)).toBe('sticky')
  })
})
