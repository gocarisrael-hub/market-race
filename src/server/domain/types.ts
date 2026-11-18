// Shared domain types. Pure: no DB or framework imports, safe to use from the web bundles.

// she / he / couple: one person or a couple is celebrated. group: a family, a unit or a group of
// friends, addressed in the plural and named by the {group_name} slot. company: a company game.
export const FORMS = ['she', 'he', 'couple', 'group', 'company'] as const
export type Form = (typeof FORMS)[number]

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
}

export interface LetterNote {
  text: string
  signature: string
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

export interface GameSnapshot {
  version: 1
  builtAt: string
  market: { id: number; name: string }
  theme: { id: number; name: string; map: string; palette: Palette }
  company: { name: string; logo: string | null } | null
  form: Form
  honoree: string
  people: number
  allergens: string[]
  diets: string[]
  stops: SnapshotStop[]
  letter: { notes: LetterNote[]; photos: string[] }
}
