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
  stalls,
  tastings,
  themes,
} from '../db/schema.ts'
import type { Decor, Palette, Question } from '../domain/types.ts'
import { randomToken } from '../lib/tokens.ts'
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
]

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
  hidden('family_tradition', 'הקפה של הבוקר'),
  hidden('who_late', "מישהו מהחבר'ה"),
  hidden('who_cheeky', 'החוצפן של החבורה'),
  hidden('who_hungry', 'הרעבים של החבורה'),
  hidden('who_phone', 'מכורי הטלפון'),
  hidden('who_laugh', 'הצחקנים של החבורה'),
]

export const genericQuestions: Question[] = [
  gq('group_name', 'איך קוראים לקבוצה?', '', 40, { required: true }),
  gq('group_saying', 'משפט שכולם אומרים כל הזמן?', 'יאללה, זזים', 60),
  gq('who_late', 'מי הכי מאחר/ת בקבוצה?', 'מישהו', 30),
  gq('who_cheeky', 'מי הכי חוצפן/ית?', 'החוצפן של החבורה', 30),
  gq('who_hungry', 'מי תמיד רעב/ה?', 'הרעבים של החבורה', 30),
  gq('who_phone', 'מי לא מוריד/ה את העיניים מהטלפון?', 'מכורי הטלפון', 30),
  gq('who_laugh', 'מי צוחק/ת הכי חזק?', 'הצחקנים של החבורה', 30),
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

/**
 * The group version of each demo riddle, by answer. The fixed lines still lead to the answer;
 * the slots add color. Across the five route stops every set's asked slots appear at least once.
 */
export const GROUP_TEMPLATES: Record<string, string> = {
  תקווה:
    '{who_late} עוד בדרך, אבל {group_name} כבר יודעים: לא מוותרים עליה. מאז {group_moment}, היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
  מיץ: 'סוחטים אותי עד הטיפה האחרונה, כמו ש{group_name} סוחטים כל רגע ביחד. כתום, קר ומתוק. מה אני?',
  "ג'חנון":
    '{group_food}? אצל {group_name} מחכים לזה כמו שאני מחכה בתנור: כל הלילה. אני מסורת, בדיוק כמו {family_tradition}: נכנסים ביום שישי, יוצאים בשבת בבוקר, מגולגלים, עם ביצה חומה ורסק עגבניות לידי. ו{who_hungry}? כבר עם מזלג ביד. מה אני?',
  בוריק:
    'אני קצת כמו {group_name} אחרי {group_years} ביחד: מבחוץ פריך, ומבפנים לב גדול. לפי {who_cheeky}, אני המאפה הכי טוב בשוק. באתי מתוניסיה, דק כמו נייר ומטוגן, ובביס הראשון נשברת לי ביצה בפנים. מה אני?',
  פלאפל:
    'אצל {group_name} תמיד אומרים: "{group_saying}". ככה גם אני: קטן, עגול ומתפוצץ מטעם. ירוק מבפנים, חום מבחוץ, עשוי מחומוס אבל אני לא חומוס, ואני נכנס לפיתה עם סלטים. בשבילי שווה אפילו להניח את הטלפון, נכון, {who_phone}? מה אני?',
  קבב: 'אצל {group_name} תמיד אומרים: "{group_saying}". אני בשר טחון על שיפוד, מעל גחלים, בתוך פיתה עם טחינה. מה אני?',
  לחיים:
    'הגעתם לסוף. לכבוד {group_name}, לכבוד {group_place}, לכבוד {group_legend} ולכבוד {group_wish}, מרימים כוסות. כשהן נפגשות, כולם אומרים מילה אחת, ו{who_laugh} הכי חזק. מה היא?',
  קפה: 'שחור או הפוך, {group_name} לא מתחילים בלעדיי בוקר. מה אני?',
}

/** Demo price of the group occasions (same as the private ones). */
export const GROUP_PRICE = { base: 0, perPerson: 9900 }

export async function seedDemo(db: DB): Promise<{ carmelRouteId: number; carmelThemeId: number }> {
  const existing = await db.select().from(markets).limit(1)
  if (existing.length) {
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

  const r = async (v: typeof riddles.$inferInsert) => {
    const group = GROUP_TEMPLATES[v.answer]
    const templates = group ? { ...v.templates, group } : v.templates
    return (
      await db
        .insert(riddles)
        .values({ ...v, templates })
        .returning()
    )[0]
  }
  const rTikva = await r({
    stallId: tikva.id,
    title: 'תקווה',
    answer: 'תקווה',
    accepted: ['התקווה', 'תיקווה'],
    hint: 'זה גם שם של המנון',
    afterText: 'עכשיו מצאו את תקווה בשוק.',
    templates: {
      she: 'מאז {first_love}, {name} יודעת שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
      he: 'מאז {first_love}, {name} יודע שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
      couple:
        'מאז {first_love}, {name} יודעים שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
      company:
        'מאז {memorable_project}, כולם ב{company_name} יודעים שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
    },
  })
  const rJuice2 = await r({
    stallId: juice2.id,
    title: 'מיץ',
    answer: 'מיץ',
    accepted: ['מיצים'],
    hint: 'שותים אותו מכוס, סוחטים אותו מפרי',
    afterText: '',
    templates: {
      she: 'סוחטים אותי עד הטיפה האחרונה, כמו ש{name} סוחטת כל רגע. כתום, קר ומתוק. מה אני?',
      he: 'סוחטים אותי עד הטיפה האחרונה, כמו ש{name} סוחט כל רגע. כתום, קר ומתוק. מה אני?',
      couple: 'סוחטים אותי עד הטיפה האחרונה, כמו ש{name} סוחטים כל רגע. כתום, קר ומתוק. מה אני?',
      company: 'סוחטים אותי עד הטיפה האחרונה, כמו שב{company_name} סוחטים כל ספרינט. כתום, קר ומתוק. מה אני?',
    },
  })
  const rJachnun = await r({
    stallId: bakery.id,
    title: "ג'חנון",
    answer: "ג'חנון",
    accepted: ['ג׳חנון', 'גחנון', 'jachnun'],
    hint: 'תימני, מגולגל, ישן בתנור',
    afterText: '',
    templates: {
      she: '{name} מחכה ל{favorite_food} כמו שאני מחכה בתנור: כל הלילה. נכנסים ביום שישי, יוצאים בשבת בבוקר, מגולגלים, עם ביצה חומה ורסק עגבניות לידי. מה אני?',
      he: '{name} מחכה ל{favorite_food} כמו שאני מחכה בתנור: כל הלילה. נכנסים ביום שישי, יוצאים בשבת בבוקר, מגולגלים, עם ביצה חומה ורסק עגבניות לידי. מה אני?',
      couple:
        '{name} מחכים ל{favorite_food} כמו שאני מחכה בתנור: כל הלילה. נכנסים ביום שישי, יוצאים בשבת בבוקר, מגולגלים, עם ביצה חומה ורסק עגבניות לידי. מה אני?',
      company:
        'ב{company_name} מחכים ל{kitchen_favorite} כמו שאני מחכה בתנור: כל הלילה. נכנסים ביום שישי, יוצאים בשבת בבוקר, מגולגלים, עם ביצה חומה ורסק עגבניות לידי. מה אני?',
    },
  })
  const rBurik = await r({
    stallId: burik.id,
    title: 'בוריק',
    answer: 'בוריק',
    accepted: ['בריק', 'בורק טוניסאי'],
    hint: 'המאפה הטוניסאי עם הביצה',
    afterText: '',
    templates: {
      she: 'אני קצת כמו {name}: מבחוץ פריך, ומבפנים {one_word}. באתי מתוניסיה, דק כמו נייר ומטוגן, ובביס הראשון נשברת לי ביצה בפנים. מה אני?',
      he: 'אני קצת כמו {name}: מבחוץ פריך, ומבפנים {one_word}. באתי מתוניסיה, דק כמו נייר ומטוגן, ובביס הראשון נשברת לי ביצה בפנים. מה אני?',
      couple:
        'אני קצת כמו {name}: מבחוץ פריכים, ומבפנים {one_word}. באתי מתוניסיה, דק כמו נייר ומטוגן, ובביס הראשון נשברת לי ביצה בפנים. מה אני?',
      company:
        'אני קצת כמו {company_name}: מבחוץ פריך, ומבפנים לב גדול. באתי מתוניסיה, דק כמו נייר ומטוגן, ובביס הראשון נשברת לי ביצה בפנים. מה אני?',
    },
  })
  const rFalafel = await r({
    stallId: falafel.id,
    title: 'פלאפל',
    answer: 'פלאפל',
    accepted: ['פלאפל בפיתה', 'falafel'],
    hint: 'כדורים בפיתה',
    afterText: '',
    templates: {
      she: '{name} תמיד אומרת: "{catchphrase}". ככה גם אני: קטן, עגול ומתפוצץ מטעם. ירוק מבפנים, חום מבחוץ, עשוי מחומוס אבל אני לא חומוס, ואני נכנס לפיתה עם סלטים. מה אני?',
      he: '{name} תמיד אומר: "{catchphrase}". ככה גם אני: קטן, עגול ומתפוצץ מטעם. ירוק מבפנים, חום מבחוץ, עשוי מחומוס אבל אני לא חומוס, ואני נכנס לפיתה עם סלטים. מה אני?',
      couple:
        '{name} תמיד אומרים: "{catchphrase}". ככה גם אני: קטן, עגול ומתפוצץ מטעם. ירוק מבפנים, חום מבחוץ, עשוי מחומוס אבל אני לא חומוס, ואני נכנס לפיתה עם סלטים. מה אני?',
      company:
        'ב{company_name} תמיד אומרים: "{company_catchphrase}". ככה גם אני: קטן, עגול ומתפוצץ מטעם. ירוק מבפנים, חום מבחוץ, עשוי מחומוס אבל אני לא חומוס, ואני נכנס לפיתה עם סלטים. מה אני?',
    },
  })
  const rKebab = await r({
    stallId: kebab.id,
    title: 'קבב',
    answer: 'קבב',
    accepted: ['קבאב', 'שיפוד קבב'],
    hint: 'בשר על שיפוד',
    afterText: '',
    templates: {
      she: '{name} תמיד אומרת: "{catchphrase}". אני בשר טחון על שיפוד, מעל גחלים, בתוך פיתה עם טחינה. מה אני?',
      he: '{name} תמיד אומר: "{catchphrase}". אני בשר טחון על שיפוד, מעל גחלים, בתוך פיתה עם טחינה. מה אני?',
      couple:
        '{name} תמיד אומרים: "{catchphrase}". אני בשר טחון על שיפוד, מעל גחלים, בתוך פיתה עם טחינה. מה אני?',
      company:
        'ב{company_name} תמיד אומרים: "{company_catchphrase}". אני בשר טחון על שיפוד, מעל גחלים, בתוך פיתה עם טחינה. מה אני?',
    },
  })
  const rBeer = await r({
    stallId: beer.id,
    title: 'לחיים',
    answer: 'לחיים',
    accepted: ['cheers'],
    hint: 'מה אומרים כשמרימים כוס?',
    afterText: '',
    templates: {
      she: 'הגעתם לסוף. לכבוד {name}, לכבוד {favorite_place} ולכבוד {dream} שעוד יתגשם, מרימים כוסות. כשהן נפגשות, כולם אומרים מילה אחת. מה היא?',
      he: 'הגעתם לסוף. לכבוד {name}, לכבוד {favorite_place} ולכבוד {dream} שעוד יתגשם, מרימים כוסות. כשהן נפגשות, כולם אומרים מילה אחת. מה היא?',
      couple:
        'הגעתם לסוף. לכבוד {name}, לכבוד {favorite_place} ולכבוד {dream} שעוד יתגשם, מרימים כוסות. כשהן נפגשות, כולם אומרים מילה אחת. מה היא?',
      company:
        'הגעתם לסוף. לכבוד {company_name}, לכבוד {last_offsite} ולכבוד כל מה שעוד נבנה ביחד, מרימים כוסות. כשהן נפגשות, כולם אומרים מילה אחת. מה היא?',
    },
  })
  const rCoffee = await r({
    stallId: coffee.id,
    title: 'קפה',
    answer: 'קפה',
    accepted: ['הפוך', 'אספרסו'],
    hint: 'שותים אותו בבוקר',
    afterText: '',
    templates: {
      she: 'שחור או הפוך, {name} לא מתחילה בלעדיי בוקר. מה אני?',
      he: 'שחור או הפוך, {name} לא מתחיל בלעדיי בוקר. מה אני?',
      couple: 'שחור או הפוך, {name} לא מתחילים בלעדיי בוקר. מה אני?',
      company: 'שחור או הפוך, ב{company_name} לא מתחילים בלעדיי בוקר. מה אני?',
    },
  })

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
  await db.insert(occasions).values([
    {
      key: 'bachelorette',
      decor: DEMO_DECOR.bachelorette,
      label: 'רווקות',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she'],
      sort: 1,
    },
    {
      key: 'couple',
      decor: DEMO_DECOR.couple,
      label: 'זוג',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['couple'],
      sort: 2,
    },
    {
      key: 'birthday_parent',
      decor: DEMO_DECOR.birthday_parent,
      label: 'יום הולדת להורה',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she', 'he'],
      sort: 3,
    },
    {
      key: 'birthday_friend',
      decor: DEMO_DECOR.birthday_friend,
      label: 'יום הולדת לחבר/ה',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she', 'he'],
      sort: 4,
    },
    ...GROUP_OCCASIONS.map((g, i) => ({
      key: g.key,
      label: g.label,
      audience: 'private' as const,
      questionSetId: groupSets[i].id,
      forms: ['group' as const],
      decor: DEMO_DECOR[g.key] ?? 'generic',
      sort: 5 + i,
    })),
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
  await setSetting(db, 'odd_rules', { profanity: ['זונה', 'מניאק', 'קוקסינל'], maxRepeatedChars: 4 })

  return { carmelRouteId: route.id, carmelThemeId: watercolor.id }
}
