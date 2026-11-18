import { expect, type Page, test } from '@playwright/test'

// Server runs with E2E_SEED=1: demo catalog, 99 ₪ per person for private occasions, Tranzila off.
test.use({ viewport: { width: 390, height: 844 } })

const SHOTS = 'docs/screens/site'
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true, animations: 'disabled' })

async function stepOne(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: /מירוץ טעימות/ })).toBeVisible()
  await page.getByRole('radio', { name: 'רווקות' }).click()
  // Bachelorette allows one form only: picked for the buyer.
  await expect(page.getByRole('radio', { name: 'עליה' })).toHaveAttribute('aria-checked', 'true')
  await expect(page.getByTestId('price')).toContainText('396 ₪')
}

async function toToken(page: Page) {
  await page.waitForURL(/\/order\/[A-Za-z0-9_-]+\/photos$/)
  return page.url().split('/order/')[1].split('/')[0]
}

test('buyer orders a game up to the pay step', async ({ page }) => {
  await page.goto('/')
  // Nothing picked yet: the button says what is missing.
  await page.getByRole('button', { name: /ממשיכים לשאלות/ }).click()
  await expect(page.getByText('בחרו לכבוד מה חוגגים')).toBeVisible()

  await stepOne(page)
  await page.getByRole('button', { name: 'עוד משתתף' }).click()
  await expect(page.getByTestId('price')).toContainText('495 ₪')
  await page.getByRole('checkbox', { name: 'בוטנים' }).click()
  await page.getByRole('checkbox', { name: 'טבעוני' }).click()
  await page.getByRole('button', { name: 'כרמל כחול-ורוד' }).click()
  await expect(page.getByRole('button', { name: 'כרמל כחול-ורוד' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'כרמל בצבעי מים' }).click()
  await shot(page, '1-home')
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()

  await expect(page).toHaveURL(/\/order\/questions$/)
  await expect(page.getByRole('heading', { name: /ספרו לנו/ })).toBeVisible()
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  await expect(page.getByText('כתבו איך קוראים לה')).toBeVisible()
  await page.getByLabel(/איך קוראים לה/).fill('מיכל')
  await page.getByLabel('מי הייתה האהבה הראשונה שלה?').fill('יואב מהשכבה')
  await page.getByLabel('מה האוכל האהוב עליה?').fill('סושי')
  await expect(page.getByText('11/40')).toBeVisible()
  await page.getByLabel('המשפט').fill('מזל טוב, אהובה')
  await page.getByLabel('חתימה').fill('נועה')
  await shot(page, '2-questions')
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()

  const token = await toToken(page)
  await expect(page.getByRole('heading', { name: 'ועכשיו, תמונות שלה' })).toBeVisible()
  await expect(page.getByText('0 מתוך 5')).toBeVisible()
  await page.locator('input[type=file]').setInputFiles(['assets/icons/fruit.png', 'assets/icons/hummus.png'])
  await expect(page.getByAltText('אותה תמונה, מצוירת')).toHaveCount(2)
  await expect(page.getByText('2 מתוך 5')).toBeVisible()
  await shot(page, '3-photos')
  await page.getByRole('button', { name: 'הסרה' }).first().click()
  await expect(page.getByText('1 מתוך 5')).toBeVisible()
  await page.reload()
  await expect(page.getByAltText('אותה תמונה, מצוירת')).toHaveCount(1)

  // Back and forth keeps the same order and updates it.
  await page.getByRole('link', { name: '→ חזרה' }).click()
  await expect(page.getByLabel(/איך קוראים לה/)).toHaveValue('מיכל')
  await page.getByLabel('מה האוכל האהוב עליה?').fill('פיצה')
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  expect(await toToken(page)).toBe(token)

  await page.getByRole('link', { name: 'לתשלום' }).click()
  await expect(page).toHaveURL(new RegExp(`/order/${token}/pay$`))
  await expect(page.getByTestId('total')).toContainText('495 ₪')
  await expect(page.getByText('בוטנים, טבעוני')).toBeVisible()

  await page.getByRole('button', { name: 'לתשלום 495 ₪' }).click()
  await expect(page.getByText('כתבו את השם שלכם')).toBeVisible()
  await page.getByLabel('השם שלכם').fill('נועה')
  await page.getByLabel('טלפון').fill('050-1234567')
  await page.getByLabel('אימייל').fill('noa@example')
  await page.getByRole('button', { name: 'לתשלום 495 ₪' }).click()
  await expect(page.getByText('כתובת האימייל לא נראית תקינה')).toBeVisible()
  await page.getByLabel('אימייל').fill('noa@example.com')
  await shot(page, '4-checkout')
  await page.getByRole('button', { name: 'לתשלום 495 ₪' }).click()
  // Tranzila is not configured in e2e: a clear message, the order is kept.
  await expect(page.getByText('התשלום באשראי עוד לא פתוח באתר')).toBeVisible()
  await shot(page, '4-checkout-card-disabled')

  // Refresh keeps the step: the summary comes from the server, the buyer from the draft.
  await page.reload()
  await expect(page.getByTestId('total')).toContainText('495 ₪')
  await expect(page.getByLabel('אימייל')).toHaveValue('noa@example.com')

  // A failed payment returned by Tranzila inside the iframe shows a retry message.
  await page.evaluate((t) => {
    const f = document.createElement('iframe')
    f.src = `/pay/done?o=${t}&error=1`
    document.body.appendChild(f)
  }, token)
  await expect(page.getByText('התשלום לא עבר')).toBeVisible()

  // The manage page of this unpaid order.
  await page.goto(`/m/${token}`)
  await expect(page.getByTestId('status')).toHaveText('ממתינה לתשלום.')
  await expect(page.getByRole('link', { name: 'להשלמת התשלום' })).toBeVisible()
})

test('answers later, then from the manage page', async ({ page }) => {
  await stepOne(page)
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()
  await page.getByLabel(/איך קוראים לה/).fill('דנה')
  await page.getByRole('checkbox', { name: 'אמלא את השאלות אחר כך' }).click()
  await expect(page.getByLabel('מה האוכל האהוב עליה?')).toHaveCount(0)
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  const token = await toToken(page)
  await page.getByRole('link', { name: 'לתשלום' }).click()
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

test('manage page shows a ready game with its link, QR and WhatsApp share', async ({ page }) => {
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
  await expect(page.getByRole('link', { name: 'לפתוח את המשחק' })).toHaveAttribute('href', links.game)
  await expect(page.getByRole('img', { name: 'קוד QR לקישור המשחק' })).toBeVisible()
  const wa = await page.getByRole('link', { name: 'לשלוח בוואטסאפ' }).getAttribute('href')
  expect(wa).toContain('https://wa.me/?text=')
  expect(decodeURIComponent(wa!.split('text=')[1])).toContain(links.game)
  await shot(page, '6-manage-ready')

  // The company payment link of an order that is not payable says so.
  await page.goto(`/pay/${order.manageToken}`)
  await expect(page.getByText('הקישור הזה לא פעיל לתשלום')).toBeVisible()
})

test('company payment link shows the amount and the payment state', async ({ page }) => {
  await stepOne(page)
  await page.getByRole('button', { name: 'ממשיכים לשאלות עליה' }).click()
  await page.getByLabel(/איך קוראים לה/).fill('מיכל')
  await page.getByRole('button', { name: 'ממשיכים לתמונות' }).click()
  const token = await toToken(page)
  const put = await page.request.put(`/api/orders/${token}`, {
    data: { buyer: { name: 'רון', phone: '052-7654321', email: 'ron@example.com' } },
  })
  expect(put.ok()).toBe(true)
  await page.goto(`/pay/${token}`)
  await expect(page.getByTestId('total')).toContainText('396 ₪')
  await shot(page, '7-pay-link')
  await page.getByRole('button', { name: 'לתשלום 396 ₪' }).click()
  await expect(page.getByText('התשלום באשראי עוד לא פתוח באתר')).toBeVisible()

  // Opened outside the iframe, /pay/done continues to the manage page and checks the payment.
  await page.goto(`/pay/done?o=${token}`)
  await expect(page).toHaveURL(new RegExp(`/m/${token}\\?paid=1$`))
  await expect(page.getByTestId('status')).toHaveText('בודקים את התשלום...')
})

test('companies leave a lead', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('link', { name: 'לחברות וצוותים' }).click()
  await expect(page).toHaveURL(/\/companies$/)
  await page.getByRole('button', { name: 'שלחו לנו' }).click()
  await expect(page.getByText('כתבו את שם החברה')).toBeVisible()
  await page.getByRole('radio', { name: 'יום צוות' }).click()
  await page.getByLabel('שם החברה').fill('אקמה')
  await page.getByLabel('שם איש או אשת הקשר').fill('רון')
  await page.getByLabel('טלפון').fill('052-7654321')
  await page.getByLabel('אימייל').fill('ron@acme.co.il')
  await page.getByLabel('כמה משתתפים בערך?').fill('30')
  await page.getByLabel('מתי בערך?').fill('אמצע דצמבר')
  await shot(page, '8-companies')
  await page.getByRole('button', { name: 'שלחו לנו' }).click()
  await expect(page.getByText('נחזור אליכם בקרוב עם הצעה.')).toBeVisible()
})
