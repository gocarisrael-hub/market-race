import { expect, type Page, test } from '@playwright/test'

// Runs on the demo catalog (E2E_SEED=1). Names are unique per run.
const run = Date.now().toString(36)
const HONOREE = `מיכל ${run}`
const COMPANY = `אקמה ${run}`

async function login(page: Page) {
  await page.goto('/admin')
  await page.getByLabel('אימייל').fill('owner@example.com')
  await page.getByLabel('סיסמה').fill('e2e-password')
  await page.getByRole('button', { name: 'כניסה' }).click()
  await expect(page.getByText('owner@example.com')).toBeVisible()
}

const nav = (page: Page, name: string | RegExp) =>
  page
    .getByRole('navigation')
    .getByRole('link', { name, exact: typeof name === 'string' })
    .click()

test('owner creates a test game from the form and finds it in the orders', async ({ page }) => {
  await login(page)
  await nav(page, 'משחק בדיקה')
  const form = page.locator('form.editor')
  await form.getByRole('combobox', { name: /^אירוע/ }).selectOption({ label: 'רווקות' })
  await form.getByRole('combobox', { name: /^עיצוב/ }).selectOption({ label: 'כרמל בצבעי מים' })
  await expect(form.getByRole('combobox', { name: /^מסלול/ })).not.toHaveValue('')
  await form.getByLabel('שם החוגג/ת').fill(HONOREE)
  await form.getByLabel(/האהבה הראשונה/).fill('יואב מהשכבה')
  await form.getByRole('button', { name: 'יצירת משחק' }).click()

  const result = page.locator('section.result')
  await expect(result.getByText('המשחק נוצר')).toBeVisible()
  await expect(result.getByText('(מוכנה)')).toBeVisible()
  await expect(result.getByRole('link', { name: /\/g\// })).toHaveAttribute('href', /\/g\/[A-Za-z0-9_-]+$/)
  await expect(result.locator('.slot', { hasText: 'יואב מהשכבה' }).first()).toBeVisible()

  await nav(page, 'הזמנות')
  await page.getByLabel(/^חיפוש/).fill(run)
  const row = page.locator('table.orders tbody tr', { hasText: HONOREE })
  await expect(row).toHaveCount(1)
  await expect(row).toContainText('מוכנה')
  await expect(row).toContainText('0 / 20')
  await row.click()
  await expect(page.getByRole('heading', { name: /^הזמנה/ })).toBeVisible()
  await expect(page.locator('ol.stops > li')).toHaveCount(5)
  await expect(page.getByText('נקנה מול נוצל')).toBeVisible()
  await expect(page.getByRole('img', { name: 'QR למשחק' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'שליחת קישור המשחק שוב' })).toBeVisible()
})

test('owner turns a company lead into a quote', async ({ page }) => {
  const lead = await page.request.post('/api/leads', {
    data: {
      companyName: COMPANY,
      contactName: 'דנה',
      phone: '050-7654321',
      email: 'dana@acme.example',
      occasionKey: 'team_day',
      people: 12,
    },
  })
  expect(lead.ok()).toBe(true)

  await login(page)
  await nav(page, 'חברות')
  await page.locator('.list tr', { hasText: COMPANY }).click()
  const editor = page.locator('.editor')
  await expect(editor.getByRole('heading', { name: COMPANY })).toBeVisible()
  await editor.getByLabel('הערות').fill('ביקשו יום שישי')
  await editor.getByRole('button', { name: 'שמירה' }).click()
  await expect(editor.getByText('נשמר')).toBeVisible()

  await expect(editor.getByRole('combobox', { name: /^סוג אירוע/ })).toHaveValue('team_day')
  await editor.getByLabel('מחיר כולל').fill('3600')
  await editor.getByRole('combobox', { name: /^עיצוב/ }).selectOption({ label: 'כרמל בצבעי מים' })
  await editor.getByRole('button', { name: 'יצירת הצעה' }).click()

  await expect(page.getByRole('heading', { name: /^הזמנה/ })).toBeVisible()
  await expect(page.locator('.bar .status')).toHaveText('הצעת מחיר')
  await expect(page.getByLabel('שם החברה')).toHaveValue(COMPANY)
  await expect(page.getByRole('button', { name: 'קישור לתשלום', exact: true })).toBeVisible()
  await expect(page.getByLabel(/משפט שכולם אומרים במשרד/)).toBeVisible()

  await nav(page, 'חברות')
  await expect(page.locator('.list tr', { hasText: COMPANY })).toContainText('נשלחה הצעה')
})

test('settlement page renders for the current month', async ({ page }) => {
  await login(page)
  await nav(page, 'התחשבנות')
  await expect(page.getByRole('heading', { name: 'התחשבנות עם דוכנים' })).toBeVisible()
  const month = await page.getByLabel('חודש').inputValue()
  expect(month).toMatch(/^\d{4}-\d{2}$/)
  await expect(page.getByText(`חודש ${month} לפי שעון ישראל`)).toBeVisible()
  await expect(page.getByRole('link', { name: 'ייצוא ל-CSV' })).toHaveAttribute(
    'href',
    `/admin/api/settlement.csv?month=${month}`,
  )
})
