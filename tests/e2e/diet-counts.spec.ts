// Per-person diets: the diet stage asks how many of the group each allergen or diet is for, and
// the stall's screen lists the regular tasting and the alternative by name ("3 × …, 1 × …").
import { expect, type Page, test } from '@playwright/test'
import { buildToPhotos, next } from '../helpers/order.ts'

test.use({ viewport: { width: 390, height: 844 } })

// Screenshots for review only when asked (never into docs/screens from here).
const shot = async (page: Page, name: string) => {
  if (process.env.DIET_SHOTS)
    await page.screenshot({
      path: `${process.env.DIET_SHOTS}/${name}.png`,
      fullPage: true,
      animations: 'disabled',
    })
}

test('the diet stage asks how many of you, from one up to everyone', async ({ page }) => {
  const token = await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })
  await page.goto('/order/diet')
  const list = page.getByTestId('tastings')
  const stops = list.locator('li')
  await expect(stops).toHaveCount(5)
  // Nothing ticked: no "how many" yet.
  await expect(page.getByTestId('diet-counts')).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'טבעוני' }).click()
  const counts = page.getByTestId('diet-counts')
  await expect(counts.getByText('כמה מכם?')).toBeVisible()
  await expect(counts.getByLabel('טבעוני: 1')).toBeVisible()
  await expect(counts.getByText('מתוך 4')).toBeVisible()
  await expect(page.getByRole('button', { name: 'פחות אנשים: טבעוני' })).toBeDisabled()
  // One vegan of four: every stop still reads as listed, and swaps are never mentioned.
  for (let i = 0; i < 5; i++) await expect(stops.nth(i)).toHaveAttribute('data-status', 'as_listed')
  await expect(page.getByText(/מוחלף|החלפה/)).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'אגוזים' }).click()
  await page.getByRole('button', { name: 'עוד אדם: אגוזים' }).click()
  await expect(counts.getByLabel('אגוזים: 2')).toBeVisible()
  await shot(page, 'diet-stage-390')

  const saved = page.waitForResponse((r) => r.request().method() === 'PUT')
  await next(page, new RegExp(`/order/${token}/details$`))
  expect((await saved).request().postDataJSON()).toMatchObject({
    people: 4,
    allergens: ['אגוזים'],
    diets: ['vegan'],
    restrictionCounts: { vegan: 1, אגוזים: 2 },
  })

  // Untick and tick again: back to one.
  await page.goto('/order/diet')
  await page.getByRole('checkbox', { name: 'אגוזים' }).click()
  await page.getByRole('checkbox', { name: 'אגוזים' }).click()
  await expect(page.getByTestId('diet-counts').getByLabel('אגוזים: 1')).toBeVisible()
})

test('the stall sees the breakdown: the regular tasting and the vegan one by name', async ({
  page,
  request,
}) => {
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
      diets: ['vegan'],
      restrictionCounts: { vegan: 1 },
      answers: { first_love: 'יואב מהשכבה' },
    },
  })
  expect(res.ok()).toBe(true)
  const body = await res.json()
  const url: string = body.links.game
  const token = url.split('/g/')[1]
  expect(
    (await request.post(`/api/manage/${body.order.manageToken}/start`, { data: { players: 4 } })).ok(),
  ).toBe(true)
  // The first stop through the API; the second (the bakery) on the phone.
  for (const data of [
    { type: 'answer', stopIndex: 0, answer: 'תקווה' },
    { type: 'arrived', stopIndex: 0 },
    { type: 'redeemed', stopIndex: 0 },
  ])
    expect((await request.post(`/api/game/${token}/action`, { data })).ok()).toBe(true)
  await page.goto(url)
  await page.getByLabel('התשובה שלכן').fill("ג'חנון")
  await page.getByRole('button', { name: 'בודקות!' }).click()
  await page.getByRole('button', { name: 'הגענו, למימוש' }).click()
  await expect(page.getByRole('heading', { name: 'הראו את המסך בדוכן' })).toBeVisible()
  const portions = page.getByTestId('portions')
  await expect(portions.getByText("3 × ג'חנון עם ביצה ורסק")).toBeVisible()
  await expect(portions.getByText('1 × לחוח עם רסק וסחוג')).toBeVisible()
  await shot(page, 'redeem-mixed-390')
})
