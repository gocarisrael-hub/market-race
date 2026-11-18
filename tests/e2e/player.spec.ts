// The player on real phones: two phones play one game together, in sync through polling.
import { type APIRequestContext, type Browser, devices, expect, type Page, test } from '@playwright/test'

// Polls run every few seconds; give cross-phone checks room without fixed sleeps.
const SYNC = { timeout: 15_000 }

async function newGame(request: APIRequestContext) {
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  const res = await request.post('/admin/api/orders/test', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: 1,
      routeId: 1,
      people: 4,
      allergens: ['בוטנים'],
      answers: { first_love: 'יואב מהשכבה' },
      letterNotes: [{ text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' }],
    },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  const url: string = body.links.game
  return { url, token: url.split('/g/')[1] }
}

async function phone(browser: Browser) {
  const ctx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' })
  return ctx.newPage()
}

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']
const TITLES = ['חידה ראשונה', 'חידה שנייה', 'חידה שלישית', 'חידה רביעית', 'חידה אחרונה']

const riddleTitle = (p: Page, i: number) => p.getByRole('heading', { name: TITLES[i], exact: true })
const answerBox = (p: Page) => p.getByLabel('התשובה שלכן')

async function answer(p: Page, text: string) {
  await answerBox(p).fill(text)
  await p.getByRole('button', { name: 'בודקות!' }).click()
}

test('two phones play the whole game together', async ({ browser, request }) => {
  test.setTimeout(180_000)
  const { url } = await newGame(request)
  const a = await phone(browser)
  const b = await phone(browser)

  // Opening on both phones.
  await a.goto(url)
  await b.goto(url)
  await expect(a.getByRole('heading', { name: 'המירוץ של מיכל' })).toBeVisible()
  await expect(b.getByText('5 חידות, 5 טעימות, בלי בוטנים')).toBeVisible()

  // Phone A starts; phone B follows by polling.
  await a.getByRole('button', { name: 'יוצאות לדרך!' }).click()
  await expect(riddleTitle(a, 0)).toBeVisible()
  await expect(riddleTitle(b, 0)).toBeVisible(SYNC)
  await expect(a.locator('.slot', { hasText: 'יואב מהשכבה' })).toBeVisible()

  // A starts typing; B asks for the hint. A sees the hint and keeps its text.
  await answerBox(a).fill('תק')
  await b.getByRole('button', { name: 'רמז' }).click()
  await expect(b.getByText('רמז: זה גם שם של המנון')).toBeVisible()
  await expect(a.getByText('רמז: זה גם שם של המנון')).toBeVisible(SYNC)
  await expect(answerBox(a)).toHaveValue('תק')

  // B answers wrong (gentle feedback, no answer shown), then right.
  await answer(b, 'סתם')
  await expect(b.getByText('כמעט! נסו שוב')).toBeVisible()
  await expect(b.getByText('תקווה')).toHaveCount(0)
  await answer(b, ANSWERS[0])
  await expect(b.getByRole('heading', { name: 'נכון!' })).toBeVisible()
  await expect(b.getByRole('heading', { name: 'דוכן המיצים של תקווה' })).toBeVisible()
  await expect(b.getByText('בכניסה מכיכר מגן דוד, צד ימין')).toBeVisible()
  await expect(a.getByRole('heading', { name: 'נכון!' })).toBeVisible(SYNC)

  // A arrives: the redemption screen, the same on both phones.
  await a.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await expect(a.getByRole('heading', { name: 'הראו את המסך בדוכן' })).toBeVisible()
  await expect(a.getByText('4 מנות מיץ תפוזים טרי')).toBeVisible()
  await expect(a.getByText('בשביל המירוץ של מיכל')).toBeVisible()
  await expect(a.getByText('אלרגיה לבוטנים. תזכירו גם בעל פה.')).toBeVisible()
  const code = a.locator('.code')
  await expect(code).toHaveText(/^\d{4}$/)
  await expect(b.locator('.code')).toHaveText((await code.textContent())!, SYNC)

  // B logs the tasting; A moves on to the second riddle.
  await b.getByRole('button', { name: 'קיבלנו! לחידה הבאה' }).click()
  await expect(riddleTitle(b, 1)).toBeVisible()
  await expect(riddleTitle(a, 1)).toBeVisible(SYNC)

  // Stops 2-4 on phone A; B keeps up.
  for (let i = 1; i < 4; i++) {
    await expect(riddleTitle(a, i)).toBeVisible()
    await answer(a, ANSWERS[i])
    await a.getByRole('button', { name: 'הגענו, למימוש' }).click()
    await a.getByRole('button', { name: 'קיבלנו! לחידה הבאה' }).click()
    await expect(riddleTitle(b, i + 1)).toBeVisible(SYNC)
  }

  // The last stop, played on B; the letter on both phones.
  await answer(b, ANSWERS[4])
  await expect(b.getByText('התחנה האחרונה')).toBeVisible()
  await b.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await b.getByRole('button', { name: 'קיבלנו! למכתב' }).click()
  for (const p of [b, a]) {
    await expect(p.getByRole('heading', { name: 'לחיים, מיכל!' })).toBeVisible(SYNC)
    await expect(p.getByText('נחכה לך עוד חמישים שנה.')).toBeVisible()
    await expect(p.locator('.sig')).toHaveText('נועה')
    await expect(p.locator('.route li')).toHaveCount(5)
  }

  await a.context().close()
  await b.context().close()
})

test('a phone that acts late just catches up', async ({ browser, request }) => {
  const { url, token } = await newGame(request)
  const p = await phone(browser)
  // Freeze this phone's polls on the opening, so it is surely behind when it taps.
  let first: string | null = null
  await p.route(`**/api/game/${token}`, async (route) => {
    if (first === null) first = await (await route.fetch()).text()
    await route.fulfill({ status: 200, contentType: 'application/json', body: first })
  })
  await p.goto(url)
  await expect(p.getByRole('button', { name: 'יוצאות לדרך!' })).toBeVisible()
  // Another phone starts the game behind this one's back.
  const res = await request.post(`/api/game/${token}/action`, { data: { type: 'start' } })
  expect(res.ok()).toBe(true)
  // This phone still shows the opening and taps start: the stale answer brings the riddle.
  await p.getByRole('button', { name: 'יוצאות לדרך!' }).click()
  await expect(riddleTitle(p, 0)).toBeVisible()
  await p.context().close()
})

test('a closed stall sends the group to the backup, and a stall without a pin shows the whole map', async ({
  page,
  request,
}) => {
  const { url, token } = await newGame(request)
  await request.post(`/api/game/${token}/action`, { data: { type: 'start' } })
  await request.post(`/api/game/${token}/action`, { data: { type: 'answer', stopIndex: 0, answer: 'תקווה' } })
  // Closing a stall is an admin action on the live catalog; the view for that day is simulated here.
  await page.route(`**/api/game/${token}`, async (route) => {
    const res = await route.fetch()
    const v = await res.json()
    v.current.reveal = {
      ...v.current.reveal,
      usingBackup: true,
      originalStallName: 'דוכן המיצים של תקווה',
      closedNote: 'תקווה בחופש עד יום ראשון',
      stall: { id: 99, name: 'מיצים בפינה', locationHint: 'מול דוכן התבלינים', pin: null },
    }
    await route.fulfill({ response: res, json: v })
  })
  await page.goto(url)
  await expect(page.getByText('דוכן המיצים של תקווה סגור היום, אז ממשיכים לדוכן אחר:')).toBeVisible()
  await expect(page.getByText('תקווה בחופש עד יום ראשון')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'מיצים בפינה' })).toBeVisible()
  await expect(page.locator('.map-full')).toBeVisible()
  await expect(page.locator('.map-x')).toHaveCount(0)
})

test('help: WhatsApp to us, and a closed stall reported on the spot sends the group to the backup', async ({
  page,
  request,
}) => {
  const { url } = await newGame(request)
  const set = await request.put('/admin/api/catalog/settings/support_whatsapp', {
    data: { value: '054-6577715' },
  })
  expect(set.ok()).toBe(true)
  await page.goto(url)

  // On the opening: WhatsApp only, the prefilled text names the honoree.
  await page.getByRole('button', { name: 'עזרה' }).click()
  const sheet = page.getByRole('dialog', { name: 'צריכות עזרה?' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'לדבר איתנו בוואטסאפ' })).toHaveAttribute(
    'href',
    `https://wa.me/972546577715?text=${encodeURIComponent('היי, אנחנו במירוץ של מיכל.')}`,
  )
  await expect(sheet.getByRole('button', { name: 'הדוכן סגור' })).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)

  // On the reveal: report the stall closed, confirm in the page, see the backup stall.
  await page.getByRole('button', { name: 'יוצאות לדרך!' }).click()
  await answer(page, ANSWERS[0])
  await expect(page.getByRole('heading', { name: 'דוכן המיצים של תקווה' })).toBeVisible()
  await page.getByRole('button', { name: 'עזרה' }).click()
  await expect(sheet.getByRole('link', { name: 'לדבר איתנו בוואטסאפ' })).toHaveAttribute(
    'href',
    `https://wa.me/972546577715?text=${encodeURIComponent('היי, אנחנו במירוץ של מיכל, בתחנה 1.')}`,
  )
  await sheet.getByRole('button', { name: 'הדוכן סגור' }).click()
  await expect(sheet.getByText('דוכן המיצים של תקווה סגור? נשלח אתכם לדוכן אחר.')).toBeVisible()
  await sheet.getByRole('button', { name: 'כן, הדוכן סגור' }).click()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'מיצים בפינה' })).toBeVisible()
  await expect(page.getByText('דוכן המיצים של תקווה סגור היום, אז ממשיכים לדוכן אחר:')).toBeVisible()

  // The backup is closed too: nowhere else to go, WhatsApp front and center.
  await page.getByRole('button', { name: 'עזרה' }).click()
  await sheet.getByRole('button', { name: 'הדוכן סגור' }).click()
  await sheet.getByRole('button', { name: 'כן, הדוכן סגור' }).click()
  await expect(page.getByRole('dialog', { name: 'אין דוכן חלופי, דברו איתנו' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'לדבר איתנו בוואטסאפ' })).toBeVisible()
  await expect(page.getByRole('heading', { name: 'מיצים בפינה' })).toBeVisible()

  await request.delete('/admin/api/catalog/settings/support_whatsapp')
})

test('friendly screens for a missing or expired game', async ({ page, request }) => {
  await page.goto('/g/this-game-does-not-exist')
  await expect(page.getByRole('heading', { name: 'לא מצאנו את המשחק' })).toBeVisible()

  const { url, token } = await newGame(request)
  await page.route(`**/api/game/${token}`, async (route) => {
    const res = await route.fetch()
    await route.fulfill({ response: res, json: { ...(await res.json()), status: 'expired' } })
  })
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'נגמר הזמן' })).toBeVisible()
})
