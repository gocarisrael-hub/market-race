// The buyer's edit link: after paying (mock provider), the buyer opens the manage page, taps
// "ערוך", changes an answer and the name, and the game's first riddle shows the change.
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

test('buyer edits an answer after paying and sees it in the first riddle', async ({ page }) => {
  const shop = await (await page.request.get('/api/shop')).json()
  const created = await page.request.post('/api/orders', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: shop.themes[0].id,
      people: 4,
      answers: { first_love: 'יואב מהשכבה' },
      buyer: { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' },
    },
  })
  expect(created.ok()).toBe(true)
  const { manageToken } = await created.json()
  const pay = await (await page.request.post(`/api/orders/${manageToken}/pay`)).json()
  const s = new URL(pay.url).searchParams.get('s')
  expect((await page.request.post('/api/payment/mock/complete', { data: { token: s } })).ok()).toBe(true)

  await page.goto(`/m/${manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.')
  await expect(page.getByText('אפשר לשנות תשובות, תמונות וצבע עד שמתחילים לשחק.')).toBeVisible()
  await page.getByRole('button', { name: 'ערוך' }).click()
  await expect(page.getByRole('heading', { name: 'עריכה' })).toBeVisible()
  const field = page.locator('input[name="first_love"]')
  await expect(field).toHaveValue('יואב מהשכבה')
  await field.fill('דני מהצבא')
  await page.locator('input[name="honoreeName"]').fill('מיכלי')
  await page.getByRole('button', { name: 'שמירת השינויים' }).click()
  await expect(page.getByText('השינויים נשמרו.')).toBeVisible()
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.')

  const gameUrl = (await page.getByRole('link', { name: 'לפתוח את המשחק' }).getAttribute('href'))!
  await page.goto(gameUrl)
  await page.getByRole('button', { name: 'יוצאות לדרך!' }).click()
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  await expect(page.getByText('דני מהצבא')).toBeVisible()
  await expect(page.getByText('יואב מהשכבה')).toHaveCount(0)

  // Started: the manage page no longer offers to edit.
  await page.goto(`/m/${manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק בעיצומו.')
  await expect(page.getByRole('button', { name: 'ערוך' })).toHaveCount(0)
})
