// Personal mini-games on a phone: a stop, the mini-game after stop 2 (wrong, then right, with the
// letter piece as the reward), and the next stop. Then the captain skips the second one.
import { type APIRequestContext, expect, type Page, test } from '@playwright/test'
import { captainToken } from '../../src/server/lib/tokens.ts'

const ANSWERS = ['תקווה', "ג'חנון", 'בוריק', 'פלאפל', 'לחיים']
const TITLES: Record<string, string> = {
  who_said: 'מי אמר את זה?',
  true_false: 'נכון או לא נכון',
  photo: 'מה בתמונה?',
  cipher: 'צופן אישי',
}

type Mini = {
  afterStop: number
  type: string
  options?: string[]
  statements?: unknown[]
  solution: { option?: number; truths?: boolean[]; text?: string }
}

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
      answers: {
        first_love: 'יואב מהשכבה',
        catchphrase: 'אני רק שואלת',
        favorite_food: 'שקשוקה',
        favorite_place: 'הכנרת',
        one_word: 'עקשנית',
        dream: 'לגור בפריז',
      },
      letterNotes: [{ text: 'נחכה לך עוד חמישים שנה.', signature: 'נועה' }],
    },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  const minis: Mini[] = body.order.game.minigames
  expect(minis.map((m) => m.afterStop)).toEqual([2, 4])
  const r = await request.post(`/api/manage/${body.order.manageToken}/start`, { data: { players: 4 } })
  expect(r.ok()).toBe(true)
  return { url: body.links.game as string, manageToken: body.order.manageToken as string, minis }
}

async function playStop(p: Page, i: number, last = false) {
  await p.getByLabel('התשובה שלכן').fill(ANSWERS[i])
  await p.getByRole('button', { name: 'בודקות!' }).click()
  await p.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await p.getByRole('button', { name: last ? 'קיבלנו! למכתב' : 'קיבלנו! לחידה הבאה' }).click()
}

/** One wrong try, then the right answer, through the screen. */
async function solve(p: Page, m: Mini) {
  if (m.type === 'who_said' || m.type === 'photo') {
    const wrong = m.options!.find((_, i) => i !== m.solution.option)!
    await p.getByRole('button', { name: wrong }).click()
    await expect(p.getByText('כמעט! נסו שוב')).toBeVisible()
    await expect(p.getByRole('button', { name: wrong })).toBeDisabled()
    await p.getByRole('button', { name: m.options![m.solution.option!] }).click()
  } else if (m.type === 'true_false') {
    const truths = m.solution.truths!
    const rows = p.locator('.tf-item')
    await p.getByRole('button', { name: 'בודקות!' }).click()
    await expect(p.getByText('קודם מסמנים נכון או לא נכון ליד כל משפט')).toBeVisible()
    for (let i = 0; i < truths.length; i++)
      await rows
        .nth(i)
        .getByRole('button', { name: truths[i] ? 'לא נכון' : 'נכון', exact: true })
        .click()
    await p.getByRole('button', { name: 'בודקות!' }).click()
    await expect(p.getByText('משהו פה עוד לא נכון. נסו שוב')).toBeVisible()
    for (let i = 0; i < truths.length; i++)
      await rows
        .nth(i)
        .getByRole('button', { name: truths[i] ? 'נכון' : 'לא נכון', exact: true })
        .click()
    await p.getByRole('button', { name: 'בודקות!' }).click()
  } else {
    await p.getByLabel('הפתרון שלכן').fill('סתם')
    await p.getByRole('button', { name: 'בודקות!' }).click()
    await expect(p.getByText('כמעט! נסו שוב')).toBeVisible()
    await p.getByLabel('הפתרון שלכן').fill(m.solution.text!)
    await p.getByRole('button', { name: 'בודקות!' }).click()
  }
}

test('a stop, a personal mini-game and the next stop', async ({ page, request }) => {
  test.setTimeout(120_000)
  const { url, minis } = await newGame(request)
  await page.goto(url)
  await expect(page.getByRole('heading', { name: 'חידה ראשונה', exact: true })).toBeVisible()
  await expect(page.getByText('שלב 1 מתוך 7')).toBeVisible()
  // The riddle reads in lines, with the personal memory in it.
  await expect(page.locator('.riddle-text')).toContainText('ומאז יואב מהשכבה, מיכל יודעת: עליה לא מוותרים.')
  await playStop(page, 0)
  await playStop(page, 1)

  const m = minis[0]
  await expect(page.getByRole('heading', { name: TITLES[m.type] })).toBeVisible()
  await expect(page.getByText('שלב 3 מתוך 7')).toBeVisible()
  await expect(page.getByText('רק מי שמכיר את מיכל באמת יפתור')).toBeVisible()
  // Not the captain's phone: no skip.
  await expect(page.getByRole('button', { name: 'דילוג על המשחק' })).toHaveCount(0)
  await solve(page, m)

  await expect(page.getByRole('heading', { name: 'פתרתן!' })).toBeVisible()
  await expect(page.getByText('קטע מהמכתב')).toBeVisible()
  await expect(page.getByText('"נחכה לך עוד חמישים שנה."')).toBeVisible()
  await page.getByRole('button', { name: 'ממשיכים לחידה הבאה' }).click()

  await expect(page.getByRole('heading', { name: 'חידה שלישית', exact: true })).toBeVisible()
  await expect(page.getByText('שלב 4 מתוך 7')).toBeVisible()
  await page.getByLabel('התשובה שלכן').fill(ANSWERS[2])
  await page.getByRole('button', { name: 'בודקות!' }).click()
  await expect(page.getByRole('heading', { name: 'נכון!' })).toBeVisible()
})

test('the captain skips a mini-game', async ({ page, request }) => {
  test.setTimeout(120_000)
  const { url, manageToken, minis } = await newGame(request)
  // The captain's phone: the manage page hands the captain token over in the hash.
  await page.goto(`${url}#c=${captainToken(manageToken)}`)
  for (let i = 0; i < 4; i++) {
    if (i === 2) {
      await expect(page.getByRole('heading', { name: TITLES[minis[0].type] })).toBeVisible()
      await page.getByRole('button', { name: 'דילוג על המשחק' }).click()
      await page.getByRole('button', { name: 'כן, מדלגים' }).click()
    }
    await expect(page.locator('.note-kicker').first()).toBeVisible()
    await playStop(page, i)
  }
  await expect(page.getByRole('heading', { name: TITLES[minis[1].type] })).toBeVisible()
  await expect(page.getByText('שלב 6 מתוך 7')).toBeVisible()
  await page.getByRole('button', { name: 'דילוג על המשחק' }).click()
  await page.getByRole('button', { name: 'לא, משחקות' }).click()
  await page.getByRole('button', { name: 'דילוג על המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מדלגים' }).click()
  await expect(page.getByRole('heading', { name: 'חידה אחרונה', exact: true })).toBeVisible()
})
