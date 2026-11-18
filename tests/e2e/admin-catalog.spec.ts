import { expect, type Page, test } from '@playwright/test'

// Works on an empty catalog: everything it uses, it creates. Names are unique per run.
const run = Date.now().toString(36)
const MARKET = `כרמל ${run}`
const STALL = `המיצים ${run}`
const TASTING = `מיץ תפוזים ${run}`
const QSET = `שאלון ${run}`
const ROUTE = `מסלול ${run}`

async function login(page: Page) {
  await page.goto('/admin')
  await page.getByLabel('אימייל').fill('owner@example.com')
  await page.getByLabel('סיסמה').fill('e2e-password')
  await page.getByRole('button', { name: 'כניסה' }).click()
  await expect(page.getByText('owner@example.com')).toBeVisible()
}

async function open(page: Page, section: string, newLabel: string) {
  await page.getByRole('navigation').getByRole('link', { name: section, exact: true }).click()
  await page.getByRole('button', { name: newLabel }).click()
  return page.locator('form.editor')
}

async function save(page: Page) {
  const editor = page.locator('form.editor')
  await editor.getByRole('button', { name: 'שמירה' }).click()
  await expect(editor.getByText('נשמר')).toBeVisible()
}

test('owner builds a catalog: market, stall, tasting, question set, riddle, route', async ({ page }) => {
  await login(page)

  // Market
  let editor = await open(page, 'שווקים', 'שוק חדש')
  await editor.getByLabel('שם', { exact: true }).fill(MARKET)
  await editor.getByLabel('שישי').check()
  await save(page)
  await expect(page.locator('.list').getByText(MARKET)).toBeVisible()
  await expect(editor.getByRole('link', { name: /דף קודים יומיים/ })).toBeVisible()

  // Stall
  editor = await open(page, 'דוכנים', 'דוכן חדש')
  await editor.getByRole('combobox', { name: /^שוק/ }).selectOption({ label: MARKET })
  await editor.getByLabel('שם', { exact: true }).fill(STALL)
  await save(page)
  await expect(page.locator('.list').getByText(STALL)).toBeVisible()

  // Tasting (price shown in shekels, stored in agorot)
  editor = await open(page, 'טעימות', 'טעימה חדשה')
  await editor.getByRole('combobox', { name: /^דוכן/ }).selectOption({ label: `${STALL} (${MARKET})` })
  await editor.getByLabel('שם', { exact: true }).fill(TASTING)
  await editor.getByLabel('טבעוני').check()
  await editor.getByLabel('תשלום לדוכן למנה').fill('12.5')
  await save(page)
  await expect(page.locator('.list tr', { hasText: TASTING })).toContainText('₪12.50')

  // Question set with a "name" slot whose fallback is the sample answer
  editor = await open(page, 'שאלונים', 'שאלון חדש')
  await editor.getByLabel('שם השאלון').fill(QSET)
  await editor.getByRole('button', { name: 'הוספת שאלה' }).click()
  const q = editor.getByTestId('question-0')
  await q.getByLabel('מפתח').fill('name')
  await q.getByLabel('שאלה (היא)').fill('איך קוראים לה?')
  await q.getByLabel('ברירת מחדל', { exact: true }).fill('מיכל')
  await save(page)

  // Riddle: live preview with the fallback, warning for an undefined slot, answer tester
  editor = await open(page, 'חידות', 'חידה חדשה')
  await editor.getByRole('combobox', { name: /^דוכן/ }).selectOption({ label: `${STALL} (${MARKET})` })
  await editor.getByLabel('תשובה', { exact: true }).fill('תקווה')
  await editor.getByRole('combobox', { name: /^שאלון לתצוגה/ }).selectOption({ label: QSET })
  await editor.getByLabel('נוסח (היא)').fill('{name} יודעת שאסור לוותר עליה. {dream}')
  await expect(editor.getByTestId('riddle-preview')).toContainText('מיכל יודעת שאסור לוותר עליה.')
  await expect(editor.getByTestId('riddle-preview').locator('.slot')).toHaveText('מיכל')
  await expect(editor.getByTestId('undefined-slots')).toContainText('dream')
  await editor.getByLabel('נוסח (היא)').fill('{name} יודעת שאסור לוותר עליה. מה היא?')
  await expect(editor.getByTestId('undefined-slots')).toHaveCount(0)
  await editor.getByLabel('תשובה של שחקן').fill('תקוה')
  await expect(editor.getByTestId('answer-result')).toContainText('מתקבלת')
  await editor.getByLabel('תשובה של שחקן').fill('פלאפל')
  await expect(editor.getByTestId('answer-result')).toHaveText('לא מתקבלת')
  await save(page)

  // Route with that stop (tasting and riddle are picked from the stall)
  editor = await open(page, 'מסלולים', 'מסלול חדש')
  await editor.getByRole('combobox', { name: /^שוק/ }).selectOption({ label: MARKET })
  await editor.getByLabel('שם', { exact: true }).fill(ROUTE)
  await editor.getByRole('button', { name: 'הוספת תחנה' }).click()
  const stop = editor.getByTestId('stop-0')
  await expect(stop).toContainText('(גמר)')
  await stop.getByRole('combobox', { name: /^דוכן/ }).first().selectOption({ label: STALL })
  await expect(stop.getByRole('combobox', { name: /^טעימה/ })).toHaveValue(/\d+/)
  await expect(stop.getByRole('combobox', { name: /^חידה/ })).toHaveValue(/\d+/)
  await save(page)
  await expect(page.locator('.list tr', { hasText: ROUTE })).toContainText('1')
})
