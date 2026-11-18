// Every player-facing string. Hebrew, RTL.
//
// A value is either one string or variants by the honoree's form (she / he / couple / company)
// with a `default`. The group is addressed in the plural; when the honoree is "she" the default
// copy uses the feminine plural (as in the mockup: "יוצאות לדרך!"), otherwise the masculine plural.
//
// The owner overrides any text without a deploy through the `player_texts` setting:
// `{ "start.button": "..." }` for every form, or `{ "start.button.he": "..." }` for one form.
// Placeholders in braces ({name}, {n}, ...) are filled at render time.
import type { Form } from '../../server/domain/types.ts'

type Variants = { default: string } & Partial<Record<Form, string>>
type Entry = string | Variants

export const COPY = {
  brand: '[שם המותג]',
  loading: 'פותחים את המפה',
  offline: 'אין חיבור כרגע, ננסה שוב לבד',
  retry: 'לנסות שוב',

  'start.ribbon': 'המירוץ של {name}',
  'start.summary': '{stops} חידות, {stops} טעימות',
  'start.summaryAllergens': '{stops} חידות, {stops} טעימות, בלי {allergens}',
  'start.together': { default: 'כולם משחקים יחד, מכל טלפון', she: 'כולן משחקות יחד, מכל טלפון' },
  'start.button': { default: 'יוצאים לדרך!', she: 'יוצאות לדרך!' },
  'start.logoAlt': 'הלוגו של {company}',
  'start.mapAlt': 'מפה מאוירת של השוק',

  'riddle.ordinals': 'ראשונה,שנייה,שלישית,רביעית,חמישית,שישית,שביעית,שמינית,תשיעית,עשירית',
  'riddle.title': 'חידה {ordinal}',
  'riddle.titleNumber': 'חידה {n}',
  'riddle.titleLast': 'חידה אחרונה',
  'riddle.stopOf': 'תחנה {n} מתוך {total}',
  'riddle.answerLabel': { default: 'התשובה שלכם', she: 'התשובה שלכן' },
  'riddle.submit': { default: 'בודקים!', she: 'בודקות!' },
  'riddle.checking': 'רגע...',
  'riddle.hintButton': 'רמז',
  'riddle.hintPrefix': 'רמז:',
  'riddle.wrong': 'כמעט! נסו שוב',
  'riddle.empty': 'קודם כותבים תשובה',
  'riddle.photoAlt': 'תמונה מצוירת',

  'reveal.correct': 'נכון!',
  'reveal.answerWas': 'התשובה הייתה {answer}',
  'reveal.next': 'התחנה הבאה',
  'reveal.nextLast': 'התחנה האחרונה',
  'reveal.closed': '{original} סגור היום, אז ממשיכים לדוכן אחר:',
  'reveal.tellThem': { default: 'תגידו שאתם מהמירוץ של {name}', she: 'תגידו שאתן מהמירוץ של {name}' },
  'reveal.mapAlt': 'המפה, עם הדוכן מסומן',
  'reveal.stampAlt': 'הלוגו של {company}',
  'reveal.button': 'הגענו, למימוש',

  'redeem.stopOf': 'תחנה {n} מתוך {total}',
  'redeem.title': 'הראו את המסך בדוכן',
  'redeem.codeLabel': 'הקוד של היום',
  'redeem.portions': '{n} מנות {tasting}',
  'redeem.portionsOne': 'מנה אחת {tasting}',
  'redeem.for': 'בשביל המירוץ של {name}',
  'redeem.allergens': 'אלרגיה ל{allergens}. תזכירו גם בעל פה.',
  'redeem.button': 'קיבלנו! לחידה הבאה',
  'redeem.buttonLast': 'קיבלנו! למכתב',

  'letter.kicker': 'סוף המסלול',
  'letter.title': 'לחיים, {name}!',
  'letter.summaryRiddles': '{n} חידות',
  'letter.summaryTastings': '{n} טעימות',
  'letter.summaryEnd': 'ושוק אחד שלם',
  'letter.route': 'איפה היינו',
  'letter.photoAlt': 'תמונה מצוירת',
  'photo.open': 'להגדיל את התמונה',
  'photo.dialog': 'התמונה בגדול',
  'photo.close': 'סגירה',
  'letter.logoAlt': 'הלוגו של {company}',
  'letter.keep': 'צלמו מסך ושמרו את המכתב',

  'expired.title': 'נגמר הזמן',
  'expired.body': 'התוקף של המשחק הזה הסתיים. אם זו טעות, כתבו לנו ונסדר.',
  'notFound.title': 'לא מצאנו את המשחק',
  'notFound.body': 'בדקו שהקישור מלא, בדיוק כמו שקיבלתם אותו.',
  'notReady.title': 'המשחק עוד בהכנה',
  'notReady.body': 'אנחנו מסיימים לכתוב את החידות. נסו שוב בעוד קצת.',
} satisfies Record<string, Entry>

export type CopyKey = keyof typeof COPY
export type Vars = Record<string, string | number>
export type T = (key: CopyKey, vars?: Vars) => string

export function fill(text: string, vars: Vars = {}): string {
  return text.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m))
}

/** Picks the text for a key: owner override for the form, owner override, default for the form, default. */
export function pick(key: CopyKey, form: string, overrides: Record<string, string> = {}): string {
  const own = overrides[`${key}.${form}`] ?? overrides[key]
  if (typeof own === 'string' && own.trim() !== '') return own
  const entry: Entry = COPY[key]
  if (typeof entry === 'string') return entry
  return (entry as Variants)[form as Form] ?? entry.default
}

export function makeT(form: string, overrides: Record<string, string> = {}): T {
  return (key, vars) => fill(pick(key, form, overrides), vars)
}

/** "בוטנים", "בוטנים וגלוטן", "בוטנים, גלוטן וחלב". */
export function joinList(items: string[]): string {
  if (items.length <= 1) return items.join('')
  return `${items.slice(0, -1).join(', ')} ו${items[items.length - 1]}`
}

/** "חידה ראשונה" / "חידה 11" / "חידה אחרונה". */
export function riddleTitle(t: T, index: number, finale: boolean): string {
  if (finale) return t('riddle.titleLast')
  const ordinals = t('riddle.ordinals')
    .split(',')
    .map((s) => s.trim())
  const ordinal = ordinals[index]
  return ordinal ? t('riddle.title', { ordinal }) : t('riddle.titleNumber', { n: index + 1 })
}
