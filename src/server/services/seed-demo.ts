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
import type { Decor, Form, OccasionRecipients, Palette, Question, RiddleTemplates } from '../domain/types.ts'
import { randomToken } from '../lib/tokens.ts'
import { markDemoSeeded } from './demo-refresh.ts'
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
const PHOTO_WHERE = 'אם תוסיפו תמונות: איפה צולמה הראשונה? (נשאל על זה במשחק)'

const privateQuestions: Question[] = [
  {
    slot: 'first_love',
    text: { she: 'מי הייתה האהבה הראשונה שלה?', he: 'מי הייתה האהבה הראשונה שלו?', couple: 'איפה הם נפגשו?' },
    required: false,
    fallback: 'הפעם הראשונה',
    maxLen: 40,
  },
  {
    slot: 'favorite_food',
    text: { she: 'מה האוכל האהוב עליה?', he: 'מה האוכל האהוב עליו?', couple: 'מה האוכל האהוב עליהם?' },
    required: false,
    fallback: 'ארוחת שישי',
    maxLen: 40,
  },
  {
    slot: 'one_word',
    text: { she: 'מילה אחת שמתארת אותה', he: 'מילה אחת שמתארת אותו', couple: 'מילה אחת שמתארת אותם' },
    required: false,
    fallback: { she: 'רכה', he: 'רך', couple: 'רכים' },
    maxLen: 20,
  },
  {
    slot: 'catchphrase',
    text: { she: 'משפט שהיא תמיד אומרת', he: 'משפט שהוא תמיד אומר', couple: 'משפט שהם תמיד אומרים' },
    required: false,
    fallback: 'יאללה, זזים',
    maxLen: 60,
  },
  {
    slot: 'favorite_place',
    text: { she: 'המקום האהוב עליה', he: 'המקום האהוב עליו', couple: 'המקום האהוב עליהם' },
    required: false,
    fallback: 'הים',
    maxLen: 40,
  },
  {
    slot: 'dream',
    text: { she: 'חלום שעוד לא הגשימה', he: 'חלום שעוד לא הגשים', couple: 'חלום משותף שלהם' },
    required: false,
    fallback: 'כל החלומות',
    maxLen: 60,
  },
  {
    slot: 'photo_where',
    text: {
      she: PHOTO_WHERE,
      he: PHOTO_WHERE,
      couple: PHOTO_WHERE,
    },
    required: false,
    fallback: '',
    maxLen: 40,
  },
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
  fallback: string,
  maxLen = 40,
): Question => ({ slot, text: { [form]: text }, required: false, fallback, maxLen })

export const birthdaySheQuestions: Question[] = [
  pq('she', 'first_love', 'מי או מה הייתה האהבה הראשונה שלה? (ילד מהכיתה, להקה, כלב)', 'האהבה הראשונה'),
  pq('she', 'favorite_food', 'מה היא הייתה אוכלת כל יום, אם רק היה אפשר?', 'עוגת יום הולדת'),
  pq('she', 'one_word', 'איך היא מבפנים, במילה אחת? (למשל: רכה, מצחיקה, עקשנית)', 'רכה', 20),
  pq('she', 'catchphrase', 'משפט שכל מי שמכיר אותה שמע ממנה אלף פעם', 'יאללה, זזים', 60),
  pq('she', 'favorite_place', 'המקום שהכי עושה לה טוב', 'הים'),
  pq('she', 'dream', 'חלום שאתם מאחלים לה להגשים השנה', 'כל החלומות', 60),
  pq('she', 'photo_where', PHOTO_WHERE, ''),
]

export const birthdayHeQuestions: Question[] = [
  pq(
    'he',
    'first_love',
    'מי או מה הייתה האהבה הראשונה שלו? (ילדה מהכיתה, קבוצת כדורגל, אופניים)',
    'האהבה הראשונה',
  ),
  pq('he', 'favorite_food', 'מה הוא היה אוכל כל יום, אם רק היה אפשר?', 'עוגת יום הולדת'),
  pq('he', 'one_word', 'איך הוא מבפנים, במילה אחת? (למשל: רך, מצחיק, עקשן)', 'רך', 20),
  pq('he', 'catchphrase', 'משפט שכל מי שמכיר אותו שמע ממנו אלף פעם', 'יאללה, זזים', 60),
  pq('he', 'favorite_place', 'המקום שהכי עושה לו טוב', 'הים'),
  pq('he', 'dream', 'חלום שאתם מאחלים לו להגשים השנה', 'כל החלומות', 60),
  pq('he', 'photo_where', PHOTO_WHERE, ''),
]

// A love game is a gift to her or to him, written from the giver's side.
export const loveSheQuestions: Question[] = [
  pq('she', 'first_love', 'איך הכול התחיל ביניכם? (למשל: הדייט הראשון בפלורנטין)', 'הפעם הראשונה שנפגשנו'),
  pq('she', 'favorite_food', 'מה היא מזמינה תמיד, בכל מסעדה, בלי להסתכל בתפריט?', 'פסטה'),
  pq('she', 'one_word', 'איך היא מבפנים, כמו שרק מי שקרוב אליה יודע? מילה אחת', 'רכה', 20),
  pq('she', 'catchphrase', 'כינוי או משפט שהיא אומרת רק לך', 'אני אוהבת אותך', 60),
  pq('she', 'favorite_place', 'המקום שלכם (חוף, בית קפה, עיר)', 'הים'),
  pq('she', 'dream', 'חלום שאתם עוד רוצים להגשים ביחד', 'כל מה שעוד מחכה לנו', 60),
  pq('she', 'photo_where', PHOTO_WHERE, ''),
]

export const loveHeQuestions: Question[] = [
  pq('he', 'first_love', 'איך הכול התחיל ביניכם? (למשל: הדייט הראשון בפלורנטין)', 'הפעם הראשונה שנפגשנו'),
  pq('he', 'favorite_food', 'מה הוא מזמין תמיד, בכל מסעדה, בלי להסתכל בתפריט?', 'המבורגר'),
  pq('he', 'one_word', 'איך הוא מבפנים, כמו שרק מי שקרוב אליו יודע? מילה אחת', 'רך', 20),
  pq('he', 'catchphrase', 'כינוי או משפט שהוא אומר רק לך', 'אני אוהב אותך', 60),
  pq('he', 'favorite_place', 'המקום שלכם (חוף, בית קפה, עיר)', 'הים'),
  pq('he', 'dream', 'חלום שאתם עוד רוצים להגשים ביחד', 'כל מה שעוד מחכה לנו', 60),
  pq('he', 'photo_where', PHOTO_WHERE, ''),
]

// A couple: questions about the two of them.
export const coupleQuestions: Question[] = [
  pq('couple', 'first_love', 'איפה הכול התחיל אצלם? (למשל: המסיבה של נועה)', 'הפעם הראשונה שנפגשו'),
  pq('couple', 'favorite_food', 'המנה ששניהם תמיד חולקים (ורבים על הביס האחרון)', 'פיצה משותפת'),
  pq('couple', 'one_word', 'איך הם ביחד, במילה אחת? (למשל: מתוקים, משוגעים)', 'מתוקים', 20),
  pq('couple', 'catchphrase', 'משפט ששניהם אומרים כל הזמן', 'יאללה, זזים', 60),
  pq('couple', 'favorite_place', 'המקום שלהם', 'הים'),
  pq('couple', 'dream', 'חלום משותף שעוד מחכה להם', 'כל מה שעוד מחכה להם', 60),
  pq('couple', 'photo_where', PHOTO_WHERE, ''),
]

/** The demo question sets per recipient, by name (each editable in the admin). */
export const RECIPIENT_SETS = {
  birthdayShe: { name: 'יום הולדת: לה', questions: birthdaySheQuestions },
  birthdayHe: { name: 'יום הולדת: לו', questions: birthdayHeQuestions },
  loveShe: { name: 'אהבה: לה, מצד מי שנותן', questions: loveSheQuestions },
  loveHe: { name: 'אהבה: לו, מצד מי שנותן', questions: loveHeQuestions },
  couple: { name: 'זוג: על שניהם', questions: coupleQuestions },
} as const

const companyQuestions: Question[] = [
  { slot: 'company_name', text: { company: 'שם החברה' }, required: true, fallback: '', maxLen: 40 },
  {
    slot: 'company_catchphrase',
    text: { company: 'משפט שכולם אומרים במשרד' },
    required: false,
    fallback: 'יאללה, זזים',
    maxLen: 60,
  },
  {
    slot: 'memorable_project',
    text: { company: 'פרויקט שכולם זוכרים' },
    required: false,
    fallback: 'הפרויקט ההוא',
    maxLen: 40,
  },
  {
    slot: 'kitchen_favorite',
    text: { company: 'מה נגמר ראשון במטבחון?' },
    required: false,
    fallback: 'הקפה',
    maxLen: 40,
  },
  {
    slot: 'last_offsite',
    text: { company: 'איפה היה האוף-סייט האחרון?' },
    required: false,
    fallback: 'הים',
    maxLen: 40,
  },
  { slot: 'photo_where', text: { company: PHOTO_WHERE }, required: false, fallback: '', maxLen: 40 },
]

const WATERCOLOR = ['כרמל בצבעי מים', 'מחנה יהודה בצבעי מים']

/** Demo palettes: which themes (by name) each one is offered on. Every one passes paletteIssues. */
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
  {
    name: 'כחול-ורוד',
    themes: ['כרמל כחול-ורוד'],
    palette: {
      background: '#8E99C6',
      accent: '#F3859F',
      accent2: '#0A297D',
      ink: '#0A297D',
      paper: '#F6EEF2',
    },
  },
  {
    name: 'לילה',
    themes: ['מחנה יהודה בלילה'],
    palette: { background: '#0B2B47', accent: '#AFC7AE', ink: '#08223A', paper: '#F3EFE4', dark: true },
  },
]

/** Doodle set per demo occasion key. */
export const DEMO_DECOR: Record<string, Decor> = {
  bachelorette: 'love',
  couple: 'love',
  birthday_parent: 'birthday',
  birthday_friend: 'birthday',
  family: 'family',
  friends: 'friends',
  generic: 'generic',
  team_day: 'company',
  retirement: 'company',
  new_employee: 'company',
}

/**
 * Adds the demo palettes that are missing (by name) and links them to the themes they name.
 * Idempotent: used by the seed and to top up a database seeded before palettes existed.
 */
export async function ensureDemoPalettes(db: DB): Promise<number> {
  const have = new Set((await db.select({ name: palettes.name }).from(palettes)).map((p) => p.name))
  const allThemes = await db.select({ id: themes.id, name: themes.name }).from(themes)
  let added = 0
  for (const [i, p] of DEMO_PALETTES.entries()) {
    if (have.has(p.name)) continue
    const themeIds = allThemes.filter((t) => p.themes.includes(t.name)).map((t) => t.id)
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

// ---------- Group games: family, friends (a unit, a class), generic ----------
// The "group" form addresses a group in the plural, named by {group_name} (asked as the name field).
// One group template per riddle serves all three sets, so every set defines every group slot: the
// ones it asks, and the others as "hidden" (never asked, the riddle gets the set's own fallback).

const gq = (
  slot: string,
  text: string,
  fallback: string,
  maxLen = 40,
  extra: Partial<Question> = {},
): Question => ({ slot, text: { group: text }, required: false, fallback, maxLen, ...extra })
const hidden = (slot: string, fallback: string): Question => ({
  slot,
  text: {},
  required: false,
  fallback,
  maxLen: 40,
  hidden: true,
})

export const familyQuestions: Question[] = [
  gq('group_name', 'שם המשפחה?', '', 40, { required: true }),
  gq('group_food', 'המאכל שתמיד יש בארוחת שישי?', 'ארוחת שישי'),
  gq('group_saying', 'המשפט הכי מוכר של אבא או אמא?', 'מי רוצה עוד?', 60),
  gq('group_place', 'הטיול המשפחתי שכולם זוכרים?', 'הטיול ההוא'),
  gq('family_tradition', 'מסורת משפחתית?', 'הקידוש של שישי בערב', 50),
  gq('who_late', 'מי הכי מאחר/ת במשפחה?', 'מישהו מהמשפחה', 30),
  gq('group_wish', 'משאלה למשפחה?', 'עוד הרבה שנים ביחד', 60),
  gq('photo_where', PHOTO_WHERE, ''),
  hidden('group_moment', 'היום הראשון'),
  hidden('group_legend', 'סבא וסבתא'),
  hidden('group_years', 'כל השנים האלה'),
  hidden('who_cheeky', 'הקטנים במשפחה'),
  hidden('who_hungry', 'הרעבים של המשפחה'),
  hidden('who_phone', 'מכורי הטלפון'),
  hidden('who_laugh', 'הצחקנים של המשפחה'),
]

export const friendsQuestions: Question[] = [
  gq('group_name', 'איך קוראים לקבוצה או ליחידה?', '', 40, { required: true }),
  gq('group_saying', 'משפט שכולם אמרו כל הזמן?', 'יאללה, זזים', 60),
  gq('group_place', 'המקום שבו הכול התחיל (בסיס, שכונה, טיול)?', 'המקום שבו הכול התחיל'),
  gq('group_food', 'האוכל של הקבוצה?', 'פיצה באמצע הלילה'),
  gq('group_moment', 'רגע שכולם זוכרים?', 'היום הראשון', 50),
  gq('group_legend', 'מישהו שכולם זוכרים, ומה הכינוי שלו?', 'מי שכולם זוכרים'),
  gq('group_years', 'כמה זמן אתם ביחד?', 'כל השנים האלה', 30),
  gq('group_wish', 'משאלה לקבוצה לשנים הבאות?', 'עוד הרבה שנים ביחד', 60),
  gq('who_late', 'מי תמיד מגיע/ה אחרון/ה?', "מישהו מהחבר'ה", 30),
  gq('who_hungry', 'מי הראשון/ה לשאול "מה אוכלים"?', 'הרעבים של החבורה', 30),
  gq('who_laugh', 'מי צוחק/ת הכי חזק?', 'הצחקנים של החבורה', 30),
  gq('photo_where', PHOTO_WHERE, ''),
  hidden('family_tradition', 'הקפה של הבוקר'),
  hidden('who_cheeky', 'החוצפן של החבורה'),
  hidden('who_phone', 'מכורי הטלפון'),
]

export const genericQuestions: Question[] = [
  gq('group_name', 'איך קוראים לקבוצה?', '', 40, { required: true }),
  gq('group_saying', 'משפט שכולם אומרים כל הזמן?', 'יאללה, זזים', 60),
  gq('who_late', 'מי הכי מאחר/ת בקבוצה?', 'מישהו', 30),
  gq('who_cheeky', 'מי הכי חוצפן/ית?', 'החוצפן של החבורה', 30),
  gq('who_hungry', 'מי תמיד רעב/ה?', 'הרעבים של החבורה', 30),
  gq('who_phone', 'מי לא מוריד/ה את העיניים מהטלפון?', 'מכורי הטלפון', 30),
  gq('who_laugh', 'מי צוחק/ת הכי חזק?', 'הצחקנים של החבורה', 30),
  gq('photo_where', PHOTO_WHERE, ''),
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
  { key: 'family', label: 'משפחתי', setName: 'שאלות למשפחה', questions: familyQuestions },
  { key: 'friends', label: "חבר'ה", setName: "שאלות לחבר'ה וליחידות", questions: friendsQuestions },
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
export function demoQuestionSets(): Record<string, { name: string; questions: readonly Question[] }> {
  return {
    private: { name: 'שאלות פרטיות', questions: privateQuestions },
    company: { name: 'שאלות לחברות', questions: companyQuestions },
    ...Object.fromEntries(GROUP_OCCASIONS.map((g) => [g.key, { name: g.setName, questions: g.questions }])),
    ...RECIPIENT_SETS,
  }
}

/** Demo price of the group occasions (same as the private ones). */
export const GROUP_PRICE = { base: 0, perPerson: 9900 }

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
    birthday_parent: { she: id.birthdayShe, he: id.birthdayHe },
    birthday_friend: { she: id.birthdayShe, he: id.birthdayHe, group: id.generic },
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
  const fri = byName.get(group('friends')?.setName ?? '')
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
        ...(o.key === 'couple' && o.label === 'זוג' ? { label: 'אהבה וזוגיות' } : {}),
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
          { slot: 'photo_where', text, required: false, fallback: '', maxLen: 40 },
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
    .values({ name: 'שוק מחנה יהודה', hours, codeSecret: randomToken(24) })
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
        .values({ stallId, name, allergens, diets, feeAgorot, teaser, teaserIcon })
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
  const [watercolor] = await db
    .insert(themes)
    .values({
      name: 'כרמל בצבעי מים',
      marketId: carmel.id,
      mapFile: 'builtin:carmel-watercolor.jpg',
      palette: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
      pins: carmelPins,
      sort: 1,
    })
    .returning()
  await db.insert(themes).values([
    {
      name: 'כרמל כחול-ורוד',
      marketId: carmel.id,
      mapFile: 'builtin:carmel-riso.jpg',
      palette: {
        background: '#737FB0',
        accent: '#F3859F',
        accent2: '#0A297D',
        ink: '#0A297D',
        paper: '#F6EEF2',
      },
      pins: carmelPins,
      sort: 2,
    },
    {
      name: 'מחנה יהודה בצבעי מים',
      marketId: mahane.id,
      mapFile: 'builtin:mahane-yehuda-watercolor.jpg',
      palette: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
      sort: 3,
    },
    {
      name: 'מחנה יהודה בלילה',
      marketId: mahane.id,
      mapFile: 'builtin:mahane-yehuda-night.jpg',
      palette: { background: '#0B2B47', accent: '#AFC7AE', ink: '#08223A', paper: '#F3EFE4', dark: true },
      sort: 4,
    },
  ])

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
  const R = demoRecipients({ private: qsPrivate.id, family, friends, generic, ...sets })
  const priv = (key: string, label: string, sort: number, questionSetId: number) => {
    const recipients = R[key]
    return {
      key,
      label,
      audience: 'private' as const,
      decor: DEMO_DECOR[key] ?? 'generic',
      questionSetId,
      recipients,
      forms: formsOfRecipients(recipients),
      playersFeminine: key === 'bachelorette',
      sort,
    }
  }
  await db.insert(occasions).values([
    priv('bachelorette', 'רווקות', 1, qsPrivate.id),
    priv('couple', 'אהבה וזוגיות', 2, qsPrivate.id),
    priv('birthday_parent', 'יום הולדת להורה', 3, qsPrivate.id),
    priv('birthday_friend', 'יום הולדת', 4, qsPrivate.id),
    ...GROUP_OCCASIONS.map((g, i) => priv(g.key, g.label, 5 + i, groupSets[i].id)),
    {
      key: 'team_day',
      decor: DEMO_DECOR.team_day,
      label: 'יום צוות',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 8,
    },
    {
      key: 'retirement',
      decor: DEMO_DECOR.retirement,
      label: 'פרישה',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 9,
    },
    {
      key: 'new_employee',
      decor: DEMO_DECOR.new_employee,
      label: 'עובד/ת חדש/ה',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 10,
    },
  ])

  await ensureDemoPalettes(db)

  // Demo prices only. The owner sets the real ones in the admin (SPEC "Open").
  await setSetting(db, 'prices', {
    bachelorette: { base: 0, perPerson: 9900 },
    couple: { base: 0, perPerson: 9900 },
    birthday_parent: { base: 0, perPerson: 9900 },
    birthday_friend: { base: 0, perPerson: 9900 },
    ...Object.fromEntries(GROUP_OCCASIONS.map((g) => [g.key, GROUP_PRICE])),
  })
  await setSetting(db, 'minigames', DEFAULT_MINIGAMES)
  await markDemoSeeded(db)
  await setSetting(db, 'odd_rules', { profanity: ['זונה', 'מניאק', 'קוקסינל'], maxRepeatedChars: 4 })

  return { carmelRouteId: route.id, carmelThemeId: watercolor.id }
}
