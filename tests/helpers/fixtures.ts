// Catalog fixture based on docs/handoff/RIDDLES_DRAFT.md (test data only).
import type { BuildInput } from '../../src/server/domain/builder.ts'
import type { Question } from '../../src/server/domain/types.ts'

export const questions: Question[] = [
  { slot: 'name', text: { she: 'איך קוראים לה?' }, required: true, fallback: '', maxLen: 30 },
  {
    slot: 'first_love',
    text: { she: 'האהבה הראשונה שלה?' },
    required: false,
    fallback: 'הפעם הראשונה',
    maxLen: 40,
  },
  {
    slot: 'favorite_food',
    text: { she: 'האוכל האהוב?' },
    required: false,
    fallback: 'ארוחת שישי',
    maxLen: 40,
  },
  {
    slot: 'one_word',
    text: { she: 'מילה אחת שמתארת אותה' },
    required: false,
    fallback: { she: 'רכה', he: 'רך' },
    maxLen: 20,
  },
  {
    slot: 'catchphrase',
    text: { she: 'משפט שהיא תמיד אומרת' },
    required: false,
    fallback: 'יאללה, זזים',
    maxLen: 60,
  },
]

export function catalog(): Omit<BuildInput, 'order'> {
  return {
    market: { id: 1, name: 'שוק הכרמל' },
    route: {
      id: 1,
      stops: [
        { stallId: 1, tastingId: 1, riddleId: 1, backupStallId: 2 },
        { stallId: 3, tastingId: 3, riddleId: 3, backupStallId: 4, backupRiddleId: 4 },
        { stallId: 5, tastingId: 5, riddleId: 5, backupStallId: null },
      ],
    },
    theme: {
      id: 1,
      name: 'כרמל בצבעי מים',
      mapFile: 'builtin:carmel-watercolor.jpg',
      palette: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
      pins: { '1': { x: 40, y: 30 } },
    },
    stalls: [
      { id: 1, name: 'דוכן המיצים של תקווה', locationHint: 'ליד הכניסה', active: true },
      { id: 2, name: 'מיצים גיבוי', locationHint: '', active: true },
      { id: 3, name: 'המאפייה התימנית', locationHint: '', active: true },
      { id: 4, name: 'פלאפל גיבוי', locationHint: '', active: true },
      { id: 5, name: 'בירה בסוף', locationHint: '', active: true },
    ],
    tastings: [
      {
        id: 1,
        stallId: 1,
        name: 'מיץ תפוזים',
        allergens: [],
        diets: ['vegan', 'vegetarian', 'gluten_free'],
        feeAgorot: 800,
        active: true,
      },
      {
        id: 2,
        stallId: 2,
        name: 'מיץ גזר',
        allergens: [],
        diets: ['vegan', 'vegetarian', 'gluten_free'],
        feeAgorot: 700,
        active: true,
      },
      {
        id: 3,
        stallId: 3,
        name: "ג'חנון",
        allergens: ['גלוטן', 'ביצים', 'חלב'],
        diets: ['vegetarian'],
        feeAgorot: 1500,
        active: true,
      },
      {
        id: 4,
        stallId: 4,
        name: 'פלאפל',
        allergens: ['שומשום'],
        diets: ['vegan', 'vegetarian'],
        feeAgorot: 1000,
        active: true,
      },
      {
        id: 5,
        stallId: 5,
        name: 'בירה',
        allergens: ['גלוטן'],
        diets: ['vegan', 'vegetarian'],
        feeAgorot: 1200,
        active: true,
      },
      {
        id: 6,
        stallId: 5,
        name: 'סיידר',
        allergens: [],
        diets: ['vegan', 'vegetarian', 'gluten_free'],
        feeAgorot: 1200,
        active: true,
      },
    ],
    riddles: [
      {
        id: 1,
        stallId: 1,
        answer: 'תקווה',
        accepted: ['התקווה', 'תיקווה'],
        hint: 'זה גם שם של המנון',
        templates: {
          she: 'מאז {first_love}, {name} יודעת שאסור לוותר עליה. היא עוד לא אבדה, ושרים עליה בסוף כל טקס. מה היא?',
          he: 'מאז {first_love}, {name} יודע שאסור לוותר עליה. מה היא?',
        },
        afterText: 'עכשיו מצאו את תקווה בשוק.',
        active: true,
      },
      {
        id: 3,
        stallId: 3,
        answer: "ג'חנון",
        accepted: ['גחנון', 'jachnun'],
        hint: 'תימני, מגולגל, ישן בתנור',
        templates: {
          she: '{name} מחכה ל{favorite_food} כמו שאני מחכה בתנור: כל הלילה. מה אני?',
          he: '{name} מחכה ל{favorite_food}. מה אני?',
        },
        afterText: '',
        active: true,
      },
      {
        id: 4,
        stallId: 4,
        answer: 'פלאפל',
        accepted: [],
        hint: 'כדורים בפיתה',
        templates: {
          she: '{name} תמיד אומרת: "{catchphrase}". מה אני?',
          he: '{name} תמיד אומר: "{catchphrase}". מה אני?',
        },
        afterText: '',
        active: true,
      },
      {
        id: 5,
        stallId: 5,
        answer: 'לחיים',
        accepted: ['cheers'],
        hint: 'מה אומרים כשמרימים כוס?',
        templates: {
          she: 'לכבוד {name} מרימים כוסות. מה אומרים?',
          he: 'לכבוד {name} מרימים כוסות. מה אומרים?',
        },
        afterText: '',
        active: true,
      },
    ],
    questions,
  }
}

export function order(over: Partial<BuildInput['order']> = {}): BuildInput['order'] {
  return {
    form: 'she',
    honoreeName: 'מיכל',
    people: 4,
    allergens: [],
    diets: [],
    answers: { first_love: 'יואב מהשכבה', favorite_food: 'שקשוקה' },
    letterNotes: [],
    photos: [],
    company: null,
    ...over,
  }
}
