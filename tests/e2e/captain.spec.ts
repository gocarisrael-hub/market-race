// The buyer is the captain: the game link waits until the buyer starts the game from the manage
// page with the players who arrived, shares the players' link, and goes into the game. Hints can
// sit behind a personal question the buyer added on the edit page.
import { type APIRequestContext, devices, expect, type Page, test } from '@playwright/test'

const SYNC = { timeout: 15_000 }

async function paidOrder(request: APIRequestContext, people = 5) {
  const shop = await (await request.get('/api/shop')).json()
  const created = await request.post('/api/orders', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: shop.themes[0].id,
      people,
      answers: { first_love: 'יואב מהשכבה' },
      buyer: { name: 'נועה', phone: '050-1234567', email: 'noa@example.com' },
    },
  })
  expect(created.ok()).toBe(true)
  const { manageToken } = await created.json()
  const pay = await (await request.post(`/api/orders/${manageToken}/pay`)).json()
  const s = new URL(pay.url).searchParams.get('s')
  expect((await request.post('/api/payment/mock/complete', { data: { token: s } })).ok()).toBe(true)
  const m = await (await request.get(`/api/manage/${manageToken}`)).json()
  expect(m.status).toBe('ready')
  return { manageToken, gameUrl: m.gameLink as string }
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

const riddle1 = (p: Page) => p.getByRole('heading', { name: 'חידה ראשונה', exact: true })

test('the captain starts with the players who came, shares the link, and everyone joins', async ({
  page,
  browser,
  request,
}) => {
  test.setTimeout(120_000)
  const { manageToken, gameUrl } = await paidOrder(request, 5)

  // A player who opens the game link early only sees a waiting screen.
  const friendCtx = await browser.newContext({ ...devices['Pixel 7'], locale: 'he-IL' })
  const friend = await friendCtx.newPage()
  await friend.goto(gameUrl)
  await expect(friend.getByRole('heading', { name: 'המירוץ של מיכל' })).toBeVisible()
  await expect(friend.getByRole('heading', { name: 'המשחק עוד לא התחיל' })).toBeVisible()
  await expect(friend.getByText('מי שהזמין את המשחק מתחיל אותו בשוק')).toBeVisible()
  await expect(friend.getByRole('button', { name: /לדרך/ })).toHaveCount(0)
  await expect(friend.getByLabel(/התשובה שלכן/)).toHaveCount(0)
  await expect(friend.locator('.trail')).toHaveCount(0)

  // The manage page: no game link to pass around yet, no WhatsApp share before the start.
  await page.goto(`/m/${manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.')
  await expect(page.getByRole('link', { name: /וואטסאפ/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'לפתוח את המשחק' })).toHaveCount(0)

  // 5 bought, 3 came.
  await expect(page.getByRole('heading', { name: 'מתחילים לשחק' })).toBeVisible()
  await expect(page.getByTestId('players')).toHaveText('5')
  await expect(page.getByRole('button', { name: 'עוד משתתף' })).toBeDisabled()
  await page.getByRole('button', { name: 'פחות משתתפים' }).click()
  await page.getByRole('button', { name: 'פחות משתתפים' }).click()
  await expect(page.getByTestId('players')).toHaveText('3')
  await expect(page.getByText('3 משתתפים מתוך 5')).toBeVisible()
  await noBareLinks(page)

  // A clear confirm first; "not yet" goes back without starting.
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await expect(page.getByRole('heading', { name: 'בטוחים?' })).toBeVisible()
  await expect(page.getByText('הולכים לתחנה הראשונה עם 3 משתתפים')).toBeVisible()
  await noBareLinks(page)
  await page.screenshot({
    path: 'docs/screens/site/6a-manage-confirm.png',
    fullPage: true,
    animations: 'disabled',
  })
  await page.getByRole('button', { name: 'עוד לא' }).click()
  await expect(friend.getByRole('heading', { name: 'המשחק עוד לא התחיל' })).toBeVisible()
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מתחילים!' }).click()

  // The share step: a brush-stroke WhatsApp button with the owner's invite and the players' link.
  await expect(page.getByRole('heading', { name: 'המשחק התחיל!' })).toBeVisible()
  await expect(page.getByText('משחקים עם 3 משתתפים.')).toBeVisible()
  const share = page.getByRole('link', { name: 'שולחים בוואטסאפ' })
  await expect(share).toHaveClass(/brush/)
  const href = (await share.getAttribute('href'))!
  expect(href.startsWith('https://wa.me/?text=')).toBe(true)
  const text = decodeURIComponent(href.split('text=')[1])
  expect(text).toContain('המירוץ של מיכל בשוק התחיל!')
  expect(text).toContain(gameUrl)
  await noBareLinks(page)
  // Started: the edit is locked.
  await expect(page.getByRole('button', { name: 'ערוך' })).toHaveCount(0)

  // The waiting player joins the live game by itself; the captain continues straight in.
  await expect(riddle1(friend)).toBeVisible(SYNC)
  await page.getByRole('link', { name: 'ממשיכים למשחק' }).click()
  await expect(riddle1(page)).toBeVisible()

  // Every stall serves the 3 who came.
  await page.getByLabel('התשובה שלכן').fill('תקווה')
  await page.getByRole('button', { name: 'בודקות!' }).click()
  await page.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await expect(page.getByText('3 מנות מיץ תפוזים טרי')).toBeVisible()
  await expect(friend.getByText('3 מנות מיץ תפוזים טרי')).toBeVisible(SYNC)
  await friendCtx.close()
})

test('a hint behind a personal question: wrong keeps it hidden, right opens it', async ({
  page,
  request,
}) => {
  const { manageToken, gameUrl } = await paidOrder(request, 4)

  // The buyer adds a personal question on the edit page.
  await page.goto(`/m/${manageToken}`)
  await page.getByRole('button', { name: 'ערוך' }).click()
  await expect(page.getByRole('heading', { name: 'שאלות אישיות לרמזים' })).toBeVisible()
  await expect(page.getByText('נשאל אותן במהלך המשחק כדי לפתוח רמזים')).toBeVisible()
  await page.getByRole('button', { name: '+ להוסיף שאלה' }).click()
  await page.locator('input[name="hintQuestion0"]').fill('איך קוראים לכלב שלה?')
  // Half a pair is not saved.
  await page.getByRole('button', { name: 'שמירת השינויים' }).click()
  await expect(page.getByText('לכל שאלה לרמז צריך גם תשובה')).toBeVisible()
  await page.locator('input[name="hintAnswer0"]').fill('שוקו')
  await page.getByRole('button', { name: 'שמירת השינויים' }).click()
  await expect(page.getByText('השינויים נשמרו.')).toBeVisible()

  // Start (4 players), into the game.
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מתחילים!' }).click()
  await page.goto(gameUrl)
  await expect(riddle1(page)).toBeVisible()

  // The hint asks the question first. Wrong: try again or skip; the hint stays hidden.
  await page.getByRole('button', { name: 'רמז', exact: true }).click()
  await expect(page.getByText('איך קוראים לכלב שלה?')).toBeVisible()
  const box = page.locator('.hintq input')
  await box.fill('במבה')
  await page.getByRole('button', { name: 'פותחים את הרמז' }).click()
  await expect(page.getByText('לא בדיוק. נסו שוב או דלגו')).toBeVisible()
  await noBareLinks(page)
  await page.screenshot({ path: 'docs/screens/look/player-hint-question.png', animations: 'disabled' })
  await expect(page.getByText('רמז: זה גם שם של המנון')).toHaveCount(0)
  await page.getByRole('button', { name: 'דילוג, בלי רמז' }).click()
  await expect(page.getByText('איך קוראים לכלב שלה?')).toHaveCount(0)
  await expect(page.getByText('רמז: זה גם שם של המנון')).toHaveCount(0)

  // Again, right this time (one letter off is fine): the hint opens.
  await page.getByRole('button', { name: 'רמז', exact: true }).click()
  await box.fill('שוקוו')
  await page.getByRole('button', { name: 'פותחים את הרמז' }).click()
  await expect(page.getByText('רמז: זה גם שם של המנון')).toBeVisible()
  await expect(page.getByRole('button', { name: 'רמז', exact: true })).toHaveCount(0)
})
