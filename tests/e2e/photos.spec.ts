// Photos end to end: the buyer uploads two photos on the site, pays (mock provider), and the game
// shows them: taped on the riddle notes (visible without scrolling on a small phone), bigger in a
// lightbox, and both in the final letter.
// Sample photos: "Dog on grass" (Ina Meyer, public domain) and "Boxer dog posing on the grass"
// (CC0), both from Wikimedia Commons.
import { expect, test } from '@playwright/test'

test.use({ viewport: { width: 360, height: 740 } })

const PHOTOS = ['tests/fixtures/dog-on-grass.jpg', 'tests/fixtures/boxer-on-grass.jpg']
const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']

test('an order with two photos: on the riddles, in a lightbox, and in the letter', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('/')
  await page.getByRole('radio', { name: 'רווקות' }).click()
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()
  await page.getByLabel(/איך קוראים לה/).fill('מיכל')
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]+\/photos$/)
  const token = page.url().split('/order/')[1].split('/')[0]

  await expect(page.getByText('יופיעו על החידות ובמכתב בסוף.')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(PHOTOS)
  await expect(page.locator('.polaroid img')).toHaveCount(2, { timeout: 20_000 })
  await expect(page.getByText('2 מתוך 5')).toBeVisible()

  await page.getByRole('link', { name: 'לתשלום' }).click()
  await page.getByLabel('השם שלכם').fill('נועה')
  await page.getByLabel('טלפון').fill('050-1234567')
  await page.getByLabel('אימייל').fill('noa@example.com')
  await page.getByRole('button', { name: /^לתשלום/ }).click()
  await page.frameLocator('iframe').getByRole('button', { name: 'לשלם (לדוגמה)' }).click()
  await expect(page).toHaveURL(new RegExp(`/m/${token}`), { timeout: 30_000 })
  const link = page.getByRole('link', { name: 'לפתוח את המשחק' })
  await expect(link).toHaveAttribute('href', /\/g\//, { timeout: 30_000 })
  // Until the game starts, the manage page offers to change the photos.
  await expect(page.getByRole('link', { name: 'להוסיף או להחליף תמונות (2 מתוך 5)' })).toBeVisible()
  // Taped prints of the drawn photos in the drop area's slots.
  await expect(page.locator('.photo-drop .drop-count')).toHaveText('2/5')
  await expect(page.locator('.photo-drop .slot img')).toHaveCount(2)
  const gameUrl = (await link.getAttribute('href'))!
  const gameToken = gameUrl.split('/g/')[1]

  await page.goto(gameUrl)
  await page.getByRole('button', { name: 'יוצאות לדרך!' }).click()
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  const photo = page.locator('.riddle-photo img')
  await expect(photo).toBeVisible()
  await expect(photo).toHaveAttribute('src', /\/uploads\/photos\/.+-ill\.jpg$/)
  // Fully on screen without scrolling.
  await expect(photo).toBeInViewport({ ratio: 1 })
  await expect.poll(() => photo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)

  // Tap: bigger, in a lightbox; the close button and Escape close it.
  await page.getByRole('button', { name: 'להגדיל את התמונה' }).click()
  const dialog = page.getByRole('dialog', { name: 'התמונה בגדול' })
  await expect(dialog).toBeVisible()
  const big = await dialog.locator('img').boundingBox()
  const small = await photo.boundingBox()
  expect(big!.width).toBeGreaterThan(small!.width * 1.8)
  await dialog.getByRole('button', { name: 'סגירה' }).click()
  await expect(dialog).toHaveCount(0)
  await page.getByRole('button', { name: 'להגדיל את התמונה' }).click()
  await expect(dialog).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)

  // Play the rest through the API; the second riddle has the second photo, the third none.
  const act = async (data: Record<string, unknown>) => {
    const r = await page.request.post(`/api/game/${gameToken}/action`, { data })
    expect(r.ok()).toBe(true)
  }
  for (let i = 0; i < 5; i++) {
    await act({ type: 'answer', stopIndex: i, answer: ANSWERS[i] })
    await act({ type: 'arrived', stopIndex: i })
    await act({ type: 'redeemed', stopIndex: i })
    if (i === 0) {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'חידה שנייה', exact: true })).toBeVisible()
      await expect(page.locator('.riddle-photo img')).toBeVisible()
    }
    if (i === 1) {
      await page.reload()
      await expect(page.getByRole('heading', { name: 'חידה שלישית', exact: true })).toBeVisible()
      await expect(page.locator('.riddle-photo')).toHaveCount(0)
    }
  }

  await page.reload()
  await expect(page.getByRole('heading', { name: 'לחיים, מיכל!' })).toBeVisible()
  const letterPhotos = page.locator('.letter-photo img')
  await expect(letterPhotos).toHaveCount(2)
  await letterPhotos.nth(1).scrollIntoViewIfNeeded()
  await expect(letterPhotos.nth(1)).toBeVisible()
  await page.getByRole('button', { name: 'להגדיל את התמונה' }).nth(1).click()
  await expect(page.getByRole('dialog', { name: 'התמונה בגדול' })).toBeVisible()
  await page.getByRole('button', { name: 'סגירה' }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
