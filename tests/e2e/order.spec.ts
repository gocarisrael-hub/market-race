// The order as a guided build: one short stage per screen, the game built on the map as the
// buyer goes, back and next on every stage.
import { expect, type Page, test } from '@playwright/test'
import { noBareLinks } from '../helpers/links.ts'
import {
  backButton,
  buildToPhotos,
  mainButton,
  next,
  photosToPay,
  progress,
  tokenOf,
} from '../helpers/order.ts'

// Server runs with E2E_SEED=1: demo catalog, 99 ₪ per person for private occasions, Tranzila off.
test.use({ viewport: { width: 390, height: 844 } })

const SHOTS = 'docs/screens/site'
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, animations: 'disabled' })

test('buyer builds a game stage by stage, up to the pay step', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('/order')
  const bar = progress(page)
  const map = page.getByTestId('build-map')
  await expect(page.getByRole('heading', { name: 'איזה משחק בונים?' })).toBeVisible()
  // The top nav: the current page is circled, never underlined, like the other items.
  const current = page.locator('.site-nav [aria-current="page"]')
  await expect(current).toHaveText('להזמנה')
  await expect(current.locator('.ring')).toHaveCount(1)
  await expect(current.locator('.underline')).toHaveCount(0)
  expect(await current.evaluate((e) => getComputedStyle(e).textDecorationLine)).toBe('none')
  // A first order has no "lost the link" entry.
  await expect(page.getByRole('link', { name: 'איבדתי את הקישור' })).toHaveCount(0)
  await expect(bar).toHaveAttribute('aria-valuenow', '1')
  // A pencil sketch until the colour is picked; no ribbon before the name is asked.
  await expect(map).not.toHaveAttribute('data-painted', /.*/)
  await expect(page.getByTestId('build-ribbon')).toHaveCount(0)
  // Nothing picked yet: the button says what is missing.
  await mainButton(page).click()
  await expect(page.getByText('בחרו איזה משחק')).toBeVisible()
  await page.getByRole('radio', { name: 'רווקות' }).click()
  await shot(page, 'build-01-occasion')

  // A bachelorette is for her only: no "who is it for" stage. How many come is asked next, so the
  // price is clear from the start.
  await next(page, /\/order\/people$/)
  await expect(bar).toHaveAttribute('aria-valuenow', '2')
  await expect(bar).toHaveAttribute('aria-valuetext', /שלב 2 מתוך 13, כמה אתם/)
  await expect(page.getByText('יופי. כמה באים לשוק?')).toBeVisible()
  await expect(page.getByTestId('price')).toContainText('396 ₪')
  await page.getByRole('button', { name: 'עוד משתתף' }).click()
  await expect(page.getByTestId('price')).toContainText('495 ₪')
  await shot(page, 'build-02-people')

  // No she/he switch for a bachelorette.
  await next(page, /\/order\/name$/)
  await expect(bar).toHaveAttribute('aria-valuenow', '3')
  await expect(bar).toHaveAttribute('aria-valuetext', /שלב 3 מתוך 13, השם/)
  await expect(page.getByRole('radio', { name: 'עליה' })).toHaveCount(0)
  // Each stop passed (the occasion, how many) shows a tasting on the map.
  await expect(map.locator('.bm-stop.done .bm-food')).toHaveCount(2)
  const ribbon = page.getByTestId('build-ribbon')
  await expect(ribbon).toHaveText('המירוץ של ...')
  await mainButton(page).click()
  await expect(page.getByText('כתבו איך קוראים לה')).toBeVisible()
  await page.getByLabel(/איך קוראים לה/).fill('מיכל')
  // The name goes up on the ribbon as it is typed.
  await expect(ribbon).toHaveText('המירוץ של מיכל')
  await expect(page.getByText('4/40')).toBeVisible()
  await shot(page, 'build-02-name')

  await next(page, /\/order\/look$/)
  await expect(map).toHaveAttribute('data-painted', 'true')
  await page.getByRole('button', { name: 'כרמל כחול־ורוד' }).click()
  await expect(page.getByRole('button', { name: 'כרמל כחול־ורוד' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'כרמל בצבעי מים' }).click()
  await shot(page, 'build-03-look')

  // The questions, a few per screen.
  await next(page, /\/order\/questions$/)
  await expect(page.getByText('חלק 1 מתוך 3')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'ספרו לנו עליה' })).toBeVisible()
  await page.getByLabel('מי הייתה האהבה הראשונה שלה?').fill('יואב מהשכבה')
  await page.getByLabel('מה האוכל האהוב עליה?').fill('סושי')
  // One line says what the answers are for; each question shows a short example.
  await expect(page.getByText('התשובות נכנסות לחידות ולמכתב. מילה או שתיים מספיקות.')).toBeVisible()
  await expect(page.getByLabel('מה האוכל האהוב עליה?')).toHaveAttribute('placeholder', 'למשל: סושי')
  await expect(page.getByLabel('משפט שהיא תמיד אומרת')).toHaveCount(0)
  await shot(page, 'build-04-questions')
  await next(page, /\/order\/questions\/2$/)
  await page.getByLabel('משפט שהיא תמיד אומרת').fill('יאללה')
  // A refresh keeps the stage and the answers (the draft is saved on every change).
  await page.reload()
  await expect(page.getByLabel('משפט שהיא תמיד אומרת')).toHaveValue('יאללה')
  // The last part: the optional question about the first photo (for the photo mini-game).
  await next(page, /\/order\/questions\/3$/)
  await expect(page.getByLabel(/איפה צולמה התמונה הראשונה/)).toBeVisible()
  await expect(mainButton(page)).toHaveText('ממשיכים לתמונות')
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await mainButton(page).click()
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'bachelorette',
    honoreeName: 'מיכל',
    // Chosen on the second stage: the order is created with it.
    people: 5,
    answers: { first_love: 'יואב מהשכבה', favorite_food: 'סושי', catchphrase: 'יאללה' },
  })

  // The order exists: the photos, taped on the map as they arrive.
  const token = await tokenOf(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלה' })).toBeVisible()
  await expect(page.getByText('יופי, עכשיו התמונות…')).toBeVisible()
  await expect(mainButton(page)).toHaveText('בינתיים בלי, ממשיכים')
  await expect(page.getByText('0 מתוך 5')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(['assets/icons/fruit.png', 'assets/icons/hummus.png'])
  await expect(page.getByAltText('אותה תמונה, במסגרת מצוירת')).toHaveCount(2)
  await expect(page.getByText('2 מתוך 5')).toBeVisible()
  await expect(map.locator('.bm-photo img')).toHaveCount(2)
  await shot(page, 'build-05-photos')
  await page.getByRole('button', { name: 'הסרה' }).first().click()
  await expect(page.getByText('1 מתוך 5')).toBeVisible()
  await expect(map.locator('.bm-photo img')).toHaveCount(1)
  await page.reload()
  await expect(page.getByAltText('אותה תמונה, במסגרת מצוירת')).toHaveCount(1)

  // Back and forth keeps the same order and updates it.
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/questions\/3$/)
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/questions\/2$/)
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/questions$/)
  await page.getByLabel('מה האוכל האהוב עליה?').fill('פיצה')
  await next(page, /\/order\/questions\/2$/)
  await next(page, /\/order\/questions\/3$/)
  const updated = page.waitForResponse((r) => r.request().method() === 'PUT')
  await mainButton(page).click()
  expect((await updated).request().postDataJSON().answers.favorite_food).toBe('פיצה')
  expect(await tokenOf(page)).toBe(token)

  // The letter's notes; leaving a stage that changed the order saves it.
  await next(page, /\/order\/notes$/)
  await expect(mainButton(page)).toHaveText('בינתיים בלי, ממשיכים')
  await page.getByLabel('המשפט').fill('מזל טוב, אהובה')
  await page.getByLabel('חתימה').fill('נועה')
  await expect(mainButton(page)).toHaveText('ממשיכים')
  await shot(page, 'build-06-notes')
  const notes = page.waitForResponse((r) => r.request().method() === 'PUT')
  await next(page, /\/order\/hints$/)
  expect((await notes).request().postDataJSON().letterNotes).toEqual([
    { text: 'מזל טוב, אהובה', signature: 'נועה' },
  ])
  // Optional hint questions: an incomplete one is caught.
  await page.getByRole('button', { name: '+ להוסיף שאלה' }).click()
  await expect(
    page.getByText('שאלה שרק מי שמכיר אותה יודע לענות עליה. מי שעונה נכון מקבל רמז.'),
  ).toBeVisible()
  await page.getByRole('textbox', { name: 'שאלה 1', exact: true }).fill('איך קוראים לכלב שלה?')
  await expect(page.getByRole('textbox', { name: 'תשובה 1', exact: true })).toHaveAttribute(
    'placeholder',
    'למשל: בונבון',
  )
  await mainButton(page).click()
  await expect(page.getByText('לכל שאלה לרמז צריך גם תשובה')).toBeVisible()
  await page.getByRole('textbox', { name: 'תשובה 1', exact: true }).fill('בוני')

  await next(page, /\/order\/diet$/)
  await page.getByRole('checkbox', { name: 'בוטנים' }).click()
  await page.getByRole('checkbox', { name: 'טבעוני' }).click()
  await expect(page.getByTestId('tastings')).toBeVisible()
  const diet = page.waitForResponse((r) => r.request().method() === 'PUT')
  await next(page, new RegExp(`/order/${token}/details$`))
  expect((await diet).request().postDataJSON()).toMatchObject({
    people: 5,
    allergens: ['בוטנים'],
    diets: ['vegan'],
  })

  await expect(page.getByRole('heading', { name: 'לאן לשלוח את המשחק?' })).toBeVisible()
  await mainButton(page).click()
  await expect(page.getByText('כתבו את השם שלכם')).toBeVisible()
  await page.getByLabel('השם שלכם').fill('נועה')
  await page.getByLabel('טלפון').fill('050-1234567')
  await page.getByLabel('אימייל').fill('noa@example')
  await mainButton(page).click()
  await expect(page.getByText('כתובת האימייל לא נראית תקינה')).toBeVisible()
  await page.getByLabel('אימייל').fill('noa@example.com')
  await shot(page, 'build-08-details')

  // The summary: the game is ready to be built.
  await next(page, new RegExp(`/order/${token}/pay$`))
  await expect(page.getByRole('heading', { name: 'המשחק שלכם מוכן לבנייה' })).toBeVisible()
  await expect(bar).toHaveAttribute('aria-valuenow', '13')
  await expect(page.getByTestId('total')).toContainText('495 ₪')
  await expect(page.getByText('בוטנים, טבעוני')).toBeVisible()
  await expect(page.getByText('תמונה אחת')).toBeVisible()
  // The summary, like every stage before it (checked in next()), has no underlined links.
  await noBareLinks(page)
  await shot(page, 'build-09-pay')
  // e2e runs with the mock provider; simulate card payment being off to check the message.
  await page.route('**/api/orders/*/pay', (route) =>
    route.fulfill({ status: 400, json: { error: 'card_disabled' } }),
  )
  await page.getByRole('button', { name: 'לתשלום 495 ₪' }).click()
  // Card payment off: a clear message, the order is kept.
  await expect(page.getByText('התשלום באשראי עוד לא פתוח באתר')).toBeVisible()
  await page.unroute('**/api/orders/*/pay')

  // Refresh keeps the stage: the summary comes from the server.
  await page.reload()
  await expect(page.getByTestId('total')).toContainText('495 ₪')

  // A failed payment returned by Tranzila inside the iframe shows a retry message.
  await page.evaluate((t) => {
    const f = document.createElement('iframe')
    f.src = `/pay/done?o=${t}&error=1`
    document.body.appendChild(f)
  }, token)
  await expect(page.getByText('התשלום לא עבר')).toBeVisible()

  // The manage page of this unpaid order, and its payment link without this device's draft.
  await page.goto(`/m/${token}`)
  await expect(page.getByTestId('status')).toHaveText('ממתינה לתשלום.')
  await expect(page.getByRole('link', { name: 'להשלמת התשלום' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'להשלמת התשלום' })).toHaveAttribute(
    'href',
    `/order/${token}/pay`,
  )
  await page.evaluate(() => localStorage.clear())
  await page.goto(`/order/${token}/pay`)
  await expect(page.getByLabel('השם שלכם')).toBeVisible()
  await expect(page.getByTestId('total')).toContainText('495 ₪')
})

test('the who-for stage, back and next, and a stage asked for too early', async ({ page }) => {
  // A later stage without a started draft goes back to the first one.
  await page.goto('/order/people')
  await expect(page).toHaveURL(/\/order$/)
  await page.getByRole('radio', { name: 'יום הולדת', exact: true }).click()
  await next(page, /\/order\/for$/)
  await expect(page.getByRole('heading', { name: 'למי המשחק?' })).toBeVisible()
  await expect(page.getByRole('radiogroup', { name: 'למי המשחק?' }).getByRole('radio')).toHaveText([
    'למישהי',
    'למישהו',
    'לקבוצה',
  ])
  await page.getByRole('radio', { name: 'למישהו' }).click()
  await shot(page, 'build-01b-for')
  // How many come, right after who it is for.
  await next(page, /\/order\/people$/)
  await expect(page.getByRole('heading', { name: 'כמה אתם?' })).toBeVisible()
  await next(page, /\/order\/name$/)
  await expect(page.getByRole('heading', { name: 'איך קוראים לו?' })).toBeVisible()
  // Skipping ahead before the name lands back on the name.
  await page.goto('/order/look')
  await expect(page).toHaveURL(/\/order\/name$/)
  // Back, and the browser's own back, step through the stages; the choices stay.
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/people$/)
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order\/for$/)
  await expect(page.getByRole('radio', { name: 'למישהו' })).toHaveAttribute('aria-checked', 'true')
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order$/)
  await page.goBack()
  await expect(page).toHaveURL(/\/order\/for$/)
  // Back from the first stage goes to the landing page.
  await page.goto('/order')
  await backButton(page).click()
  await expect(page).toHaveURL(/\/$/)
})

test('one participant is enough: the stepper goes down to one, priced per person', async ({ page }) => {
  await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })
  await page.goto('/order/people')
  const less = page.getByRole('button', { name: 'פחות משתתפים' })
  for (let i = 0; i < 3; i++) await less.click()
  await expect(page.locator('.stepper .unit')).toHaveText('משתתף אחד')
  await expect(less).toBeDisabled()
  await expect(page.getByTestId('price')).toContainText('99 ₪')
})

test('the diet stage shows what is tasted on the way and follows the allergens', async ({ page }) => {
  await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })
  await page.goto('/order/diet')
  // The allergy and diet picker is here (and only here, not on the landing or /tastings).
  await expect(page.getByText('מישהו לא אוכל משהו?')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'טבעוני' })).toBeVisible()
  const list = page.getByTestId('tastings')
  await expect(list.getByText('מה טועמים בדרך')).toBeVisible()
  const stops = list.locator('li')
  await expect(stops).toHaveCount(5)
  await expect(stops.nth(1)).toContainText('מאפה תימני מסורתי מהתנור')
  await expect(stops.last()).toContainText('הגמר')
  await expect(stops.last()).toContainText('משהו קר מהחבית לסיום')
  // Never a stall's name.
  await expect(list).not.toContainText('המאפייה התימנית')
  await expect(list).not.toContainText('בירה בסוף השוק')
  await expect(list.getByText('מוחלף בטעימה מתאימה')).toHaveCount(0)

  await page.getByRole('checkbox', { name: 'גלוטן', exact: true }).click()
  await expect(stops.nth(1)).toHaveAttribute('data-status', 'blocked')
  await expect(stops.nth(1)).toContainText('אין כרגע טעימה מתאימה בתחנה הזו; ניצור קשר')
  await expect(stops.nth(3)).toHaveAttribute('data-status', 'swapped')
  await expect(stops.last()).toContainText('משהו קר ומתוק לסיום')
  await expect(stops.last()).not.toContainText('מוחלף')
  await expect(list.getByRole('alert')).toBeVisible()
  await shot(page, 'build-07b-diet')

  // Still orderable; the blocked stop goes to the owner's review after payment.
  await page.getByRole('checkbox', { name: 'גלוטן', exact: true }).click()
  await expect(stops.nth(1)).toHaveAttribute('data-status', 'as_listed')
  await expect(list.getByRole('alert')).toHaveCount(0)
  await next(page, /\/details$/)
})

test("a kid's birthday previews juice at the last stop, never a swap", async ({ page }) => {
  await buildToPhotos(page, { occasion: 'יום הולדת לילד', name: 'נועה', later: true })
  await page.goto('/order/diet')
  const list = page.getByTestId('tastings')
  const stops = list.locator('li')
  await expect(stops).toHaveCount(5)
  await expect(stops.last()).toContainText('מיץ טרי או לימונדה קרה לסיום')
  await expect(list).not.toContainText('משהו קר מהחבית לסיום')
  await expect(list).not.toContainText('מוחלף')
  for (let i = 0; i < 5; i++) await expect(stops.nth(i)).toHaveAttribute('data-status', 'as_listed')
  // An allergy changes nothing for the kids' drink.
  await page.getByRole('checkbox', { name: 'גלוטן', exact: true }).click()
  await expect(stops.nth(1)).toHaveAttribute('data-status', 'blocked')
  await expect(stops.last()).toContainText('מיץ טרי או לימונדה קרה לסיום')
})

test('answers later, then from the manage page', async ({ page }) => {
  const token = await buildToPhotos(page, { occasion: 'רווקות', name: 'דנה', later: true })
  // No notes or hint questions to write now: straight on to allergies.
  await next(page, /\/order\/diet$/)
  await photosToPay(page)
  await expect(page.getByText('השאלות: ימולאו אחרי התשלום')).toBeVisible()

  await page.goto(`/m/${token}#answers`)
  await expect(page.getByRole('heading', { name: 'השאלות' })).toBeVisible()
  await page.getByLabel('מה האוכל האהוב עליה?').fill('שקשוקה')
  await page.getByLabel('מילה אחת שמתארת אותה').fill('אש')
  await page.getByLabel('המשפט').fill('את הכי')
  await page.getByLabel('חתימה').fill('החברות')
  await shot(page, '5-manage-answers')
  await page.getByRole('button', { name: 'שליחת התשובות' }).click()
  await expect(page.getByText('התשובות התקבלו, תודה!')).toBeVisible()
  // Unpaid, so it stays pending payment; the form is gone after a reload.
  await page.reload()
  await expect(page.getByTestId('status')).toHaveText('ממתינה לתשלום.')
  await expect(page.getByRole('heading', { name: 'השאלות' })).toHaveCount(0)
})

test('manage page: a ready game offers the captain’s start; the link, QR and WhatsApp share come after it', async ({
  page,
}) => {
  const login = await page.request.post('/admin/api/login', {
    data: { email: 'owner@example.com', password: 'e2e-password' },
  })
  expect(login.ok()).toBe(true)
  const shop = await (await page.request.get('/api/shop')).json()
  const theme = shop.themes[0]
  const route = shop.routes.find((r: { marketId: number }) => r.marketId === theme.marketId)
  const res = await page.request.post('/admin/api/orders/test', {
    data: {
      occasionKey: 'bachelorette',
      form: 'she',
      honoreeName: 'מיכל',
      themeId: theme.id,
      routeId: route.id,
      people: 4,
      answers: { first_love: 'יואב' },
    },
  })
  expect(res.ok()).toBe(true)
  const { order, links } = await res.json()
  await page.goto(`/m/${order.manageToken}`)
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.')
  await expect(page.getByRole('link', { name: /וואטסאפ/ })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'מתחילים לשחק' })).toBeVisible()
  await shot(page, '6-manage-ready')
  await page.getByRole('button', { name: 'מתחילים את המשחק' }).click()
  await page.getByRole('button', { name: 'כן, מתחילים!' }).click()
  // The captain's way in: the game link plus the captain token (which lets that phone pause).
  await expect(page.getByRole('link', { name: 'ממשיכים למשחק' })).toHaveAttribute(
    'href',
    new RegExp(`^${links.game}#c=[A-Za-z0-9_-]{32}$`),
  )
  await expect(page.getByRole('img', { name: 'קוד QR לקישור המשחק' })).toBeVisible()
  const wa = await page.getByRole('link', { name: 'שולחים בוואטסאפ' }).getAttribute('href')
  expect(wa).toContain('https://wa.me/?text=')
  expect(decodeURIComponent(wa!.split('text=')[1])).toContain(links.game)
  await shot(page, '6b-manage-started')

  // The company payment link of an order that is not payable says so.
  await page.goto(`/pay/${order.manageToken}`)
  await expect(page.getByText('הקישור הזה לא פעיל לתשלום')).toBeVisible()
})

test('company payment link shows the amount and the payment state', async ({ page }) => {
  const token = await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })
  const put = await page.request.put(`/api/orders/${token}`, {
    data: { buyer: { name: 'רון', phone: '052-7654321', email: 'ron@example.com' } },
  })
  expect(put.ok()).toBe(true)
  await page.goto(`/pay/${token}`)
  await expect(page.getByTestId('total')).toContainText('396 ₪')
  await noBareLinks(page)
  await shot(page, '7-pay-link')
  await page.route('**/api/orders/*/pay', (route) =>
    route.fulfill({ status: 400, json: { error: 'card_disabled' } }),
  )
  await page.getByRole('button', { name: 'לתשלום 396 ₪' }).click()
  await expect(page.getByText('התשלום באשראי עוד לא פתוח באתר')).toBeVisible()
  await page.unroute('**/api/orders/*/pay')

  // Opened outside the iframe, /pay/done continues to the manage page and checks the payment.
  await page.goto(`/pay/done?o=${token}`)
  await expect(page).toHaveURL(new RegExp(`/m/${token}\\?paid=1$`))
  await expect(page.getByTestId('status')).toHaveText('בודקים את התשלום...')
})

test('companies leave a lead', async ({ page }) => {
  await page.goto('/companies')
  await noBareLinks(page)
  // No occasion, group size or date: only the phone is required.
  await expect(page.getByRole('radio', { name: 'יום צוות' })).toHaveCount(0)
  await expect(page.getByLabel('כמה משתתפים בערך?')).toHaveCount(0)
  await expect(page.getByLabel('מתי בערך?')).toHaveCount(0)
  await page.getByRole('button', { name: 'שלחו לנו' }).click()
  await expect(page.getByText('מספר הטלפון לא נראה תקין')).toBeVisible()
  await page.getByLabel('טלפון').fill('+972 52-765-4321')
  await shot(page, '8-companies')
  await page.getByRole('button', { name: 'שלחו לנו' }).click()
  await expect(page.getByText('נחזור אליכם בקרוב עם הצעה.')).toBeVisible()
})

test('a mock payment settles the order and the manage page offers the captain’s start', async ({ page }) => {
  const token = await buildToPhotos(page, { occasion: 'רווקות', name: 'מיכל' })
  await photosToPay(page)
  await page.getByRole('button', { name: /^לתשלום/ }).click()

  const sheet = page.frameLocator('iframe')
  await expect(sheet.getByText('תשלום לדוגמה, לא נגבה כסף')).toBeVisible()
  await sheet.getByRole('button', { name: 'לשלם (לדוגמה)' }).click()

  await expect(page).toHaveURL(new RegExp(`/m/${token}`), { timeout: 30_000 })
  await expect(page.getByTestId('status')).toHaveText('המשחק מוכן.', { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'מתחילים לשחק' })).toBeVisible()
})

test('a family game: no who-for or she/he, the name field is the family name, family questions', async ({
  page,
}) => {
  await page.goto('/order')
  await page.getByRole('radio', { name: 'יום משפחתי' }).click()
  // A family game is for a family only: how many come, then the name, no she/he.
  await next(page, /\/order\/people$/)
  await next(page, /\/order\/name$/)
  await expect(page.getByRole('radio', { name: 'עליה' })).toHaveCount(0)
  // The family's name is asked once, with the question set's own wording.
  await expect(page.getByRole('heading', { name: 'איך קוראים למשפחה?' })).toBeVisible()
  await expect(page.getByPlaceholder('למשל: משפחת כהן')).toBeVisible()
  await mainButton(page).click()
  await expect(page.getByText('כתבו את שם הקבוצה או המשפחה')).toBeVisible()
  await page.getByLabel(/איך קוראים למשפחה\?/).fill('משפחת כהן')
  await next(page, /\/order\/look$/)
  await next(page, /\/order\/questions$/)
  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toContainText('עליכם')
  await expect(page.getByLabel(/איך קוראים למשפחה\?/)).toHaveCount(0)
  await expect(page.getByLabel(/מה תמיד יש בארוחת שישי/)).toBeVisible()
  await expect(page.getByLabel(/משפט שאבא או אמא תמיד אומרים/)).toBeVisible()
  await shot(page, 'build-04b-questions-family')
  await next(page, /\/order\/questions\/2$/)
  await page.getByLabel(/מי תמיד מאחר/).fill('דוד שמעון')
  // Hidden questions of the set are never asked.
  await expect(page.getByLabel(/כינוי/)).toHaveCount(0)
  await next(page, /\/order\/questions\/3$/)
  const created = page.waitForResponse(
    (r) => r.url().endsWith('/api/orders') && r.request().method() === 'POST',
  )
  await mainButton(page).click()
  expect((await created).request().postDataJSON()).toMatchObject({
    occasionKey: 'family',
    recipient: 'family',
    form: 'group',
    honoreeName: 'משפחת כהן',
    answers: { group_name: 'משפחת כהן', who_late: 'דוד שמעון' },
  })
  await tokenOf(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלכם' })).toBeVisible()
})

test('stages slide in, and only fade when the system asks for reduced motion', async ({ page }) => {
  await page.goto('/order')
  const anim = () => page.locator('.stage').evaluate((el) => getComputedStyle(el).animationName)
  await page.getByRole('radio', { name: 'רווקות' }).click()
  await next(page, /\/order\/people$/)
  expect(await anim()).toBe('stage-in')
  await backButton(page).click()
  await expect(page).toHaveURL(/\/order$/)
  expect(await anim()).toBe('stage-in-back')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await next(page, /\/order\/people$/)
  expect(await anim()).toBe('stage-fade')
  expect(await page.locator('.bm-stop.now').evaluate((el) => getComputedStyle(el).animationName)).toBe('none')
})
