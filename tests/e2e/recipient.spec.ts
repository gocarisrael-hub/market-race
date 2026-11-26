// Recipient-first: right after the occasion the buyer says who the game is for (one person first),
// and the questions, the riddles and the player's grammar follow.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'

test.use({ viewport: { width: 390, height: 844 } })

async function toToken(page: Page) {
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]+\/photos$/)
  return page.url().split('/order/')[1].split('/')[0]
}

/** Buyer, mock payment and the captain's start, through the API; returns the game link. */
async function payAndStart(request: APIRequestContext, token: string) {
  const put = await request.put(`/api/orders/${token}`, {
    data: { buyer: { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' } },
  })
  expect(put.ok()).toBe(true)
  const pay = await (await request.post(`/api/orders/${token}/pay`)).json()
  const s = new URL(pay.url).searchParams.get('s')
  expect((await request.post('/api/payment/mock/complete', { data: { token: s } })).ok()).toBe(true)
  const m = await (await request.get(`/api/manage/${token}`)).json()
  expect(m.status).toBe('ready')
  const start = await request.post(`/api/manage/${token}/start`, { data: { players: 2 } })
  expect(start.ok()).toBe(true)
  return m.gameLink as string
}

test('a birthday for her: she is picked first, her questions, her grammar in the game', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await page.goto('/order')
  await page.getByRole('radio', { name: 'יום הולדת', exact: true }).click()
  const who = page.getByRole('radiogroup', { name: 'ולמי המשחק?' })
  // One person first, and picked by default; no couple or family for a birthday.
  await expect(who.getByRole('radio')).toHaveText(['למישהי', 'למישהו', 'לקבוצה'])
  await expect(who.getByRole('radio', { name: 'למישהי' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('רוב המשחקים הם מתנה לאדם אחד')).toBeVisible()
  await page.getByRole('button', { name: 'כרמל בצבעי מים' }).click()
  // The palette daubs are single clean smears (no chip at the corner).
  await expect(page.locator('.daub-shape').first().locator('path')).toHaveCount(2)
  await page.screenshot({
    path: 'docs/screens/site/1-home-recipient.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()

  await expect(page).toHaveURL(/\/order\/questions$/)
  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליה')
  await page.getByLabel(/איך קוראים לה\?/).fill('מיכל')
  await expect(page.getByLabel('מה היא הייתה אוכלת כל יום, אם רק היה אפשר?')).toBeVisible()
  await page.getByLabel('מי או מה הייתה האהבה הראשונה שלה? (ילד מהכיתה, להקה, כלב)').fill('הספייס גירלז')
  // Not the love game's questions.
  await expect(page.getByLabel(/ביניכם/)).toHaveCount(0)
  await page.screenshot({
    path: 'docs/screens/site/2-questions-birthday-she.png',
    fullPage: true,
    animations: 'disabled',
  })
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'birthday_friend',
    recipient: 'she',
    form: 'she',
  })
  const token = await toToken(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלה' })).toBeVisible()

  const gameUrl = await payAndStart(request, token)
  await page.goto(gameUrl)
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  await expect(page.getByText('מאז הספייס גירלז, מיכל יודעת שאסור לוותר עליה')).toBeVisible()
  // The players are a mixed group: the plain plural, not the bachelorette's feminine one.
  await expect(page.getByLabel('התשובה שלכם')).toBeVisible()
  await expect(page.getByRole('button', { name: 'בודקים!' })).toBeVisible()
})

test('a love game for him: his questions from the giver, his grammar in the game', async ({
  page,
  request,
}) => {
  test.setTimeout(90_000)
  await page.goto('/order')
  await page.getByRole('radio', { name: 'אהבה וזוגיות' }).click()
  const who = page.getByRole('radiogroup', { name: 'ולמי המשחק?' })
  await expect(who.getByRole('radio')).toHaveText(['למישהי', 'למישהו', 'לזוג'])
  await who.getByRole('radio', { name: 'למישהו' }).click()
  await expect(who.getByRole('radio', { name: 'למישהו' })).toHaveAttribute('aria-checked', 'true')
  await page.getByRole('button', { name: 'כרמל בצבעי מים' }).click()
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליו' }).click()

  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליו')
  await page.getByLabel(/איך קוראים לו\?/).fill('יואב')
  await page.getByLabel('איך הכול התחיל ביניכם? (למשל: הדייט הראשון בפלורנטין)').fill('הדייט הראשון ביפו')
  await expect(page.getByLabel('מה הוא מזמין תמיד, בכל מסעדה, בלי להסתכל בתפריט?')).toBeVisible()
  await expect(page.getByLabel('כינוי או משפט שהוא אומר רק לך')).toBeVisible()
  // The birthday's questions are not asked here.
  await expect(page.getByLabel(/אוכל כל יום/)).toHaveCount(0)
  await page.screenshot({
    path: 'docs/screens/site/2-questions-love-he.png',
    fullPage: true,
    animations: 'disabled',
  })
  // The she/he switch next to the name moves to her questions and back.
  const sw = page.getByRole('radiogroup', { name: 'המשחק' })
  await sw.getByRole('radio', { name: 'עליה' }).click()
  await expect(page.getByLabel('מה היא מזמינה תמיד, בכל מסעדה, בלי להסתכל בתפריט?')).toBeVisible()
  await sw.getByRole('radio', { name: 'עליו' }).click()
  await expect(page.getByLabel('מה הוא מזמין תמיד, בכל מסעדה, בלי להסתכל בתפריט?')).toBeVisible()
  await page.getByLabel('איך הכול התחיל ביניכם? (למשל: הדייט הראשון בפלורנטין)').fill('הדייט הראשון ביפו')

  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'couple',
    recipient: 'he',
    form: 'he',
    answers: { first_love: 'הדייט הראשון ביפו' },
  })
  const token = await toToken(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלו' })).toBeVisible()

  const gameUrl = await payAndStart(request, token)
  await page.goto(gameUrl)
  await expect(page.getByText('מאז הדייט הראשון ביפו, יואב יודע שאסור לוותר עליה')).toBeVisible()
  await expect(page.getByRole('button', { name: 'בודקים!' })).toBeVisible()
})
