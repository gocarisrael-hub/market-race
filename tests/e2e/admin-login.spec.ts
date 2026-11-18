import { expect, test } from '@playwright/test'

test('owner logs in to the admin and out again', async ({ page }) => {
  await page.goto('/admin')
  await page.getByLabel('אימייל').fill('owner@example.com')
  await page.getByLabel('סיסמה').fill('wrong')
  await page.getByRole('button', { name: 'כניסה' }).click()
  await expect(page.getByText('אימייל או סיסמה שגויים')).toBeVisible()

  await page.getByLabel('סיסמה').fill('e2e-password')
  await page.getByRole('button', { name: 'כניסה' }).click()
  await expect(page.getByText('owner@example.com')).toBeVisible()

  await page.getByRole('button', { name: 'התנתקות' }).click()
  await expect(page.getByRole('heading', { name: 'כניסה לניהול' })).toBeVisible()
})
