// Demo catalog for local dev, e2e and staging. Everything here is editable data in the admin;
// the owner replaces it with the real stalls, riddles and prices. Never runs in production.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { markets, occasions, questionSets, riddles, routes, stalls, tastings, themes } from '../db/schema.ts'
import type { Question } from '../domain/types.ts'
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

  const r = async (v: typeof riddles.$inferInsert) => (await db.insert(riddles).values(v).returning())[0]
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
  await db.insert(occasions).values([
    {
      key: 'bachelorette',
      label: 'רווקות',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she'],
      sort: 1,
    },
    {
      key: 'couple',
      label: 'זוג',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['couple'],
      sort: 2,
    },
    {
      key: 'birthday_parent',
      label: 'יום הולדת להורה',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she', 'he'],
      sort: 3,
    },
    {
      key: 'birthday_friend',
      label: 'יום הולדת לחבר/ה',
      audience: 'private',
      questionSetId: qsPrivate.id,
      forms: ['she', 'he'],
      sort: 4,
    },
    {
      key: 'team_day',
      label: 'יום צוות',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 5,
    },
    {
      key: 'retirement',
      label: 'פרישה',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 6,
    },
    {
      key: 'new_employee',
      label: 'עובד/ת חדש/ה',
      audience: 'company',
      questionSetId: qsCompany.id,
      forms: ['company'],
      sort: 7,
    },
  ])

  // Demo prices only. The owner sets the real ones in the admin (SPEC "Open").
  await setSetting(db, 'prices', {
    bachelorette: { base: 0, perPerson: 9900 },
    couple: { base: 0, perPerson: 9900 },
    birthday_parent: { base: 0, perPerson: 9900 },
    birthday_friend: { base: 0, perPerson: 9900 },
  })
  await setSetting(db, 'odd_rules', { profanity: ['זונה', 'מניאק', 'קוקסינל'], maxRepeatedChars: 4 })

  return { carmelRouteId: route.id, carmelThemeId: watercolor.id }
}
