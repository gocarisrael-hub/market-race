// Recipient-first: right after the occasion the buyer says who the game is for (one person first),
// and the questions, the riddles and the player's grammar follow.
import { type APIRequestContext, expect, test } from '@playwright/test'
import { answerQuestions, backButton, mainButton, next, tokenOf } from '../helpers/order.ts'

test.use({ viewport: { width: 390, height: 844 } })

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
  await next(page, /\/order\/for$/)
  const who = page.getByRole('radiogroup', { name: 'למי המשחק?' })
  // One person first, and picked by default; no couple or family for a birthday.
  await expect(who.getByRole('radio')).toHaveText(['למישהי', 'למישהו', 'לקבוצה'])
  await expect(who.getByRole('radio', { name: 'למישהי' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByText('רוב המשחקים הם מתנה לאדם אחד')).toBeVisible()
  await page.screenshot({
    path: 'docs/screens/site/build-for-birthday.png',
    fullPage: true,
    animations: 'disabled',
  })
  await next(page, /\/order\/people$/)
  await next(page, /\/order\/name$/)
  await page.getByLabel(/איך קוראים לה\?/).fill('מיכל')
  await next(page, /\/order\/look$/)
  // The palette daubs are single clean smears (no chip at the corner).
  await expect(page.locator('.daub-shape').first().locator('path')).toHaveCount(2)
  await next(page, /\/order\/questions$/)

  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליה')
  await expect(page.getByLabel('מה האוכל האהוב עליה?')).toBeVisible()
  // Not the love game's questions.
  await expect(page.getByLabel(/ביניכם/)).toHaveCount(0)
  await page.getByLabel('מי הייתה האהבה הראשונה שלה?').fill('הספייס גירלז')
  await page.screenshot({
    path: 'docs/screens/site/build-questions-birthday-she.png',
    fullPage: true,
    animations: 'disabled',
  })
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await answerQuestions(page, {})
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'birthday_friend',
    recipient: 'she',
    form: 'she',
  })
  const token = await tokenOf(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלה' })).toBeVisible()

  const gameUrl = await payAndStart(request, token)
  await page.goto(gameUrl)
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  await expect(page.getByText('ומאז הספייס גירלז, מיכל יודעת: עליה לא מוותרים.')).toBeVisible()
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
  await page.getByRole('radio', { name: 'דייט רומנטי' }).click()
  await next(page, /\/order\/for$/)
  const who = page.getByRole('radiogroup', { name: 'למי המשחק?' })
  await expect(who.getByRole('radio')).toHaveText(['למישהי', 'למישהו', 'לזוג'])
  await who.getByRole('radio', { name: 'למישהו' }).click()
  await expect(who.getByRole('radio', { name: 'למישהו' })).toHaveAttribute('aria-checked', 'true')
  await next(page, /\/order\/people$/)
  await next(page, /\/order\/name$/)
  await page.getByLabel(/איך קוראים לו\?/).fill('יואב')
  await next(page, /\/order\/look$/)
  await next(page, /\/order\/questions$/)

  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליו')
  await page.getByLabel('איפה הכול התחיל ביניכם?').fill('הדייט הראשון ביפו')
  await expect(page.getByLabel('מה הוא תמיד מזמין?')).toBeVisible()
  // The birthday's questions are not asked here.
  await expect(page.getByLabel(/האוכל האהוב עליו/)).toHaveCount(0)
  await page.screenshot({
    path: 'docs/screens/site/build-questions-love-he.png',
    fullPage: true,
    animations: 'disabled',
  })
  // The she/he switch next to the name moves to her questions and back.
  await backButton(page).click()
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/name$/)
  const sw = page.getByRole('radiogroup', { name: 'המשחק' })
  await sw.getByRole('radio', { name: 'עליה' }).click()
  await expect(page.getByRole('heading', { name: 'איך קוראים לה?' })).toBeVisible()
  await next(page, /\/order\/look$/)
  await next(page, /\/order\/questions$/)
  await expect(page.getByLabel('מה היא תמיד מזמינה?')).toBeVisible()
  await backButton(page).click()
  await backButton(page).click()
  await sw.getByRole('radio', { name: 'עליו' }).click()
  await next(page, /\/order\/look$/)
  await next(page, /\/order\/questions$/)
  await expect(page.getByLabel('מה הוא תמיד מזמין?')).toBeVisible()
  // The answer kept its slot across the switch.
  await expect(page.getByLabel('איפה הכול התחיל ביניכם?')).toHaveValue('הדייט הראשון ביפו')

  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await answerQuestions(page, {})
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'couple',
    recipient: 'he',
    form: 'he',
    answers: { first_love: 'הדייט הראשון ביפו' },
  })
  const token = await tokenOf(page)
  await expect(mainButton(page)).toHaveText('בינתיים בלי, ממשיכים')
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלו' })).toBeVisible()

  const gameUrl = await payAndStart(request, token)
  await page.goto(gameUrl)
  await expect(page.getByText('ומאז הדייט הראשון ביפו, יואב יודע: עליה לא מוותרים.')).toBeVisible()
  await expect(page.getByRole('button', { name: 'בודקים!' })).toBeVisible()
})

test("a kid's birthday: for a girl or a boy, a parent's questions about the child", async ({ page }) => {
  await page.goto('/order')
  await page.getByRole('radio', { name: 'יום הולדת לילד', exact: true }).click()
  await next(page, /\/order\/for$/)
  const who = page.getByRole('radiogroup', { name: 'למי המשחק?' })
  // The occasion names its recipients itself.
  await expect(who.getByRole('radio')).toHaveText(['לילדה', 'לילד'])
  await who.getByRole('radio', { name: 'לילד', exact: true }).click()
  await next(page, /\/order\/people$/)
  await next(page, /\/order\/name$/)
  await page.getByLabel(/איך קוראים לו\?/).fill('איתי')
  await next(page, /\/order\/look$/)
  await next(page, /\/order\/questions$/)
  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליו')
  await expect(page.getByLabel('מה האוכל האהוב עליו?')).toBeVisible()
  await expect(page.getByLabel('המשחק או הסדרה האהובים עליו')).toBeVisible()
  await expect(page.getByLabel(/מה הוא רוצה להיות כשיגדל/)).toBeVisible()
  // Never a love question for a child.
  await expect(page.getByLabel(/אהבה/)).toHaveCount(0)
})
