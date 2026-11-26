// Tablets and computers: the phone column is a sheet on the desk, and the corner and action
// buttons belong to the sheet, not to the window. Phones keep the sticky button and fixed help.
import { type APIRequestContext, expect, type Locator, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 1440, height: 900 }, isMobile: false, hasTouch: false, deviceScaleFactor: 1 })

async function startedGame(request: APIRequestContext) {
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
  const start = await request.post(`/api/manage/${body.order.manageToken}/start`, { data: { players: 4 } })
  expect(start.ok()).toBe(true)
  return body.links.game as string
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
  expect(await sheetWidth(page, 'main.scr')).toBeLessThan(600)

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

test('site at 1440: the order button sits inside the sheet', async ({ page }) => {
  await page.goto('/')
  const sheet = page.locator('main.page')
  await expect(page.getByTestId('desk')).toBeVisible()
  const cta = page.locator('.cta-wrap .brush')
  await cta.scrollIntoViewIfNeeded()
  await expectInside(cta, sheet)
  expect(await sheetWidth(page, 'main.page')).toBeLessThan(600)
})

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
  })
})
