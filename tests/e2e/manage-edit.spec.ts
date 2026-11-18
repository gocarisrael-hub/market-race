// The buyer's edit link: after paying (mock provider), the buyer opens the manage page, taps
// "ערוך", changes an answer, the name and the color, and the game shows the change.
import { expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

/** Every visible action is drawn (brush or outline), none is a bare underlined text link. */
async function noBareLinks(page: Page) {
  const bare = await page.$$eval('a, button', (els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => getComputedStyle(el).textDecorationLine.includes('underline'))
      .map((el) => el.textContent?.trim()),
  )
  expect(bare).toEqual([])
}

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
  // The photo control is a drawn drop area with empty taped slots and a count.
  const drop = page.locator('.photo-drop')
  await expect(drop.getByRole('link', { name: 'להוסיף תמונות למשחק' })).toBeVisible()
  await expect(drop.locator('.drop-count')).toHaveText('0/5')
  await expect(drop.locator('.slot')).toHaveCount(5)
  await noBareLinks(page)
  await page.getByRole('button', { name: 'ערוך' }).click()
  await expect(page.getByRole('heading', { name: 'עריכה' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'ביטול' })).toHaveClass(/sketch/)
  await noBareLinks(page)
  const field = page.locator('input[name="first_love"]')
  await expect(field).toHaveValue('יואב מהשכבה')
  await field.fill('דני מהצבא')
  await page.locator('input[name="honoreeName"]').fill('מיכלי')
  // The color: another daub, previewed live, then saved into the game.
  const daubs = page.getByRole('radio').and(page.locator('.daub'))
  expect(await daubs.count()).toBeGreaterThan(1)
  const preview = page.getByTestId('look-preview')
  await expect(preview).toBeVisible()
  const unpicked = daubs.and(page.locator('[aria-checked="false"]')).last()
  const paletteId = Number(await unpicked.getAttribute('data-palette'))
  const pick = page.locator(`.daub[data-palette="${paletteId}"]`)
  await pick.click()
  await expect(pick).toHaveAttribute('aria-checked', 'true')
  const shopPal = shop.themes[0].palettes.find((p: { id: number }) => p.id === paletteId)
  await expect(page.locator('.daub-name')).toHaveText(shopPal.name)
  await page.getByRole('button', { name: 'שמירת השינויים' }).click()
  await expect(page.getByText('השינויים נשמרו.')).toBeVisible()
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.')

  const gameUrl: string = (await (await page.request.get(`/api/manage/${manageToken}`)).json()).gameLink
  const view = await (await page.request.get(`/api/game/${gameUrl.split('/g/')[1]}`)).json()
  expect(view.theme.palette.accent).toBe(shopPal.palette.accent)
  // The captain starts the game here and goes into it.
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מתחילים!' }).click()
  await page.getByRole('link', { name: 'ממשיכים למשחק' }).click()
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  await expect(page.getByText('דני מהצבא')).toBeVisible()
  await expect(page.getByText('יואב מהשכבה')).toHaveCount(0)

  // Started: the manage page no longer offers to edit.
  await page.goto(`/m/${manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק בעיצומו.')
  await expect(page.getByRole('button', { name: 'ערוך' })).toHaveCount(0)
})
