// "With / without background" end to end, with the real cutout: the buyer picks a photo, asks for
// it without background, the browser cuts the dog out (MediaPipe, self-hosted under
// /vendor/mediapipe), the server draws the cutout on paper, and the choice can be changed
// back and forth on the photos step and on the manage page.
// Sample photo: "Dog on grass" (Ina Meyer, public domain, Wikimedia Commons).
import { expect, test } from '@playwright/test'
import { buildToPhotos } from '../helpers/order.ts'

test.use({ viewport: { width: 360, height: 740 } })

test('a photo without background, cut in the browser, and switched back on the manage page', async ({
  page,
}) => {
  test.setTimeout(120_000)
  const token = await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })

  await page.locator('input[type=file]').setInputFiles(['tests/fixtures/dog-on-grass.jpg'])
  const drawn = page.locator('.photo-pair .polaroid img')
  await expect(drawn).toHaveCount(1, { timeout: 20_000 })
  await expect(drawn).toHaveAttribute('src', /\/uploads\/photos\/[^/]+-ill\.jpg$/)
  const choice = page.getByRole('radiogroup', { name: 'הרקע של התמונה' })
  await expect(choice.getByRole('radio', { name: 'עם רקע' })).toHaveAttribute('aria-checked', 'true')

  // Without background: the cut runs in this browser and the drawing is replaced.
  await choice.getByRole('radio', { name: 'בלי רקע' }).click()
  await expect(drawn).toHaveAttribute('src', /-cut-ill\.jpg$/, { timeout: 60_000 })
  await expect(choice.getByRole('radio', { name: 'בלי רקע' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByRole('alert')).toHaveCount(0)
  const listed = await (await page.request.get(`/api/orders/${token}/photos`)).json()
  expect(listed.photos[0]).toMatchObject({ background: 'remove', hasCutout: true, cutFailed: false })

  // Back with background.
  await choice.getByRole('radio', { name: 'עם רקע' }).click()
  await expect(drawn).toHaveAttribute('src', /[^t]-ill\.jpg$/)

  // The manage page shows the photo with the same choice, and switches without a new cut.
  await page.goto(`/m/${token}`)
  const manageChoice = page.getByRole('radiogroup', { name: 'הרקע של התמונה' })
  await expect(manageChoice).toBeVisible()
  const thumb = page.locator('.photo-drop .slot-card .slot img')
  await expect(thumb).toHaveAttribute('src', /[^t]-ill\.jpg$/)
  await manageChoice.getByRole('radio', { name: 'בלי רקע' }).click()
  await expect(thumb).toHaveAttribute('src', /-cut-ill\.jpg$/)
  await expect.poll(() => thumb.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0)
  const after = await (await page.request.get(`/api/orders/${token}/photos`)).json()
  expect(after.photos[0].background).toBe('remove')

  // Removing it from its slot empties the slot and the count.
  await page.locator('.photo-drop .slot-card').getByRole('button', { name: 'הסרה' }).click()
  await expect(page.locator('.photo-drop .slot-card')).toHaveCount(0)
  await expect(page.locator('.photo-drop .drop-count')).toHaveText('0/5')
  const gone = await (await page.request.get(`/api/orders/${token}/photos`)).json()
  expect(gone.photos).toHaveLength(0)
})
