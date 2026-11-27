// The order build on a phone: the occasions sit in an even grid of two, and the sticky bar at the
// bottom never covers an option, wherever the page scrolls it into view.
import { expect, type Locator, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

type Box = { x: number; y: number; width: number; height: number }
const intersects = (a: Box, b: Box) =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

async function box(l: Locator) {
  const b = await l.boundingBox()
  if (!b) throw new Error('not rendered')
  return b
}

test('occasions: an even two-column grid, the last one never under the sticky button', async ({ page }) => {
  await page.goto('/order')
  const options = page.getByRole('radiogroup').getByRole('radio')
  await expect(options.first()).toBeVisible()
  // Measure once the stage has slid in (the doodles bob forever: only finite animations count).
  await page.locator('main.page').evaluate((el) =>
    Promise.all(
      el
        .getAnimations({ subtree: true })
        .filter((a) => a.effect?.getTiming().iterations !== Number.POSITIVE_INFINITY)
        .map((a) => a.finished.catch(() => {})),
    ),
  )
  const n = await options.count()
  expect(n).toBeGreaterThan(2)

  // Two columns of equal width: every option's left edge is one of two, and rows are full.
  const boxes = await Promise.all(Array.from({ length: n }, (_, i) => box(options.nth(i))))
  // Positions fall on half pixels: compare within a few pixels.
  const near = (a: number, b: number) => Math.abs(a - b) < 3
  const columns: number[] = []
  for (const b of boxes) if (!columns.some((x) => near(x, b.x))) columns.push(b.x)
  expect(columns).toHaveLength(2)
  expect(Math.abs(boxes[0].width - boxes[1].width)).toBeLessThan(2)
  for (let i = 0; i + 1 < n; i += 2) expect(near(boxes[i].y, boxes[i + 1].y)).toBe(true)
  // The icon sits over the word.
  const art = await box(options.first().locator('.opt-art'))
  expect(art.y - boxes[0].y).toBeLessThan(20)
  expect(Math.abs(art.x + art.width / 2 - (boxes[0].x + boxes[0].width / 2))).toBeLessThan(4)
  expect(boxes[0].height).toBeGreaterThan(art.height + 20)

  const button = page.locator('.stage-nav .brush')
  const last = options.last()
  // Wherever the page brings the last option into view, it is never under the sticky button.
  // As loaded: when it fits above the fold it is clear of the button (below the fold, the page
  // scrolls on to it, as any page under a sticky bar).
  const loaded = await box(last)
  if (loaded.y + loaded.height <= 844) expect(intersects(loaded, await box(button))).toBe(false)
  // At the bottom of the page.
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
  expect(intersects(await box(last), await box(button))).toBe(false)
  await page.evaluate(() => window.scrollTo(0, 0))
  await last.evaluate((el) => el.scrollIntoView({ block: 'nearest' }))
  expect(intersects(await box(last), await box(button))).toBe(false)
  await last.focus()
  expect(intersects(await box(last), await box(button))).toBe(false)
})
