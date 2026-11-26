// Walking the order build in end-to-end tests: one stage per screen, the main button at the bottom.
import { expect, type Page } from '@playwright/test'

/** The stage's main button (its words change: ממשיכים, בינתיים בלי, לסיכום, לתשלום...). */
export const mainButton = (page: Page) => page.locator('.stage-nav .brush')
/** The stage's back button. */
export const backButton = (page: Page) => page.getByRole('button', { name: 'חזרה לשלב הקודם' })
/** The progress map (a progressbar: "שלב n מתוך N"). */
export const progress = (page: Page) => page.getByRole('progressbar')

/** Presses the main button and waits for the next stage's path. */
export async function next(page: Page, path?: RegExp) {
  const from = page.url()
  await mainButton(page).click()
  if (path) await page.waitForURL(path)
  else await expect.poll(() => page.url()).not.toBe(from)
}

/** The order's token, once the build reached the photos. */
export async function tokenOf(page: Page) {
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]{10,}\/photos$/)
  return page.url().split('/order/')[1].split('/')[0]
}

export type BuildTo = {
  occasion: string
  /** Who the game is for, when the occasion asks. */
  recipient?: string
  name: string
  /** A map and a palette to pick, else the defaults. */
  theme?: string
  palette?: string
  /** Answers by question label, filled on whichever question screen shows them. */
  answers?: Record<string, string>
  later?: boolean
}

/** From /order to the photos stage (the order exists from there); returns its token. */
export async function buildToPhotos(page: Page, o: BuildTo) {
  await page.goto('/order')
  await page.getByRole('radio', { name: o.occasion, exact: true }).click()
  await next(page)
  if (page.url().endsWith('/order/for')) {
    if (o.recipient) await page.getByRole('radio', { name: o.recipient }).click()
    await next(page, /\/order\/name$/)
  }
  await expect(page).toHaveURL(/\/order\/name$/)
  await page.locator('input[name=honoreeName]').fill(o.name)
  await next(page, /\/order\/look$/)
  if (o.theme) await page.getByRole('button', { name: o.theme }).click()
  if (o.palette) await page.getByRole('radio', { name: o.palette }).click()
  await next(page, /\/order\/questions$/)
  if (o.later) await page.getByRole('checkbox', { name: 'אמלא את השאלות אחר כך' }).click()
  await answerQuestions(page, o.answers ?? {})
  return tokenOf(page)
}

/** Answers the question screens from here to the photos. */
export async function answerQuestions(page: Page, answers: Record<string, string>) {
  const left = { ...answers }
  while (/\/order\/questions(\/\d+)?$/.test(new URL(page.url()).pathname)) {
    await expect(page.locator('.stage')).toBeVisible()
    for (const [label, value] of Object.entries(left)) {
      const field = page.getByLabel(label)
      if (await field.count()) {
        await field.fill(value)
        delete left[label]
      }
    }
    await next(page)
  }
  expect(Object.keys(left), 'every answer found a question').toEqual([])
}

/** From the photos to the summary: notes, hints, people, diet left as they are; the buyer filled. */
export async function photosToPay(page: Page) {
  const buyer = { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' }
  for (let i = 0; i < 8 && !/\/details$/.test(page.url()); i++) await next(page)
  await page.getByLabel('השם שלכם').fill(buyer.name)
  await page.getByLabel('טלפון').fill(buyer.phone)
  await page.getByLabel('אימייל').fill(buyer.email)
  await next(page, /\/pay$/)
  await expect(page.getByTestId('total')).toBeVisible()
}
