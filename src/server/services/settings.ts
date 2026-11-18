// Business settings live in the `settings` table. Defaults here only fill keys the owner never set.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { settings } from '../db/schema.ts'
import { DEFAULT_ODD_RULES, type OddRules } from '../domain/oddcheck.ts'

export interface SettingsShape {
  odd_rules: OddRules
  // Price per occasion key, in agorot: { base, perPerson }. Open decision: owner sets them.
  prices: Record<string, { base: number; perPerson: number }>
  min_people: number
  max_people: number
  valid_years: number
  hint_after_seconds: number
  poll_seconds: number
  brand_name: string
  // Customer-facing messages. {{var}} placeholders: name, honoree, orderNo, gameLink, manageLink, answersLink, amount.
  message_templates: Record<MessageKey, { subject: string; text: string }>
  // Messaging customers' numbers over WhatsApp can get the number banned; off until the owner decides.
  whatsapp_to_customers: boolean
  // Player-facing text overrides, { copyKey: text }. Keys are those of src/web/player/copy.ts;
  // a key may end in .she/.he/.couple/.company to override one form only.
  player_texts: Record<string, string>
  // The help button in the game: an Israeli mobile ("050-1234567") players reach on WhatsApp.
  // Empty hides the WhatsApp link.
  support_whatsapp: string
  // Optional prefilled WhatsApp text; {name} = honoree, {n} = current stop. Empty uses the default copy.
  support_message: string
}

export type MessageKey = 'paid_answers_needed' | 'game_ready' | 'company_payment_link'

export const SETTING_DEFAULTS: SettingsShape = {
  odd_rules: DEFAULT_ODD_RULES,
  prices: {},
  min_people: 2,
  max_people: 20,
  valid_years: 1,
  hint_after_seconds: 0,
  poll_seconds: 4,
  brand_name: '[שם המותג]',
  message_templates: {
    paid_answers_needed: {
      subject: 'קיבלנו את ההזמנה {{orderNo}}',
      text: 'היי {{name}},\nהתשלום התקבל. נשאר רק לענות על השאלות על {{honoree}} כדי שנכין את המשחק:\n{{answersLink}}\n\nאפשר לשנות תשובות, תמונות וצבע עד שמתחילים לשחק, באותו קישור.\n\n{{brand}}',
    },
    game_ready: {
      subject: 'המשחק של {{honoree}} מוכן',
      text: 'היי {{name}},\nהמשחק מוכן. ביום המשחק פותחים את הקישור (או סורקים את הקוד) בטלפון, ואפשר לפתוח אותו בכמה טלפונים יחד:\n{{gameLink}}\n\nאיך משחקים: פותרים חידה, התשובה מגלה את הדוכן הבא, מראים את המסך בדוכן ומקבלים טעימה. בתוקף עד {{validUntil}}.\n\nאפשר לשנות תשובות, תמונות וצבע עד שמתחילים לשחק: {{manageLink}}\n\n{{brand}}',
    },
    company_payment_link: {
      subject: 'הצעת מחיר {{orderNo}}',
      text: 'שלום {{name}},\nמצורף קישור לתשלום על סך {{amount}} ₪:\n{{payLink}}\n\n{{brand}}',
    },
  },
  whatsapp_to_customers: false,
  player_texts: {},
  support_whatsapp: '',
  support_message: '',
}

export async function getSetting<K extends keyof SettingsShape>(db: DB, key: K): Promise<SettingsShape[K]> {
  const [row] = await db.select().from(settings).where(eq(settings.key, key))
  return (row?.value as SettingsShape[K] | undefined) ?? SETTING_DEFAULTS[key]
}

export async function setSetting<K extends keyof SettingsShape>(db: DB, key: K, value: SettingsShape[K]) {
  await db
    .insert(settings)
    .values({ key, value })
    .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: new Date() } })
}
