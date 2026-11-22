// The captain starts the game (and is emailed the players' link), pauses it for everyone from their
// own phone ("עוצרים להיום"), and resumes it from the manage link at the same stop. Plus "איבדתי את
// הקישור" on the site. Emails are not configured in the e2e server, so they are checked in the
// admin's message log (logged as skipped).
import { type APIRequestContext, devices, expect, type Page, test } from '@playwright/test'

const SYNC = { timeout: 15_000 }
const run = Date.now().toString(36)

async function paidOrder(request: APIRequestContext, email: string) {
  const shop = await (await request.get('/api/shop')).json()
  const created = await request.post('/api/orders', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: shop.themes[0].id,
      people: 5,
      answers: { first_love: 'יואב מהשכבה' },
      buyer: { name: 'נועה', phone: '050-1234567', email },
    },
  })
  expect(created.ok()).toBe(true)
  const { manageToken, orderNo } = await created.json()
  const pay = await (await request.post(`/api/orders/${manageToken}/pay`)).json()
  const s = new URL(pay.url).searchParams.get('s')
  expect((await request.post('/api/payment/mock/complete', { data: { token: s } })).ok()).toBe(true)
  const m = await (await request.get(`/api/manage/${manageToken}`)).json()
  expect(m.status).toBe('ready')
  return { manageToken, orderNo: orderNo as string, gameUrl: m.gameLink as string }
}

/** The templates logged for an order, from the admin (the owner's view of what was sent). */
async function sentTemplates(request: APIRequestContext, orderNo: string): Promise<string[]> {
  const login = await request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  const list = await (await request.get(`/admin/api/orders?q=${encodeURIComponent(orderNo)}`)).json()
  const id = list.orders.find((o: { orderNo: string }) => o.orderNo === orderNo).id
  const d = await (await request.get(`/admin/api/orders/${id}`)).json()
  return d.messages
    .filter((m: { channel: string }) => m.channel === 'email')
    .map((m: { template: string }) => m.template)
}

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

const riddle = (p: Page, name: string) => p.getByRole('heading', { name, exact: true })

test('the captain starts, pauses for everyone, and resumes at the same stop', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(150_000)
  const email = `captain-${run}@example.com`
  const { manageToken, orderNo, gameUrl } = await paidOrder(request, email)

  // Start from the manage page with 3 of 5: the buyer is emailed the players' link.
  await page.goto(`/m/${manageToken}`)
  await page.getByRole('button', { name: 'פחות משתתפים' }).click()
  await page.getByRole('button', { name: 'פחות משתתפים' }).click()
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מתחילים!' }).click()
  await expect(page.getByRole('heading', { name: 'המשחק התחיל!' })).toBeVisible()
  expect(await sentTemplates(request, orderNo)).toContain('game_started')

  // A player on the bare game link.
  const friendCtx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' })
  const friend = await friendCtx.newPage()
  await friend.goto(gameUrl)
  await expect(riddle(friend, 'חידה ראשונה')).toBeVisible()

  // The captain continues into the game from the manage page; the captain token leaves the address.
  await page.getByRole('link', { name: 'ממשיכים למשחק' }).click()
  await expect(riddle(page, 'חידה ראשונה')).toBeVisible()
  expect(page.url()).toBe(gameUrl)

  // Stop 1, then on to stop 2.
  await page.getByLabel('התשובה שלכן').fill('תקווה')
  await page.getByRole('button', { name: 'בודקות!' }).click()
  await page.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await page.getByRole('button', { name: 'קיבלנו! לחידה הבאה' }).click()
  await expect(riddle(page, 'חידה שנייה')).toBeVisible()
  await expect(riddle(friend, 'חידה שנייה')).toBeVisible(SYNC)

  // Only the captain's phone can pause: the player's help sheet has no pause.
  // (With no support number set the player has no help sheet at all; with one, it has no pause.)
  const friendHelp = friend.getByRole('button', { name: 'עזרה' })
  if (await friendHelp.count()) {
    await friendHelp.click()
    await expect(friend.getByRole('dialog')).toBeVisible()
  }
  await expect(friend.getByRole('button', { name: 'עוצרים להיום' })).toHaveCount(0)
  if (await friendHelp.count()) await friend.getByRole('button', { name: 'סגירה' }).first().click()
  const noCaptain = await request.post(`${gameUrl.replace('/g/', '/api/game/')}/pause`, { data: {} })
  expect(noCaptain.status()).toBe(403)

  // The captain pauses for today, after a confirm ("not now" first changes nothing).
  await page.getByRole('button', { name: 'עזרה' }).click()
  await page.getByRole('button', { name: 'עוצרים להיום' }).click()
  await expect(page.getByRole('heading', { name: 'עוצרים להיום?' })).toBeVisible()
  await expect(page.getByText('בתחנה 2 מתוך 5')).toBeVisible()
  await noBareLinks(page)
  await page.getByRole('button', { name: 'לא, ממשיכות לשחק' }).click()
  await page.getByRole('button', { name: 'עוצרים להיום' }).click()
  await page.getByRole('button', { name: 'כן, עוצרים' }).click()

  // Everyone sees the paused screen; no riddle.
  for (const p of [page, friend]) {
    await expect(p.getByRole('heading', { name: 'המשחק בהפסקה' })).toBeVisible(SYNC)
    await expect(p.getByText('עצרתם בתחנה 2 מתוך 5')).toBeVisible()
    await expect(p.getByText('ממשיכים בפעם הבאה')).toBeVisible()
    await expect(p.getByLabel('התשובה שלכן')).toHaveCount(0)
  }
  await noBareLinks(friend)
  await friend.screenshot({ path: 'docs/screens/look/player-paused.png', animations: 'disabled' })
  // The server refuses play while paused.
  const refused = await request.post(`${gameUrl.replace('/g/', '/api/game/')}/action`, {
    data: { type: 'answer', stopIndex: 1, answer: "ג'חנון" },
  })
  expect(refused.status()).toBe(409)
  expect((await refused.json()).error).toBe('paused')
  expect(await sentTemplates(request, orderNo)).toContain('game_paused')

  // Another day: the manage page shows where they stopped and resumes with a brush stroke.
  await page.goto(`/m/${manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק בהפסקה.')
  await expect(page.getByTestId('paused-where')).toHaveText('עצרתם בתחנה 2 מתוך 5')
  await expect(page.getByText('3 משתתפים, כמו בהתחלה.')).toBeVisible()
  await expect(page.getByRole('link', { name: 'שולחים בוואטסאפ' })).toHaveCount(0)
  const resume = page.getByRole('button', { name: 'ממשיכים' })
  await expect(resume).toHaveClass(/brush/)
  await noBareLinks(page)
  await page.screenshot({
    path: 'docs/screens/site/6c-manage-paused.png',
    fullPage: true,
    animations: 'disabled',
  })
  await resume.click()

  // Everyone continues at exactly the same stop, on the same link.
  await expect(riddle(page, 'חידה שנייה')).toBeVisible()
  expect(page.url()).toBe(gameUrl)
  await expect(riddle(friend, 'חידה שנייה')).toBeVisible(SYNC)
  await friend.getByLabel('התשובה שלכן').fill("ג'חנון")
  await friend.getByRole('button', { name: 'בודקות!' }).click()
  await friend.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await expect(friend.getByText(/^3 מנות/)).toBeVisible()
  // Still the captain on this phone: the pause is there again.
  await page.getByRole('button', { name: 'עזרה' }).click()
  await expect(page.getByRole('button', { name: 'עוצרים להיום' })).toBeVisible()
  // The start email went out once only.
  expect((await sentTemplates(request, orderNo)).filter((t) => t === 'game_started')).toHaveLength(1)
  await friendCtx.close()
})

test('lost link: the same answer for any address, the links emailed to a buyer', async ({
  page,
  request,
}) => {
  const email = `lost-${run}@example.com`
  const { orderNo } = await paidOrder(request, email)

  await page.goto('/')
  const entry = page.getByRole('link', { name: 'איבדתי את הקישור' })
  await expect(entry).toHaveClass(/sketch/)
  await entry.click()
  await expect(page.getByRole('heading', { name: /איבדתם/ })).toBeVisible()
  await noBareLinks(page)
  await page.getByRole('button', { name: 'שלחו לי את הקישורים' }).click()
  await expect(page.getByText('זה לא נראה כמו כתובת מייל.')).toBeVisible()
  await page.getByLabel('המייל שאיתו הזמנתם').fill(email.toUpperCase())
  await page.getByRole('button', { name: 'שלחו לי את הקישורים' }).click()
  await expect(page.getByRole('heading', { name: 'בדקו את המייל' })).toBeVisible()
  const known = await page.getByRole('status').textContent()
  await page.screenshot({
    path: 'docs/screens/site/lost-link-sent.png',
    fullPage: true,
    animations: 'disabled',
  })

  // An address with no orders gets exactly the same page.
  await page.getByRole('button', { name: 'לשלוח לכתובת אחרת' }).click()
  await page.getByLabel('המייל שאיתו הזמנתם').fill(`nobody-${run}@example.com`)
  await page.getByRole('button', { name: 'שלחו לי את הקישורים' }).click()
  await expect(page.getByRole('heading', { name: 'בדקו את המייל' })).toBeVisible()
  expect(await page.getByRole('status').textContent()).toBe(known)
  await noBareLinks(page)

  await expect.poll(async () => sentTemplates(request, orderNo), SYNC).toContain('links_reminder')
})
