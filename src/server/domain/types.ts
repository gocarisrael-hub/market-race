// Shared domain types. Pure: no DB or framework imports, safe to use from the web bundles.

// she / he / couple: one person or a couple is celebrated. group: a family, a unit or a group of
// friends, addressed in the plural and named by the {group_name} slot. company: a company game.
export const FORMS = ['she', 'he', 'couple', 'group', 'company'] as const
export type Form = (typeof FORMS)[number]

// Who a private game is for, asked early in the order. Most games are a gift for one person, so
// she and he come first. The recipient picks the question set (with the occasion) and the form:
// family is a group game with its own questions. A company game has no recipient.
export const RECIPIENTS = ['she', 'he', 'couple', 'group', 'family'] as const
export type Recipient = (typeof RECIPIENTS)[number]
export const isRecipient = (v: unknown): v is Recipient => RECIPIENTS.includes(v as Recipient)
export const RECIPIENT_FORM: Record<Recipient, Form> = {
  she: 'she',
  he: 'he',
  couple: 'couple',
  group: 'group',
  family: 'group',
}
/** An occasion's recipients: each offered one, with its question set (null: the occasion's own). */
export type OccasionRecipients = Partial<Record<Recipient, number | null>>

// Fixed lists (SPEC: allergens are never free text).
export const ALLERGENS = [
  'גלוטן',
  'חלב',
  'אגוזים',
  'בוטנים',
  'ביצים',
  'שומשום',
  'סויה',
  'דגים',
  'פירות ים',
] as const
export type Allergen = (typeof ALLERGENS)[number]
export const DIETS = ['vegan', 'vegetarian', 'gluten_free'] as const
export type Diet = (typeof DIETS)[number]

export const ORDER_STATUSES = [
  'quoted', // company: quote sent, waiting for payment
  'pending_payment',
  'awaiting_answers',
  'review', // flagged: odd answers or a blocked stop, waits for the owner
  'ready',
  'active',
  'done',
  'expired',
  'cancelled',
] as const
export type OrderStatus = (typeof ORDER_STATUSES)[number]

/** Per photo: keep its background, or cut the subject out and set it on paper. */
export const PHOTO_BACKGROUNDS = ['keep', 'remove'] as const
export type PhotoBackground = (typeof PHOTO_BACKGROUNDS)[number]

export type MarketHours = Partial<
  Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', { open: string; close: string }>
>

export type RiddleTemplates = Partial<Record<Form, string>>

export interface Question {
  slot: string
  text: Partial<Record<Form, string>>
  required: boolean
  fallback: Partial<Record<Form, string>> | string
  maxLen: number
  /**
   * Not asked: the buyer never sees it, riddles get the fallback. Lets one riddle template use
   * slots that only some question sets ask (e.g. a family set gives {group_legend} a fixed phrase).
   */
  hidden?: boolean
}

export interface RouteStop {
  stallId: number
  tastingId: number
  riddleId: number
  backupStallId: number | null
  backupTastingId?: number | null
  backupRiddleId?: number | null
}

export interface Palette {
  background: string
  accent: string
  accent2?: string
  ink: string
  paper: string
  dark?: boolean
  /** Color the market map is tinted toward (CSS "color" blend), so the illustration follows the
   * palette. Absent: the map keeps its own colors. */
  mapTint?: string
}

// Hand-drawn doodle sets shown around the game and the order flow, picked per occasion.
export const DECORS = ['birthday', 'love', 'family', 'friends', 'company', 'generic'] as const
export type Decor = (typeof DECORS)[number]
export const isDecor = (v: unknown): v is Decor => DECORS.includes(v as Decor)

export interface LetterNote {
  text: string
  signature: string
}

/** A personal question about the honoree, asked in the game before a riddle's hint is shown. */
export interface HintQuestion {
  question: string
  answer: string
}

export interface OrderFlag {
  code: 'empty_required' | 'too_long' | 'profanity' | 'repeated_chars' | 'blocked_stop' | 'other'
  slot?: string
  stopIndex?: number
  message: string
  resolved?: boolean
}

// A riddle text after filling: personal parts are marked so the UI can style them.
export type TextPart = { t: 'text'; v: string } | { t: 'slot'; v: string; slot: string }

export interface SnapshotStall {
  id: number
  name: string
  locationHint: string
  pin: { x: number; y: number } | null
}

export interface SnapshotTasting {
  id: number
  name: string
  allergens: string[]
  diets: string[]
  feeAgorot: number
}

export interface SnapshotStop {
  index: number
  finale: boolean
  stall: SnapshotStall
  tasting: SnapshotTasting
  riddle: {
    id: number
    parts: TextPart[]
    answer: string
    accepted: string[]
    hint: string
    afterText: string
  }
  photo: string | null
  // Used on the day if the stall is closed. Null when there is no safe backup.
  backup: { stall: SnapshotStall; tasting: SnapshotTasting } | null
  // True when the builder already swapped to the backup stall (allergen/diet safety).
  swappedToBackup: boolean
}

// Personal mini-games between stops, built only from the order's own answers and photos.
export const MINIGAME_TYPES = ['who_said', 'true_false', 'photo', 'cipher'] as const
export type MinigameType = (typeof MINIGAME_TYPES)[number]

/** What solving a mini-game opens: a line of the closing letter (a buyer's note, or one we write). */
export interface MinigameReward {
  text: string
  signature: string
}

/**
 * A built mini-game, frozen in the snapshot. `solution` and `reward` never reach the player client
 * (the reward only once solved); see publicMinigame.
 */
export interface SnapshotMinigame {
  type: MinigameType
  /** Played after this many stops are done (before stop index `afterStop`). */
  afterStop: number
  prompt: TextPart[]
  /** who_said, photo: the choices, in display order. */
  options?: string[]
  /** true_false: the statements, in display order. */
  statements?: TextPart[][]
  /** photo: the order's photo (a stored file) and the point the zoomed crop starts on (percent). */
  photo?: string
  focus?: { x: number; y: number }
  /** cipher: the shifted text and the personal hint to the key. */
  cipher?: string
  keyHint?: TextPart[]
  solution: {
    option?: number
    truths?: boolean[]
    text?: string
    accepted?: string[]
    shift?: number
  }
  reward: MinigameReward
  /** The answer slots it is built from (for the admin, and to keep two games apart). */
  slots: string[]
}

export interface GameSnapshot {
  version: 1
  builtAt: string
  market: { id: number; name: string }
  theme: { id: number; name: string; map: string; palette: Palette; paletteId?: number | null }
  /** Doodle set of the occasion. Missing on games built before it existed. */
  decor?: Decor
  company: { name: string; logo: string | null } | null
  form: Form
  /** Who the game is for. Missing on games built before recipients existed. */
  recipient?: Recipient | null
  /**
   * The players are addressed in the feminine plural (a bachelorette). Missing on older games,
   * which used it whenever the form was "she".
   */
  playersFeminine?: boolean
  honoree: string
  people: number
  allergens: string[]
  diets: string[]
  stops: SnapshotStop[]
  letter: { notes: LetterNote[]; photos: string[] }
  /** Personal mini-games between stops. Missing on games built before they existed. */
  minigames?: SnapshotMinigame[]
}
