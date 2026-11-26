// The owner dislikes underlined links: every visible action is drawn (brush or outline).
import { expect, type Page } from '@playwright/test'

/** Every visible action is drawn (brush or outline), none is a bare underlined text link. */
export async function noBareLinks(page: Page) {
  const bare = await page.$$eval('a, button', (els) =>
    els
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .filter((el) => getComputedStyle(el).textDecorationLine.includes('underline'))
      .map((el) => el.textContent?.trim()),
  )
  expect(bare, `underlined links on ${page.url()}`).toEqual([])
}
