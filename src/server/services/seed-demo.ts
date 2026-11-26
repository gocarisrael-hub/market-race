// Demo catalog for local dev, e2e and staging. Everything here is editable data in the admin;
// the owner replaces it with the real stalls, riddles and prices. Never runs in production.
import { eq, inArray } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import {
  markets,
  occasions,
  palettes,
  questionSets,
  riddles,
  routes,
  settings,
  stalls,
  tastings,
  themes,
} from '../db/schema.ts'
import { DEFAULT_MINIGAMES } from '../domain/minigames.ts'
import { formsOfRecipients, occasionRecipients } from '../domain/recipient.ts'
import type {
  Decor,
  Form,
  OccasionRecipients,
  Palette,
  Question,
  RecipientLabels,
  RiddleTemplates,
} from '../domain/types.ts'
import { randomToken } from '../lib/tokens.ts'
import { markDemoSeeded } from './demo-refresh.ts'
import { DEMO_THEMES, type DemoTheme, WATERCOLOR_THEMES } from './seed-themes.ts'
import { setSetting } from './settings.ts'

const hours = {
  '0': { open: '08:00', close: '19:00' },
  '1': { open: '08:00', close: '19:00' },
  '2': { open: '08:00', close: '19:00' },
  '3': { open: '08:00', close: '19:00' },
  '4': { open: '08:00', close: '19:00' },
  '5': { open: '08:00', close: '15:00' },
}

const ALL_DIETS = ['vegan', 'vegetarian', 'gluten_free']

// Optional, for the "מה בתמונה?" mini-game: asked about the first photo the buyer adds.
const PHOTO_WHERE = 'איפה צולמה התמונה הראשונה שתעלו?'
const PHOTO_EXAMPLE = 'בטיול באילת'

// Every question is one short, direct question with a short example (shown as "למשל: …").
type PerForm = Partial<Record<Form, string>>
const q = (
  slot: string,
  text: PerForm,
  example: PerForm | string,
  fallback: PerForm | string,
  maxLen = 40,
): Question => ({ slot, text, example, required: false, fallback, maxLen })

const privateQuestions: Question[] = [
  q(
    'first_love',
    { she: 'מי הייתה האהבה הראשונה שלה?', he: 'מי הייתה האהבה הראשונה שלו?', couple: 'איפה הם הכירו?' },
    { she: 'יואב מהשכבה', he: 'מיכל מהשכבה', couple: 'במסיבה של נועה' },
    'הפעם הראשונה',
  ),
  q(
    'favorite_food',
    { she: 'מה האוכל האהוב עליה?', he: 'מה האוכל האהוב עליו?', couple: 'מה האוכל האהוב עליהם?' },
    'סושי',
    'ארוחת שישי',
  ),
  q(
    'one_word',
    { she: 'מילה אחת שמתארת אותה', he: 'מילה אחת שמתארת אותו', couple: 'מילה אחת שמתארת אותם' },
    { she: 'עקשנית', he: 'עקשן', couple: 'מתוקים' },
    { she: 'רכה', he: 'רך', couple: 'רכים' },
    20,
  ),
  q(
    'catchphrase',
    { she: 'משפט שהיא תמיד אומרת', he: 'משפט שהוא תמיד אומר', couple: 'משפט שהם תמיד אומרים' },
    'יאללה, זזים',
    'יאללה, זזים',
    60,
  ),
  q(
    'favorite_place',
    { she: 'המקום האהוב עליה', he: 'המקום האהוב עליו', couple: 'המקום האהוב עליהם' },
    'הכנרת',
    'הים',
  ),
  q(
    'dream',
    { she: 'חלום שעוד לא הגשימה', he: 'חלום שעוד לא הגשים', couple: 'חלום משותף שלהם' },
    'לטוס ליפן',
    'כל החלומות',
    60,
  ),
  q('photo_where', { she: PHOTO_WHERE, he: PHOTO_WHERE, couple: PHOTO_WHERE }, PHOTO_EXAMPLE, ''),
]

// ---------- Question sets per occasion × recipient ----------
// Every set fills the same riddle slots (first_love, favorite_food, one_word, catchphrase,
// favorite_place, dream), so one template per form reads well whatever the occasion. Each set
// asks them in its own words: a birthday about her or him, a love game about the partner from
// the giver's side, a couple about the two of them.

const pq = (
  form: 'she' | 'he' | 'couple',
  slot: string,
  text: string,
  example: string,
  fallback: string,
  maxLen = 40,
): Question => q(slot, { [form]: text }, example, fallback, maxLen)

export const birthdaySheQuestions: Question[] = [
  pq('she', 'first_love', 'מי הייתה האהבה הראשונה שלה?', 'הספייס גירלז', 'האהבה הראשונה'),
  pq('she', 'favorite_food', 'מה האוכל האהוב עליה?', 'סושי', 'עוגת יום הולדת'),
  pq('she', 'one_word', 'מילה אחת שמתארת אותה', 'מצחיקה', 'רכה', 20),
  pq('she', 'catchphrase', 'משפט שהיא תמיד אומרת', 'יהיה בסדר', 'יאללה, זזים', 60),
  pq('she', 'favorite_place', 'המקום שהכי עושה לה טוב', 'הים', 'הים'),
  pq('she', 'dream', 'חלום שאתם מאחלים לה', 'לטוס ליפן', 'כל החלומות', 60),
  pq('she', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

export const birthdayHeQuestions: Question[] = [
  pq('he', 'first_love', 'מי הייתה האהבה הראשונה שלו?', 'נועה מהכיתה', 'האהבה הראשונה'),
  pq('he', 'favorite_food', 'מה האוכל האהוב עליו?', 'שווארמה', 'עוגת יום הולדת'),
  pq('he', 'one_word', 'מילה אחת שמתארת אותו', 'מצחיק', 'רך', 20),
  pq('he', 'catchphrase', 'משפט שהוא תמיד אומר', 'יהיה בסדר', 'יאללה, זזים', 60),
  pq('he', 'favorite_place', 'המקום שהכי עושה לו טוב', 'הים', 'הים'),
  pq('he', 'dream', 'חלום שאתם מאחלים לו', 'לטוס ליפן', 'כל החלומות', 60),
  pq('he', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

// A love game is a gift to her or to him, written from the giver's side.
export const loveSheQuestions: Question[] = [
  pq('she', 'first_love', 'איפה הכול התחיל ביניכם?', 'הדייט הראשון ביפו', 'הפעם הראשונה שנפגשנו'),
  pq('she', 'favorite_food', 'מה היא תמיד מזמינה?', 'פסטה', 'פסטה'),
  pq('she', 'one_word', 'מילה אחת שמתארת אותה', 'רכה', 'רכה', 20),
  pq('she', 'catchphrase', 'משפט שהיא אומרת רק לך', 'אני אוהבת אותך', 'אני אוהבת אותך', 60),
  pq('she', 'favorite_place', 'המקום שלכם', 'החוף בגורדון', 'הים'),
  pq('she', 'dream', 'חלום שלכם ביחד', 'לטייל ביפן', 'כל מה שעוד מחכה לנו', 60),
  pq('she', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

export const loveHeQuestions: Question[] = [
  pq('he', 'first_love', 'איפה הכול התחיל ביניכם?', 'הדייט הראשון ביפו', 'הפעם הראשונה שנפגשנו'),
  pq('he', 'favorite_food', 'מה הוא תמיד מזמין?', 'המבורגר', 'המבורגר'),
  pq('he', 'one_word', 'מילה אחת שמתארת אותו', 'רך', 'רך', 20),
  pq('he', 'catchphrase', 'משפט שהוא אומר רק לך', 'אני אוהב אותך', 'אני אוהב אותך', 60),
  pq('he', 'favorite_place', 'המקום שלכם', 'החוף בגורדון', 'הים'),
  pq('he', 'dream', 'חלום שלכם ביחד', 'לטייל ביפן', 'כל מה שעוד מחכה לנו', 60),
  pq('he', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

// A couple: questions about the two of them.
export const coupleQuestions: Question[] = [
  pq('couple', 'first_love', 'איפה הם הכירו?', 'במסיבה של נועה', 'הפעם הראשונה שנפגשו'),
  pq('couple', 'favorite_food', 'המנה שהם תמיד חולקים', 'פיצה', 'פיצה משותפת'),
  pq('couple', 'one_word', 'מילה אחת שמתארת אותם', 'מתוקים', 'מתוקים', 20),
  pq('couple', 'catchphrase', 'משפט ששניהם תמיד אומרים', 'יאללה, זזים', 'יאללה, זזים', 60),
  pq('couple', 'favorite_place', 'המקום האהוב עליהם', 'הכנרת', 'הים'),
  pq('couple', 'dream', 'חלום משותף שלהם', 'בית עם גינה', 'כל מה שעוד מחכה להם', 60),
  pq('couple', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

// A kid's birthday: a parent fills it in about the child. The riddles' slots in a child's words:
// the favourite food, the most fun place, one word for them, what they want to be (the dream),
// a funny word they say (for "מי אמר את זה?"). "first_love" is never asked of a child: hidden,
// with "since the day she was born". The favourite game feeds the true/false game.
const kidHidden = (form: 'she' | 'he', slot: string, fallback: string): Question => ({
  slot,
  text: {},
  required: false,
  fallback: { [form]: fallback },
  maxLen: 40,
  hidden: true,
})

export const kidSheQuestions: Question[] = [
  pq('she', 'favorite_food', 'מה האוכל האהוב עליה?', 'פיצה', 'פיצה'),
  pq('she', 'favorite_game', 'המשחק או הסדרה האהובים עליה', 'בלואי', 'מחבואים'),
  pq('she', 'dream', 'מה היא רוצה להיות כשתגדל?', 'וטרינרית', 'כל מה שתרצה', 60),
  pq('she', 'catchphrase', 'משפט מצחיק שהיא אומרת', 'אני כבר גדולה!', 'עוד פעם!', 60),
  pq('she', 'best_friend', 'מי החבר או החברה הכי טובים שלה?', 'מאיה מהגן', 'החברים מהגן'),
  pq('she', 'one_word', 'מילה אחת שמתארת אותה', 'שובבה', 'מתוקה', 20),
  pq('she', 'favorite_place', 'המקום הכי כיף בשבילה', 'אצל סבתא', 'גן השעשועים'),
  pq('she', 'sweet_moment', 'משהו מתוק שהיא עשתה השנה', 'הכינה לנו ארוחת בוקר', 'כל החיבוקים', 80),
  pq('she', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
  kidHidden('she', 'first_love', 'היום שנולדה'),
]

export const kidHeQuestions: Question[] = [
  pq('he', 'favorite_food', 'מה האוכל האהוב עליו?', 'פיצה', 'פיצה'),
  pq('he', 'favorite_game', 'המשחק או הסדרה האהובים עליו', 'לגו', 'מחבואים'),
  pq('he', 'dream', 'מה הוא רוצה להיות כשיגדל?', 'טייס', 'כל מה שירצה', 60),
  pq('he', 'catchphrase', 'משפט מצחיק שהוא אומר', 'אני כבר גדול!', 'עוד פעם!', 60),
  pq('he', 'best_friend', 'מי החבר או החברה הכי טובים שלו?', 'יונתן מהגן', 'החברים מהגן'),
  pq('he', 'one_word', 'מילה אחת שמתארת אותו', 'שובב', 'מתוק', 20),
  pq('he', 'favorite_place', 'המקום הכי כיף בשבילו', 'אצל סבתא', 'גן השעשועים'),
  pq('he', 'sweet_moment', 'משהו מתוק שהוא עשה השנה', 'הכין לנו ארוחת בוקר', 'כל החיבוקים', 80),
  pq('he', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
  kidHidden('he', 'first_love', 'היום שנולד'),
]

// A wedding anniversary, from the giver's side: to her or to him from the spouse, or to the
// couple from someone close (their kids, friends). "first_love" is where they met, and the
// first apartment is the place the riddles take them to.
export const anniversarySheQuestions: Question[] = [
  pq('she', 'first_love', 'איפה נפגשתם?', 'בחתונה של רוני', 'הפעם הראשונה שנפגשנו'),
  pq('she', 'wedding_song', 'השיר של החתונה', 'פרח בגני', 'השיר שלנו'),
  pq('she', 'favorite_place', 'איפה הייתה הדירה הראשונה שלכם?', 'פלורנטין', 'הדירה הראשונה'),
  pq('she', 'favorite_food', 'המנה שלכם', 'פסטה רוזה', 'פסטה'),
  pq('she', 'wedding_moment', 'רגע מצחיק מהחתונה', 'הדוד שרקד על השולחן', 'הריקוד ההוא', 80),
  pq('she', 'one_word', 'מילה אחת שמתארת אותה', 'רכה', 'רכה', 20),
  pq('she', 'catchphrase', 'משפט שהיא אומרת רק לך', 'אני אוהבת אותך', 'אני אוהבת אותך', 60),
  pq('she', 'dream', 'משאלה לשנים הבאות', 'עוד טיול לאיטליה', 'עוד הרבה שנים ביחד', 60),
  pq('she', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

export const anniversaryHeQuestions: Question[] = [
  pq('he', 'first_love', 'איפה נפגשתם?', 'בחתונה של רוני', 'הפעם הראשונה שנפגשנו'),
  pq('he', 'wedding_song', 'השיר של החתונה', 'פרח בגני', 'השיר שלנו'),
  pq('he', 'favorite_place', 'איפה הייתה הדירה הראשונה שלכם?', 'פלורנטין', 'הדירה הראשונה'),
  pq('he', 'favorite_food', 'המנה שלכם', 'פסטה רוזה', 'פסטה'),
  pq('he', 'wedding_moment', 'רגע מצחיק מהחתונה', 'הדוד שרקד על השולחן', 'הריקוד ההוא', 80),
  pq('he', 'one_word', 'מילה אחת שמתארת אותו', 'רך', 'רך', 20),
  pq('he', 'catchphrase', 'משפט שהוא אומר רק לך', 'אני אוהב אותך', 'אני אוהב אותך', 60),
  pq('he', 'dream', 'משאלה לשנים הבאות', 'עוד טיול לאיטליה', 'עוד הרבה שנים ביחד', 60),
  pq('he', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

export const anniversaryCoupleQuestions: Question[] = [
  pq('couple', 'first_love', 'איפה הם נפגשו?', 'בחתונה של רוני', 'הפעם הראשונה שנפגשו'),
  pq('couple', 'wedding_song', 'השיר של החתונה שלהם', 'פרח בגני', 'השיר שלהם'),
  pq('couple', 'favorite_place', 'איפה הייתה הדירה הראשונה שלהם?', 'פלורנטין', 'הדירה הראשונה'),
  pq('couple', 'favorite_food', 'המנה שלהם', 'פסטה רוזה', 'פסטה'),
  pq('couple', 'wedding_moment', 'רגע מצחיק מהחתונה שלהם', 'הדוד שרקד על השולחן', 'הריקוד ההוא', 80),
  pq('couple', 'one_word', 'מילה אחת שמתארת אותם', 'מתוקים', 'מתוקים', 20),
  pq('couple', 'catchphrase', 'משפט ששניהם תמיד אומרים', 'יאללה, זזים', 'יאללה, זזים', 60),
  pq('couple', 'dream', 'משאלה להם לשנים הבאות', 'עוד טיול לאיטליה', 'עוד הרבה שנים ביחד', 60),
  pq('couple', 'photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

/** The demo question sets per recipient, by name (each editable in the admin). */
export const RECIPIENT_SETS = {
  birthdayShe: { name: 'יום הולדת: לה', questions: birthdaySheQuestions },
  birthdayHe: { name: 'יום הולדת: לו', questions: birthdayHeQuestions },
  loveShe: { name: 'אהבה: לה, מצד מי שנותן', questions: loveSheQuestions },
  loveHe: { name: 'אהבה: לו, מצד מי שנותן', questions: loveHeQuestions },
  couple: { name: 'זוג: על שניהם', questions: coupleQuestions },
  kidShe: { name: 'יום הולדת לילדה', questions: kidSheQuestions },
  kidHe: { name: 'יום הולדת לילד', questions: kidHeQuestions },
  anniversaryShe: { name: 'יום נישואים: לה, מצד מי שנותן', questions: anniversarySheQuestions },
  anniversaryHe: { name: 'יום נישואים: לו, מצד מי שנותן', questions: anniversaryHeQuestions },
  anniversaryCouple: { name: 'יום נישואים: על שניהם', questions: anniversaryCoupleQuestions },
} as const

const cq = (slot: string, text: string, example: string, fallback: string, maxLen = 40) =>
  q(slot, { company: text }, example, fallback, maxLen)
const companyQuestions: Question[] = [
  { ...cq('company_name', 'שם החברה', 'אקמה', ''), required: true },
  cq('company_catchphrase', 'משפט שכולם אומרים במשרד', 'יש לך דקה?', 'יאללה, זזים', 60),
  cq('memorable_project', 'פרויקט שכולם זוכרים', 'ההשקה של 2023', 'הפרויקט ההוא'),
  cq('kitchen_favorite', 'מה נגמר ראשון במטבחון?', 'הבמבה', 'הקפה'),
  cq('last_offsite', 'איפה היה האוף-סייט האחרון?', 'מצפה רמון', 'הים'),
  cq('photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
]

const WATERCOLOR = WATERCOLOR_THEMES

/**
 * Demo palettes: the theme keys each one is offered on. Every one passes paletteIssues. Only the
 * watercolor maps take color variants; every other style is locked to its own palette.
 */
export const DEMO_PALETTES: { name: string; themes: string[]; palette: Palette }[] = [
  {
    name: 'אדום קלאסי',
    themes: WATERCOLOR,
    palette: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
  },
  {
    name: 'כחול ים',
    themes: WATERCOLOR,
    palette: {
      background: '#DCE6EA',
      accent: '#1F5E8C',
      ink: '#14262F',
      paper: '#FAFCFC',
      mapTint: '#2F6E9E',
    },
  },
  {
    name: 'ירוק זית',
    themes: WATERCOLOR,
    palette: {
      background: '#E4E2CC',
      accent: '#5B6B1E',
      ink: '#262A18',
      paper: '#FDFCF4',
      mapTint: '#6B7A2A',
    },
  },
  {
    name: 'כתום שקיעה',
    themes: WATERCOLOR,
    palette: {
      background: '#F2DDC6',
      accent: '#C2501A',
      ink: '#2E2018',
      paper: '#FFF9F2',
      mapTint: '#D0621F',
    },
  },
  {
    name: 'ורוד פטל',
    themes: WATERCOLOR,
    palette: {
      background: '#F1DDE2',
      accent: '#A3245A',
      ink: '#2E1A22',
      paper: '#FFF8FA',
      mapTint: '#B23A6E',
    },
  },
]

/** Inserts the demo styles (DEMO_THEMES) in their order; the Carmel ones get the Carmel pins. */
export async function insertDemoThemes(
  db: DB,
  market: { carmel: number; mahane: number },
  carmelPins: Record<string, { x: number; y: number }>,
) {
  return db
    .insert(themes)
    .values(DEMO_THEMES.map((t, i) => demoThemeValues(t, i, market, carmelPins)))
    .returning()
}

/** A demo style's row values (without the id). */
export function demoThemeValues(
  t: DemoTheme,
  index: number,
  market: { carmel: number; mahane: number },
  carmelPins: Record<string, { x: number; y: number }>,
) {
  return {
    key: t.key,
    name: t.name,
    marketId: market[t.market],
    mapFile: t.mapFile,
    palette: { ...t.palette },
    style: structuredClone(t.style),
    occasionKeys: [...t.occasionKeys],
    recipients: [...t.recipients],
    pins: t.market === 'carmel' ? carmelPins : {},
    sort: index + 1,
  }
}

/**
 * The demo occasions, in the order the site shows them. `set` is the key (in demoQuestionSets) of
 * the occasion's own question set; who each one is for comes from demoRecipients. Seeded, and kept
 * in step on seeded databases by the demo refresh, by `key`.
 */
export interface DemoOccasion {
  key: string
  label: string
  audience: 'private' | 'company'
  decor: Decor
  set: string
  active: boolean
  /** The occasion's own names for its recipients on the order (empty: the site's default). */
  recipientLabels: RecipientLabels
  /** A game for kids: adults-only tastings (alcohol) are swapped. */
  forKids?: boolean
}

const occ = (
  key: string,
  label: string,
  decor: Decor,
  set: string,
  extra: Partial<DemoOccasion> = {},
): DemoOccasion => ({
  key,
  label,
  audience: 'private',
  decor,
  set,
  active: true,
  recipientLabels: {},
  ...extra,
})

export const DEMO_OCCASIONS: DemoOccasion[] = [
  occ('bachelorette', 'רווקות', 'love', 'private'),
  occ('couple', 'דייט רומנטי', 'love', 'private'),
  occ('anniversary', 'יום נישואים', 'anniversary', 'anniversaryCouple'),
  occ('birthday_friend', 'יום הולדת', 'birthday', 'private'),
  occ('birthday_kid', 'יום הולדת לילד', 'kids', 'kidShe', {
    recipientLabels: { she: 'לילדה', he: 'לילד' },
    forKids: true,
  }),
  // Folded into "יום הולדת", which offers everything it did. Kept (inactive) for its orders.
  occ('birthday_parent', 'יום הולדת להורה', 'birthday', 'private', { active: false }),
  occ('family', 'יום משפחתי', 'family', 'family'),
  occ('friends', "חבר'ה", 'friends', 'friends'),
  occ('generic', 'כללי', 'generic', 'generic'),
  occ('team_day', 'יום צוות', 'company', 'company', { audience: 'company' }),
  occ('retirement', 'פרישה', 'company', 'company', { audience: 'company' }),
  occ('new_employee', 'עובד/ת חדש/ה', 'company', 'company', { audience: 'company' }),
]

/** Library icons per demo occasion, drawn with its doodles (holidays, fun, animals: tasteful, few). */
export const DEMO_OCCASION_ICONS: Record<string, string[]> = {
  bachelorette: ['game/crown', 'drinks/cocktail', 'nature/rose', 'reactions/sparkles'],
  couple: ['game/heart', 'nature/rose', 'drinks/white-wine', 'nature/moon'],
  anniversary: ['nature/bouquet', 'holidays/kiddush-cup', 'fun/vinyl', 'reactions/fireworks'],
  birthday_friend: ['game/balloon', 'game/gift', 'game/party-popper', 'sweets/cupcake'],
  birthday_kid: ['animals/hedgehog', 'snacks/cotton-candy', 'game/balloon', 'game/kite'],
  birthday_parent: ['game/gift', 'sweets/chocolate-cake', 'nature/bouquet', 'game/party-popper'],
  family: ['pantry/challah', 'animals/dog', 'fun/backgammon', 'nature/sun'],
  friends: ['drinks/beer', 'reactions/high-five', 'fun/darbuka', 'nature/matkot'],
  generic: ['market/wicker-basket', 'game/map-pin', 'market/fruit-crate', 'nature/sun'],
  team_day: ['game/trophy', 'game/rocket', 'reactions/high-five', 'game/target'],
  retirement: ['travel/suitcase', 'nature/beach-umbrella', 'travel/sun-hat', 'travel/hot-air-balloon'],
  new_employee: ['reactions/waving-hand', 'game/key', 'game/rocket', 'nature/sunflower'],
}

/**
 * Icon per demo tasting, by name: what is served, from the icon library. The seed writes them and
 * the demo refresh puts them on tastings that still have an older demo icon (or none).
 */
export const DEMO_TASTING_ICONS: Record<string, string> = {
  'מיץ תפוזים טרי': 'drinks/orange-juice',
  'מיץ גזר תפוזים': 'drinks/carrot-juice',
  "ג'חנון עם ביצה ורסק": 'food/jachnun',
  'בוריק תפוחי אדמה וביצה': 'food/brik',
  'חצי פיתה פלאפל': 'food/falafel-cone',
  'כדורי פלאפל בצלחת': 'falafel',
  'שיפוד קבב בפיתה': 'food/skewers',
  'בירה מהחבית': 'drinks/beer',
  'סיידר תפוחים': 'produce/apples',
  'קפה הפוך': 'drinks/cappuccino',
  מיץ: 'drinks/lemonade',
  לימונדה: 'drinks/lemonade',
  'לימונדה קרה': 'drinks/lemonade',
  'לימונענע גרוס': 'drinks/limonana-slush',
  'מיץ תפוזים': 'drinks/orange-juice',
  'בורקס גבינה': 'food/burekas',
}

/** Doodle set per demo occasion key. */
export const DEMO_DECOR: Record<string, Decor> = Object.fromEntries(
  DEMO_OCCASIONS.map((o) => [o.key, o.decor]),
)

/** A demo occasion's row values (without the id), given every demo question set's id by key. */
export function demoOccasionValues(o: DemoOccasion, index: number, setIds: Record<string, number>) {
  const base = {
    key: o.key,
    label: o.label,
    audience: o.audience,
    decor: o.decor,
    icons: [...(DEMO_OCCASION_ICONS[o.key] ?? [])],
    questionSetId: setIds[o.set] ?? null,
    sort: index + 1,
    active: o.active,
    recipientLabels: { ...o.recipientLabels },
    forKids: o.forKids ?? false,
  }
  if (o.audience === 'company')
    return { ...base, recipients: {}, forms: ['company'] as Form[], playersFeminine: false }
  const recipients = demoRecipients(setIds as SetIds)[o.key] ?? {}
  return {
    ...base,
    recipients,
    forms: formsOfRecipients(recipients),
    playersFeminine: o.key === 'bachelorette',
  }
}

/**
 * Adds the demo palettes that are missing (by name) and links them to the themes they list (by key).
 * Idempotent: used by the seed and to top up a database seeded before palettes existed.
 */
export async function ensureDemoPalettes(db: DB): Promise<number> {
  const have = new Set((await db.select({ name: palettes.name }).from(palettes)).map((p) => p.name))
  const allThemes = await db.select({ id: themes.id, key: themes.key }).from(themes)
  let added = 0
  for (const [i, p] of DEMO_PALETTES.entries()) {
    if (have.has(p.name)) continue
    const themeIds = allThemes.filter((t) => t.key && p.themes.includes(t.key)).map((t) => t.id)
    if (!themeIds.length) continue
    await db.insert(palettes).values({ name: p.name, palette: p.palette, themeIds, sort: i + 1 })
    added++
  }
  return added
}

/** Sets the demo doodle sets on the demo occasions that still have the generic one. */
export async function ensureOccasionDecor(db: DB): Promise<number> {
  const rows = await db
    .select()
    .from(occasions)
    .where(inArray(occasions.key, Object.keys(DEMO_DECOR)))
  let n = 0
  for (const o of rows) {
    const decor = DEMO_DECOR[o.key]
    if (o.decor === decor || o.decor !== 'generic') continue
    await db.update(occasions).set({ decor }).where(eq(occasions.id, o.id))
    n++
  }
  return n
}

// ---------- Group games: family, friends (a group of friends, a class), generic ----------
// The "group" form addresses a group in the plural, named by {group_name} (asked as the name field).
// One group template per riddle serves all three sets, so every set defines every group slot: the
// ones it asks, and the others as "hidden" (never asked, the riddle gets the set's own fallback).

const gq = (
  slot: string,
  text: string,
  example: string,
  fallback: string,
  maxLen = 40,
  extra: Partial<Question> = {},
): Question => ({ ...q(slot, { group: text }, example, fallback, maxLen), ...extra })
const hidden = (slot: string, fallback: string): Question => ({
  slot,
  text: {},
  required: false,
  fallback,
  maxLen: 40,
  hidden: true,
})

export const familyQuestions: Question[] = [
  gq('group_name', 'איך קוראים למשפחה?', 'משפחת כהן', '', 40, { required: true }),
  gq('group_food', 'מה תמיד יש בארוחת שישי?', 'קובה', 'ארוחת שישי'),
  gq('group_saying', 'משפט שאבא או אמא תמיד אומרים', 'מי רוצה עוד?', 'מי רוצה עוד?', 60),
  gq('group_place', 'טיול משפחתי שכולם זוכרים', 'הגולן בפסח', 'הטיול ההוא'),
  gq('family_tradition', 'מסורת משפחתית', 'פיצה במוצאי שבת', 'הקידוש של שישי בערב', 50),
  gq('who_late', 'מי תמיד מאחר?', 'דוד שמעון', 'מישהו מהמשפחה', 30),
  gq('group_wish', 'משאלה למשפחה', 'עוד הרבה ארוחות ביחד', 'עוד הרבה שנים ביחד', 60),
  gq('photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
  hidden('group_moment', 'היום הראשון'),
  hidden('group_legend', 'סבא וסבתא'),
  hidden('group_years', 'כל השנים האלה'),
  hidden('who_cheeky', 'הקטנים במשפחה'),
  hidden('who_hungry', 'הרעבים של המשפחה'),
  hidden('who_phone', 'מכורי הטלפון'),
  hidden('who_laugh', 'הצחקנים של המשפחה'),
]

export const friendsQuestions: Question[] = [
  gq('group_name', "איך קוראים לחבר'ה?", "החבר'ה מהשכונה", '', 40, { required: true }),
  gq('group_saying', 'משפט שכולם תמיד אומרים', 'יאללה, זזים', 'יאללה, זזים', 60),
  gq('group_place', 'איפה הכול התחיל?', 'התיכון בחולון', 'המקום שבו הכול התחיל'),
  gq('group_food', 'האוכל הקבוע שלכם', 'פיצה באמצע הלילה', 'פיצה באמצע הלילה'),
  gq('group_moment', 'רגע שכולם זוכרים', 'הטיול לצפון', 'היום הראשון', 50),
  gq('group_legend', 'מי האגדה של החבורה?', 'דני הגדול', 'מי שכולם זוכרים'),
  gq('group_years', 'כמה שנים אתם ביחד?', '15 שנה', 'כל השנים האלה', 30),
  gq('group_wish', 'משאלה לחבורה', 'עוד טיול ביחד', 'עוד הרבה שנים ביחד', 60),
  gq('who_late', 'מי תמיד מגיע אחרון?', 'רון', "מישהו מהחבר'ה", 30),
  gq('who_hungry', 'מי תמיד רעב?', 'נועה', 'הרעבים של החבורה', 30),
  gq('who_laugh', 'מי צוחק הכי חזק?', 'מאיה', 'הצחקנים של החבורה', 30),
  gq('photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
  hidden('family_tradition', 'הקפה של הבוקר'),
  hidden('who_cheeky', 'החוצפן של החבורה'),
  hidden('who_phone', 'מכורי הטלפון'),
]

export const genericQuestions: Question[] = [
  gq('group_name', 'איך קוראים לקבוצה?', 'החבורה של יום שישי', '', 40, { required: true }),
  gq('group_saying', 'משפט שכולם תמיד אומרים', 'יאללה, זזים', 'יאללה, זזים', 60),
  gq('who_late', 'מי תמיד מאחר?', 'רון', 'מישהו', 30),
  gq('who_cheeky', 'מי הכי חוצפן?', 'שירה', 'החוצפן של החבורה', 30),
  gq('who_hungry', 'מי תמיד רעב?', 'נועה', 'הרעבים של החבורה', 30),
  gq('who_phone', 'מי תמיד בטלפון?', 'עומר', 'מכורי הטלפון', 30),
  gq('who_laugh', 'מי צוחק הכי חזק?', 'מאיה', 'הצחקנים של החבורה', 30),
  gq('photo_where', PHOTO_WHERE, PHOTO_EXAMPLE, ''),
  hidden('group_food', 'ארוחת שישי'),
  hidden('group_place', 'המקום שבו הכול התחיל'),
  hidden('family_tradition', 'הקפה של הבוקר'),
  hidden('group_moment', 'היום הראשון'),
  hidden('group_legend', 'מי שכולם זוכרים'),
  hidden('group_years', 'כל השנים האלה'),
  hidden('group_wish', 'עוד הרבה שנים ביחד'),
]

/** The group occasions with their question sets. */
export const GROUP_OCCASIONS = [
  { key: 'family', label: 'יום משפחתי', setName: 'שאלות למשפחה', questions: familyQuestions },
  {
    key: 'friends',
    label: "חבר'ה",
    setName: "שאלות לחבר'ה",
    formerSetNames: ["שאלות לחבר'ה וליחידות"],
    questions: friendsQuestions,
  },
  { key: 'generic', label: 'כללי', setName: 'שאלות כלליות לקבוצה', questions: genericQuestions },
]

/** A riddle, one line per entry (see templateLines: "?" marks a personal line, "||" its fallbacks). */
const L = (...lines: string[]) => lines.join('\n')

/**
 * The demo riddles, by answer, in every form. Three or four lines, rhymed where it reads naturally:
 * the fixed lines lead to the answer on their own, and the personal lines ("?") weave in the
 * buyer's answers, skipped (or swapped for their plain alternative) when the answer is empty.
 */
export const DEMO_RIDDLES: Record<string, RiddleTemplates> = {
  תקווה: {
    she: L(
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      '? ומאז {first_love}, {name} יודעת: עליה לא מוותרים. || ו{name} יודעת: עליה אף פעם לא מוותרים.',
      'מה היא?',
    ),
    he: L(
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      '? ומאז {first_love}, {name} יודע: עליה לא מוותרים. || ו{name} יודע: עליה אף פעם לא מוותרים.',
      'מה היא?',
    ),
    couple: L(
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      '? ומאז {first_love}, {name} יודעים: עליה לא מוותרים. || ו{name} יודעים: עליה אף פעם לא מוותרים.',
      'מה היא?',
    ),
    group: L(
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      '? ומאז {group_moment}, {group_name} יודעים: עליה לא מוותרים. || ו{group_name} יודעים: עליה אף פעם לא מוותרים.',
      '? כן, גם {who_late}, שעוד בדרך.',
      'מה היא?',
    ),
    company: L(
      'בסוף כל טקס שרים אותה כשכולם עומדים,',
      'היא עוד לא אבדה, גם בימים הקשים.',
      '? ומאז {memorable_project}, ב{company_name} יודעים: עליה לא מוותרים. || וב{company_name} יודעים: עליה אף פעם לא מוותרים.',
      'מה היא?',
    ),
  },
  מיץ: {
    she: L(
      'מפרי אותי סוחטים, עד הטיפה, בלי רחמים,',
      'כתום, קר ומתוק, בכוס, בימים החמים.',
      '? ו{name} לוקחת אותי בדרך אל {favorite_place}, בלי לחשוב פעמיים. || ו{name} שותה אותי בלי לחשוב פעמיים.',
      'מה אני?',
    ),
    he: L(
      'מפרי אותי סוחטים, עד הטיפה, בלי רחמים,',
      'כתום, קר ומתוק, בכוס, בימים החמים.',
      '? ו{name} לוקח אותי בדרך אל {favorite_place}, בלי לחשוב פעמיים. || ו{name} שותה אותי בלי לחשוב פעמיים.',
      'מה אני?',
    ),
    couple: L(
      'מפרי אותי סוחטים, עד הטיפה, בלי רחמים,',
      'כתום, קר ומתוק, בכוס, בימים החמים.',
      '? ו{name} לוקחים אותי בדרך אל {favorite_place}, בלי לחשוב פעמיים. || ו{name} שותים אותי בלי לחשוב פעמיים.',
      'מה אני?',
    ),
    group: L(
      'מפרי אותי סוחטים, עד הטיפה, בלי רחמים,',
      'כתום, קר ומתוק, בכוס, בימים החמים.',
      '? ו{group_name} לוקחים אותי בדרך אל {group_place}, בלי לחשוב פעמיים. || ו{group_name} שותים אותי בלי לחשוב פעמיים.',
      'מה אני?',
    ),
    company: L(
      'מפרי אותי סוחטים, עד הטיפה, בלי רחמים,',
      'כתום, קר ומתוק, בכוס, בימים החמים.',
      '? וב{company_name} לקחו אותי גם אל {last_offsite}, בלי לחשוב פעמיים. || וב{company_name} שותים אותי בלי לחשוב פעמיים.',
      'מה אני?',
    ),
  },
  "ג'חנון": {
    she: L(
      'תימני, ישן בתנור כל הלילה, מגולגל בשכבות,',
      'עם ביצה חומה ורסק עגבניות, ככה מתחילות שבתות.',
      '? וכמו ש{name} לא מוותרת על {favorite_food}, גם אני לא מוותר על אף שבת. || ו{name} יודעת: בשבת בבוקר, אותי לא מפספסים.',
      'מה אני?',
    ),
    he: L(
      'תימני, ישן בתנור כל הלילה, מגולגל בשכבות,',
      'עם ביצה חומה ורסק עגבניות, ככה מתחילות שבתות.',
      '? וכמו ש{name} לא מוותר על {favorite_food}, גם אני לא מוותר על אף שבת. || ו{name} יודע: בשבת בבוקר, אותי לא מפספסים.',
      'מה אני?',
    ),
    couple: L(
      'תימני, ישן בתנור כל הלילה, מגולגל בשכבות,',
      'עם ביצה חומה ורסק עגבניות, ככה מתחילות שבתות.',
      '? וכמו ש{name} לא מוותרים על {favorite_food}, גם אני לא מוותר על אף שבת. || ו{name} יודעים: בשבת בבוקר, אותי לא מפספסים.',
      'מה אני?',
    ),
    group: L(
      'תימני, ישן בתנור כל הלילה, מגולגל בשכבות,',
      'עם ביצה חומה ורסק עגבניות, ככה מתחילות שבתות.',
      '? וכמו ש{group_name} לא מוותרים על {group_food}, גם אני לא מוותר על אף שבת. || ו{group_name} יודעים: בשבת בבוקר, אותי לא מפספסים.',
      '? ואם תשאלו את {who_hungry}, אני מסורת טובה כמו {family_tradition}.',
      'מה אני?',
    ),
    company: L(
      'תימני, ישן בתנור כל הלילה, מגולגל בשכבות,',
      'עם ביצה חומה ורסק עגבניות, ככה מתחילות שבתות.',
      '? וכמו שב{company_name} לא מוותרים על {kitchen_favorite}, גם אני לא מוותר על אף שבת. || ובשבת בבוקר, גם ב{company_name} יודעים: אותי לא מפספסים.',
      'מה אני?',
    ),
  },
  בוריק: {
    she: L(
      'דק כמו נייר, מטוגן, מתוניסיה הגעתי,',
      'ובביס הראשון, עם הביצה שבפנים, הפתעתי!',
      '? אני קצת כמו {name}: מבחוץ פריכה, ומבפנים {one_word}. || אני קצת כמו {name}: מבחוץ פריכה, ומבפנים לב רך.',
      'מה אני?',
    ),
    he: L(
      'דק כמו נייר, מטוגן, מתוניסיה הגעתי,',
      'ובביס הראשון, עם הביצה שבפנים, הפתעתי!',
      '? אני קצת כמו {name}: מבחוץ פריך, ומבפנים {one_word}. || אני קצת כמו {name}: מבחוץ פריך, ומבפנים לב רך.',
      'מה אני?',
    ),
    couple: L(
      'דק כמו נייר, מטוגן, מתוניסיה הגעתי,',
      'ובביס הראשון, עם הביצה שבפנים, הפתעתי!',
      '? אני קצת כמו {name}: מבחוץ פריכים, ומבפנים {one_word}. || אני קצת כמו {name}: מבחוץ פריכים, ומבפנים לב רך.',
      'מה אני?',
    ),
    group: L(
      'דק כמו נייר, מטוגן, מתוניסיה הגעתי,',
      'ובביס הראשון, עם הביצה שבפנים, הפתעתי!',
      '? אני קצת כמו {group_name} אחרי {group_years}: מבחוץ פריכים, ומבפנים לב גדול. || אני קצת כמו {group_name}: מבחוץ פריכים, ומבפנים לב גדול.',
      '? ולפי {who_cheeky}, אני המאפה הכי טוב בשוק.',
      'מה אני?',
    ),
    company: L(
      'דק כמו נייר, מטוגן, מתוניסיה הגעתי,',
      'ובביס הראשון, עם הביצה שבפנים, הפתעתי!',
      'אני קצת כמו {company_name}: מבחוץ רציני, ומבפנים לב גדול.',
      '? ומי שזוכר את {memorable_project} יודע: הכי טוב יוצא בלחץ.',
      'מה אני?',
    ),
  },
  פלאפל: {
    she: L(
      'קטן ועגול, חום מבחוץ וירוק בפנים,',
      'עשוי מחומוס אבל לא חומוס, ונכנס לפיתה עם סלטים.',
      '? בדרך אל {favorite_place}, {name} תמיד עוצרת בשבילי, בלי תירוצים. || {name} תמיד עוצרת בשבילי, בלי תירוצים.',
      'מה אני?',
    ),
    he: L(
      'קטן ועגול, חום מבחוץ וירוק בפנים,',
      'עשוי מחומוס אבל לא חומוס, ונכנס לפיתה עם סלטים.',
      '? בדרך אל {favorite_place}, {name} תמיד עוצר בשבילי, בלי תירוצים. || {name} תמיד עוצר בשבילי, בלי תירוצים.',
      'מה אני?',
    ),
    couple: L(
      'קטן ועגול, חום מבחוץ וירוק בפנים,',
      'עשוי מחומוס אבל לא חומוס, ונכנס לפיתה עם סלטים.',
      '? בדרך אל {favorite_place}, {name} תמיד עוצרים בשבילי, בלי תירוצים. || {name} תמיד עוצרים בשבילי, בלי תירוצים.',
      'מה אני?',
    ),
    group: L(
      'קטן ועגול, חום מבחוץ וירוק בפנים,',
      'עשוי מחומוס אבל לא חומוס, ונכנס לפיתה עם סלטים.',
      '? בדרך אל {group_place}, {group_name} תמיד עוצרים בשבילי, בלי תירוצים. || {group_name} תמיד עוצרים בשבילי, בלי תירוצים.',
      '? בשבילי שווה אפילו להניח את הטלפון, נכון, {who_phone}?',
      'מה אני?',
    ),
    company: L(
      'קטן ועגול, חום מבחוץ וירוק בפנים,',
      'עשוי מחומוס אבל לא חומוס, ונכנס לפיתה עם סלטים.',
      '? גם אחרי {last_offsite}, ב{company_name} חוזרים אליי, בלי תירוצים. || ב{company_name} תמיד חוזרים אליי, בלי תירוצים.',
      'מה אני?',
    ),
  },
  קבב: {
    she: L(
      'בשר טחון על שיפוד, מעל גחלים בוערות,',
      'בפיתה עם טחינה, והריח ממלא את הסמטאות.',
      '? {name} הייתה מחליפה בשבילי אפילו את {favorite_food}, בלי שום שאלות. || {name} הייתה אוכלת אותי בלי שום שאלות.',
      'מה אני?',
    ),
    he: L(
      'בשר טחון על שיפוד, מעל גחלים בוערות,',
      'בפיתה עם טחינה, והריח ממלא את הסמטאות.',
      '? {name} היה מחליף בשבילי אפילו את {favorite_food}, בלי שום שאלות. || {name} היה אוכל אותי בלי שום שאלות.',
      'מה אני?',
    ),
    couple: L(
      'בשר טחון על שיפוד, מעל גחלים בוערות,',
      'בפיתה עם טחינה, והריח ממלא את הסמטאות.',
      '? {name} היו מחליפים בשבילי אפילו את {favorite_food}, בלי שום שאלות. || {name} היו אוכלים אותי בלי שום שאלות.',
      'מה אני?',
    ),
    group: L(
      'בשר טחון על שיפוד, מעל גחלים בוערות,',
      'בפיתה עם טחינה, והריח ממלא את הסמטאות.',
      '? {group_name} היו מחליפים בשבילי אפילו את {group_food}, בלי שום שאלות. || {group_name} היו אוכלים אותי בלי שום שאלות.',
      'מה אני?',
    ),
    company: L(
      'בשר טחון על שיפוד, מעל גחלים בוערות,',
      'בפיתה עם טחינה, והריח ממלא את הסמטאות.',
      '? ב{company_name} היו מחליפים בשבילי אפילו את {kitchen_favorite}, בלי שום שאלות. || ב{company_name} היו אוכלים אותי בלי שום שאלות.',
      'מה אני?',
    ),
  },
  לחיים: {
    she: L(
      'הגעתם לסוף! מרימים כוסות גבוה,',
      'וכשהן נפגשות, כולם אומרים מילה אחת, באהבה.',
      '? לכבוד {name}, לכבוד {favorite_place}, || לכבוד {name},',
      '? ולכבוד החלום שעוד יתגשם: {dream}. || ולכבוד כל מה שעוד יבוא.',
      'מה היא?',
    ),
    he: L(
      'הגעתם לסוף! מרימים כוסות גבוה,',
      'וכשהן נפגשות, כולם אומרים מילה אחת, באהבה.',
      '? לכבוד {name}, לכבוד {favorite_place}, || לכבוד {name},',
      '? ולכבוד החלום שעוד יתגשם: {dream}. || ולכבוד כל מה שעוד יבוא.',
      'מה היא?',
    ),
    couple: L(
      'הגעתם לסוף! מרימים כוסות גבוה,',
      'וכשהן נפגשות, כולם אומרים מילה אחת, באהבה.',
      '? לכבוד {name}, לכבוד {favorite_place}, || לכבוד {name},',
      '? ולכבוד החלום המשותף: {dream}. || ולכבוד כל מה שעוד יבוא.',
      'מה היא?',
    ),
    group: L(
      'הגעתם לסוף! מרימים כוסות גבוה,',
      'וכשהן נפגשות, כולם אומרים מילה אחת, באהבה.',
      '? לכבוד {group_name}, לכבוד {group_place} ו{group_legend}, || לכבוד {group_name},',
      '? ולכבוד המשאלה: {group_wish}. || ולכבוד עוד הרבה שנים ביחד.',
      '? ואת הצחוק של {who_laugh} שומעים עד הים.',
      'מה היא?',
    ),
    company: L(
      'הגעתם לסוף! מרימים כוסות גבוה,',
      'וכשהן נפגשות, כולם אומרים מילה אחת, באהבה.',
      '? לכבוד {company_name}, לכבוד {last_offsite}, || לכבוד {company_name},',
      'ולכבוד כל מה שעוד נבנה ביחד.',
      'מה היא?',
    ),
  },
  קפה: {
    she: L(
      'שחור או הפוך, חם ומריר קצת,',
      'בלעדיי שום בוקר לא מתחיל באמת.',
      '? וכמו ש{name} לא מוותרת על {favorite_food}, ככה היא לא מוותרת עליי בבוקר. || ו{name}? בלעדיי היא לא מתחילה אף בוקר.',
      'מה אני?',
    ),
    he: L(
      'שחור או הפוך, חם ומריר קצת,',
      'בלעדיי שום בוקר לא מתחיל באמת.',
      '? וכמו ש{name} לא מוותר על {favorite_food}, ככה הוא לא מוותר עליי בבוקר. || ו{name}? בלעדיי הוא לא מתחיל אף בוקר.',
      'מה אני?',
    ),
    couple: L(
      'שחור או הפוך, חם ומריר קצת,',
      'בלעדיי שום בוקר לא מתחיל באמת.',
      '? וכמו ש{name} לא מוותרים על {favorite_food}, ככה הם לא מוותרים עליי בבוקר. || ו{name}? בלעדיי הם לא מתחילים אף בוקר.',
      'מה אני?',
    ),
    group: L(
      'שחור או הפוך, חם ומריר קצת,',
      'בלעדיי שום בוקר לא מתחיל באמת.',
      '? ואחרי {group_moment}, {group_name} היו צריכים אותי כפול. || ו{group_name}? בלעדיי הם לא מתחילים אף בוקר.',
      'מה אני?',
    ),
    company: L(
      'שחור או הפוך, חם ומריר קצת,',
      'בלעדיי שום בוקר לא מתחיל באמת.',
      '? ומאז {memorable_project}, ב{company_name} צריכים אותי כפול. || וב{company_name}? בלעדיי לא מתחילים אף בוקר.',
      'מה אני?',
    ),
  },
}

/** The demo market, by name: its stalls and riddles are the demo rows. */
export const DEMO_MARKET = 'שוק הכרמל'

/**
 * Alcohol on the demo route (by tasting name), never served in a kids' game, and the drink the
 * beer stall pours for kids instead. Also used by the production script (scripts/kids-juice-2026-11.ts).
 */
export const ADULTS_ONLY_TASTINGS = ['בירה מהחבית', 'סיידר תפוחים']
export const KIDS_DRINK = {
  name: 'מיץ',
  teaser: 'מיץ טרי או לימונדה קרה לסיום',
  teaserIcon: 'drinks/lemonade',
  allergens: [] as string[],
  diets: [...ALL_DIETS],
}
export const DEMO_MAHANE = 'שוק מחנה יהודה'

/** The demo riddles' fixed fields. Their stable key is the stall's name and the answer. */
export const DEMO_RIDDLE_ROWS: {
  stall: string
  title: string
  answer: string
  accepted: string[]
  hint: string
  afterText: string
}[] = [
  {
    stall: 'דוכן המיצים של תקווה',
    title: 'תקווה',
    answer: 'תקווה',
    accepted: ['התקווה', 'תיקווה'],
    hint: 'זה גם שם של המנון',
    afterText: 'עכשיו מצאו את תקווה בשוק.',
  },
  {
    stall: 'מיצים בפינה',
    title: 'מיץ',
    answer: 'מיץ',
    accepted: ['מיצים'],
    hint: 'שותים אותו מכוס, סוחטים אותו מפרי',
    afterText: '',
  },
  {
    stall: 'המאפייה התימנית',
    title: "ג'חנון",
    answer: "ג'חנון",
    accepted: ['ג׳חנון', 'גחנון', 'jachnun'],
    hint: 'תימני, מגולגל, ישן בתנור',
    afterText: '',
  },
  {
    stall: 'בוריק',
    title: 'בוריק',
    answer: 'בוריק',
    accepted: ['בריק', 'בורק טוניסאי'],
    hint: 'המאפה הטוניסאי עם הביצה',
    afterText: '',
  },
  {
    stall: 'פלאפל בשוק',
    title: 'פלאפל',
    answer: 'פלאפל',
    accepted: ['פלאפל בפיתה', 'falafel'],
    hint: 'כדורים בפיתה',
    afterText: '',
  },
  {
    stall: 'קבב על האש',
    title: 'קבב',
    answer: 'קבב',
    accepted: ['קבאב', 'שיפוד קבב'],
    hint: 'בשר על שיפוד',
    afterText: '',
  },
  {
    stall: 'בירה בסוף השוק',
    title: 'לחיים',
    answer: 'לחיים',
    accepted: ['cheers'],
    hint: 'מה אומרים כשמרימים כוס?',
    afterText: '',
  },
  {
    stall: 'קפה של השוק',
    title: 'קפה',
    answer: 'קפה',
    accepted: ['הפוך', 'אספרסו'],
    hint: 'שותים אותו בבוקר',
    afterText: '',
  },
]

/** A demo riddle row as stored (without its stall id). */
export const demoRiddleValues = (d: (typeof DEMO_RIDDLE_ROWS)[number]) => ({
  title: d.title,
  answer: d.answer,
  accepted: [...d.accepted],
  hint: d.hint,
  afterText: d.afterText,
  templates: DEMO_RIDDLES[d.answer] ?? {},
  active: true,
})

/** The group version of each demo riddle, by answer. */
export const GROUP_TEMPLATES: Record<string, string> = Object.fromEntries(
  Object.entries(DEMO_RIDDLES).map(([answer, t]) => [answer, t.group ?? '']),
)

/** Every demo question set by its key, with its stable name. */
export function demoQuestionSets(): Record<
  string,
  { name: string; formerNames?: string[]; questions: readonly Question[] }
> {
  return {
    private: { name: 'שאלות פרטיות', questions: privateQuestions },
    company: { name: 'שאלות לחברות', questions: companyQuestions },
    ...Object.fromEntries(
      GROUP_OCCASIONS.map((g) => [
        g.key,
        { name: g.setName, formerNames: g.formerSetNames, questions: g.questions },
      ]),
    ),
    ...RECIPIENT_SETS,
  }
}

/** Demo price of the group occasions (same as the private ones). */
export const GROUP_PRICE = { base: 0, perPerson: 9900 }

/** Demo prices of every private demo occasion (companies are sold by quote). */
export const demoPrices = (): Record<string, { base: number; perPerson: number }> =>
  Object.fromEntries(
    DEMO_OCCASIONS.filter((o) => o.audience === 'private').map((o) => [o.key, { ...GROUP_PRICE }]),
  )

type SetIds = Record<keyof typeof RECIPIENT_SETS, number> & {
  private: number
  family: number
  friends: number
  generic: number
}

/**
 * Who each demo occasion is for, with its question set. One person first: a birthday is mostly
 * for her or him (a friends' birthday also for a group), a love game is a gift to her or him (or
 * to a couple), family and friends are group games, generic offers everyone sensible defaults.
 */
export function demoRecipients(id: SetIds): Record<string, OccasionRecipients> {
  return {
    bachelorette: { she: id.private },
    couple: { she: id.loveShe, he: id.loveHe, couple: id.couple },
    anniversary: { she: id.anniversaryShe, he: id.anniversaryHe, couple: id.anniversaryCouple },
    birthday_parent: { she: id.birthdayShe, he: id.birthdayHe },
    birthday_friend: { she: id.birthdayShe, he: id.birthdayHe, group: id.generic },
    birthday_kid: { she: id.kidShe, he: id.kidHe },
    family: { family: id.family },
    friends: { group: id.friends },
    generic: { she: id.private, he: id.private, couple: id.couple, group: id.generic, family: id.family },
  }
}

/** Adds the per-recipient demo sets missing by name; returns every one's id. */
async function insertRecipientSets(db: DB): Promise<Record<keyof typeof RECIPIENT_SETS, number>> {
  const have = new Map((await db.select().from(questionSets)).map((q) => [q.name, q.id]))
  const out = {} as Record<keyof typeof RECIPIENT_SETS, number>
  for (const [k, v] of Object.entries(RECIPIENT_SETS) as [
    keyof typeof RECIPIENT_SETS,
    (typeof RECIPIENT_SETS)[keyof typeof RECIPIENT_SETS],
  ][]) {
    out[k] =
      have.get(v.name) ??
      (
        await db
          .insert(questionSets)
          .values({ name: v.name, questions: [...v.questions] })
          .returning()
      )[0].id
  }
  return out
}

/**
 * Tops up a database seeded before recipients existed: adds the per-recipient sets and gives the
 * demo occasions their recipients, only where the owner has not changed them (still the ones the
 * migration derived from the old forms, all on the occasion's own set). Idempotent.
 */
export async function ensureRecipientSets(db: DB): Promise<number> {
  const rows = await db
    .select()
    .from(occasions)
    .where(inArray(occasions.key, Object.keys(DEMO_DECOR)))
  const byName = new Map((await db.select().from(questionSets)).map((q) => [q.name, q.id]))
  const group = (key: string) => GROUP_OCCASIONS.find((g) => g.key === key)
  const priv = rows.find((o) => o.key === 'bachelorette')?.questionSetId
  const fam = byName.get(group('family')?.setName ?? '')
  const friends = group('friends')
  const fri = [friends?.setName, ...(friends?.formerSetNames ?? [])]
    .map((n) => byName.get(n ?? ''))
    .find((x) => x != null)
  const gen = byName.get(group('generic')?.setName ?? '')
  if (!priv || !fam || !fri || !gen) return 0
  const R = demoRecipients({
    private: priv,
    family: fam,
    friends: fri,
    generic: gen,
    ...(await insertRecipientSets(db)),
  })
  let n = 0
  for (const o of rows) {
    const want = R[o.key]
    if (!want || o.audience !== 'private') continue
    if (
      JSON.stringify(occasionRecipients(o)) === JSON.stringify(occasionRecipients({ ...o, recipients: want }))
    )
      continue
    const derived = occasionRecipients({ ...o, recipients: {} })
    const current = occasionRecipients(o)
    const untouched =
      current.length === derived.length &&
      current.every((c, i) => c.recipient === derived[i].recipient && c.questionSetId === o.questionSetId)
    if (!untouched) continue
    await db
      .update(occasions)
      .set({
        recipients: want,
        forms: formsOfRecipients(want),
        playersFeminine: o.key === 'bachelorette',
        ...(o.key === 'couple' && o.label === 'זוג' ? { label: 'דייט רומנטי' } : {}),
        ...(o.key === 'birthday_friend' && o.label === 'יום הולדת לחבר/ה' ? { label: 'יום הולדת' } : {}),
      })
      .where(eq(occasions.id, o.id))
    n++
  }
  return n
}

/**
 * Tops up a database seeded before the mini-games: the optional photo question on every set that
 * lacks it, and the `minigames` setting (so the owner sees and edits it). Idempotent.
 */
export async function ensureMinigameSeed(db: DB): Promise<void> {
  for (const qs of await db.select().from(questionSets)) {
    if (qs.questions.some((q) => q.slot === 'photo_where')) continue
    const forms = [...new Set(qs.questions.flatMap((q) => Object.keys(q.text)))] as Form[]
    const text = Object.fromEntries(forms.map((f) => [f, PHOTO_WHERE]))
    await db
      .update(questionSets)
      .set({
        questions: [
          ...qs.questions,
          { slot: 'photo_where', text, example: PHOTO_EXAMPLE, required: false, fallback: '', maxLen: 40 },
        ],
      })
      .where(eq(questionSets.id, qs.id))
  }
  const [row] = await db.select().from(settings).where(eq(settings.key, 'minigames'))
  if (!row) await setSetting(db, 'minigames', DEFAULT_MINIGAMES)
}

export async function seedDemo(db: DB): Promise<{ carmelRouteId: number; carmelThemeId: number }> {
  const existing = await db.select().from(markets).limit(1)
  if (existing.length) {
    await ensureRecipientSets(db)
    await ensureMinigameSeed(db)
    const [route] = await db.select().from(routes).limit(1)
    const [theme] = await db.select().from(themes).where(eq(themes.marketId, route.marketId)).limit(1)
    return { carmelRouteId: route.id, carmelThemeId: theme.id }
  }

  const [carmel] = await db
    .insert(markets)
    .values({ name: 'שוק הכרמל', hours, codeSecret: randomToken(24) })
    .returning()
  const [mahane] = await db
    .insert(markets)
    .values({ name: DEMO_MAHANE, hours, codeSecret: randomToken(24) })
    .returning()

  const mk = async (name: string, locationHint: string) =>
    (await db.insert(stalls).values({ marketId: carmel.id, name, locationHint, phone: '' }).returning())[0]
  const tikva = await mk('דוכן המיצים של תקווה', 'בכניסה מכיכר מגן דוד, צד ימין')
  const juice2 = await mk('מיצים בפינה', 'מול דוכן התבלינים')
  const bakery = await mk('המאפייה התימנית', 'כרם התימנים, ליד השוק')
  const burik = await mk('בוריק', 'באמצע השוק, ליד הדגים')
  const falafel = await mk('פלאפל בשוק', 'רחוב הכרמל, צד שמאל')
  const kebab = await mk('קבב על האש', 'סמטה מצד ימין')
  const beer = await mk('בירה בסוף השוק', 'ביציאה לכיוון הים')
  const coffee = await mk('קפה של השוק', 'ליד הבירה')

  // Teasers are public before purchase: never the stall's name or a hint at a riddle.
  const t = async (
    stallId: number,
    name: string,
    allergens: string[],
    diets: string[],
    feeAgorot: number,
    teaser: string,
    teaserIcon: string | null,
  ) =>
    (
      await db
        .insert(tastings)
        .values({
          stallId,
          name,
          allergens,
          diets,
          feeAgorot,
          teaser,
          teaserIcon: DEMO_TASTING_ICONS[name] ?? teaserIcon,
          adultsOnly: ADULTS_ONLY_TASTINGS.includes(name),
        })
        .returning()
    )[0]
  const tJuice = await t(
    tikva.id,
    'מיץ תפוזים טרי',
    [],
    ALL_DIETS,
    800,
    'פירות העונה, סחוטים מול העיניים',
    'fruit',
  )
  const tJuice2 = await t(
    juice2.id,
    'מיץ גזר תפוזים',
    [],
    ALL_DIETS,
    700,
    'כוס כתומה וטרייה, סחוטה במקום',
    'fruit',
  )
  const tJachnun = await t(
    bakery.id,
    "ג'חנון עם ביצה ורסק",
    ['גלוטן', 'ביצים', 'חלב'],
    ['vegetarian'],
    1500,
    'מאפה תימני מסורתי מהתנור',
    'awning',
  )
  const tBurik = await t(
    burik.id,
    'בוריק תפוחי אדמה וביצה',
    ['גלוטן', 'ביצים'],
    ['vegetarian'],
    1200,
    'מאפה פריך וחם, ממולא תפוחי אדמה',
    'awning',
  )
  const tFalafel = await t(
    falafel.id,
    'חצי פיתה פלאפל',
    ['גלוטן', 'שומשום'],
    ['vegan', 'vegetarian'],
    1000,
    'קלאסיקה ירוקה בפיתה, ישר מהשמן',
    'hummus',
  )
  await t(
    falafel.id,
    'כדורי פלאפל בצלחת',
    ['שומשום'],
    ['vegan', 'vegetarian', 'gluten_free'],
    900,
    'כדורים ירוקים ישר מהשמן, בצלחת',
    'hummus',
  )
  const tKebab = await t(
    kebab.id,
    'שיפוד קבב בפיתה',
    ['גלוטן', 'שומשום'],
    [],
    1400,
    'בשר על האש בפיתה',
    'spices',
  )
  const tBeer = await t(
    beer.id,
    'בירה מהחבית',
    ['גלוטן'],
    ['vegan', 'vegetarian'],
    1200,
    'משהו קר מהחבית לסיום',
    'tomatoes',
  )
  await t(beer.id, 'סיידר תפוחים', [], ALL_DIETS, 1200, 'משהו קר ומתוק לסיום', 'fruit')
  // What a kids' game gets here instead of the beer (and the cider).
  await t(
    beer.id,
    KIDS_DRINK.name,
    KIDS_DRINK.allergens,
    KIDS_DRINK.diets,
    1200,
    KIDS_DRINK.teaser,
    KIDS_DRINK.teaserIcon,
  )
  const tCoffee = await t(
    coffee.id,
    'קפה הפוך',
    ['חלב'],
    ['vegetarian', 'gluten_free'],
    900,
    'משהו חם ומעורר, עם הרבה חלב',
    'coffee',
  )

  const stallIdByName = new Map(
    [tikva, juice2, bakery, burik, falafel, kebab, beer, coffee].map((x) => [x.name, x.id]),
  )
  const byAnswer = new Map<string, typeof riddles.$inferSelect>()
  for (const d of DEMO_RIDDLE_ROWS) {
    const [row] = await db
      .insert(riddles)
      .values({ ...demoRiddleValues(d), stallId: stallIdByName.get(d.stall)! })
      .returning()
    byAnswer.set(d.answer, row)
  }
  const rTikva = byAnswer.get('תקווה')!
  const rJuice2 = byAnswer.get('מיץ')!
  const rJachnun = byAnswer.get("ג'חנון")!
  const rBurik = byAnswer.get('בוריק')!
  const rFalafel = byAnswer.get('פלאפל')!
  const rKebab = byAnswer.get('קבב')!
  const rBeer = byAnswer.get('לחיים')!
  const rCoffee = byAnswer.get('קפה')!

  const [route] = await db
    .insert(routes)
    .values({
      marketId: carmel.id,
      name: 'מסלול הכרמל הקלאסי',
      stops: [
        {
          stallId: tikva.id,
          tastingId: tJuice.id,
          riddleId: rTikva.id,
          backupStallId: juice2.id,
          backupTastingId: tJuice2.id,
          backupRiddleId: rJuice2.id,
        },
        {
          stallId: bakery.id,
          tastingId: tJachnun.id,
          riddleId: rJachnun.id,
          backupStallId: burik.id,
          backupTastingId: tBurik.id,
          backupRiddleId: rBurik.id,
        },
        {
          stallId: burik.id,
          tastingId: tBurik.id,
          riddleId: rBurik.id,
          backupStallId: bakery.id,
          backupTastingId: tJachnun.id,
          backupRiddleId: rJachnun.id,
        },
        {
          stallId: falafel.id,
          tastingId: tFalafel.id,
          riddleId: rFalafel.id,
          backupStallId: kebab.id,
          backupTastingId: tKebab.id,
          backupRiddleId: rKebab.id,
        },
        {
          stallId: beer.id,
          tastingId: tBeer.id,
          riddleId: rBeer.id,
          backupStallId: coffee.id,
          backupTastingId: tCoffee.id,
          backupRiddleId: rCoffee.id,
        },
      ],
    })
    .returning()

  const carmelPins = {
    [tikva.id]: { x: 78, y: 70 },
    [juice2.id]: { x: 72, y: 62 },
    [bakery.id]: { x: 30, y: 78 },
    [burik.id]: { x: 55, y: 52 },
    [falafel.id]: { x: 48, y: 38 },
    [kebab.id]: { x: 40, y: 44 },
    [beer.id]: { x: 22, y: 20 },
    [coffee.id]: { x: 28, y: 24 },
  }
  const [watercolor] = await insertDemoThemes(db, { carmel: carmel.id, mahane: mahane.id }, carmelPins)

  const [qsPrivate] = await db
    .insert(questionSets)
    .values({ name: 'שאלות פרטיות', questions: privateQuestions })
    .returning()
  const [qsCompany] = await db
    .insert(questionSets)
    .values({ name: 'שאלות לחברות', questions: companyQuestions })
    .returning()
  const groupSets: (typeof questionSets.$inferSelect)[] = []
  for (const g of GROUP_OCCASIONS)
    groupSets.push(
      (await db.insert(questionSets).values({ name: g.setName, questions: g.questions }).returning())[0],
    )
  const sets = await insertRecipientSets(db)
  const [family, friends, generic] = groupSets.map((g) => g.id)
  const setIds: Record<string, number> = {
    private: qsPrivate.id,
    company: qsCompany.id,
    family,
    friends,
    generic,
    ...sets,
  }
  await db.insert(occasions).values(DEMO_OCCASIONS.map((o, i) => demoOccasionValues(o, i, setIds)))

  await ensureDemoPalettes(db)

  // Demo prices only. The owner sets the real ones in the admin (SPEC "Open").
  await setSetting(db, 'prices', demoPrices())
  await setSetting(db, 'minigames', DEFAULT_MINIGAMES)
  await markDemoSeeded(db)
  await setSetting(db, 'odd_rules', { profanity: ['זונה', 'מניאק', 'קוקסינל'], maxRepeatedChars: 4 })

  return { carmelRouteId: route.id, carmelThemeId: watercolor.id }
}
