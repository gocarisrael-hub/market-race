// Data model for market-race. See docs/handoff/SPEC.md and docs/ARCHITECTURE.md.
// Money is stored in agorot (integer). Business facts live here, never in code.
import { sql } from 'drizzle-orm'
import {
  boolean,
  date,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type {
  Form,
  GameSnapshot,
  LetterNote,
  MarketHours,
  OrderFlag,
  OrderStatus,
  Palette,
  Question,
  RiddleTemplates,
  RouteStop,
} from '../domain/types.ts'

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow()
const textArray = () => text().array().notNull().default(sql`'{}'::text[]`)

// ---------- Admin ----------

export const owners = pgTable('owners', {
  id: serial().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull().default(''),
  passwordHash: text().notNull(),
  createdAt: now(),
})

export const sessions = pgTable('sessions', {
  // sha256 of the cookie token; the raw token never touches the DB.
  id: text().primaryKey(),
  ownerId: integer()
    .notNull()
    .references(() => owners.id, { onDelete: 'cascade' }),
  expiresAt: timestamp({ withTimezone: true }).notNull(),
  createdAt: now(),
})

// ---------- Catalog ----------

export const markets = pgTable('markets', {
  id: serial().primaryKey(),
  name: text().notNull(),
  hours: jsonb().$type<MarketHours>().notNull().default({}),
  // Secret used to derive the daily redemption code. Generated, never shown to players.
  codeSecret: text().notNull(),
  active: boolean().notNull().default(true),
  createdAt: now(),
})

export const stalls = pgTable('stalls', {
  id: serial().primaryKey(),
  marketId: integer()
    .notNull()
    .references(() => markets.id),
  name: text().notNull(),
  locationHint: text().notNull().default(''),
  phone: text().notNull().default(''),
  active: boolean().notNull().default(true),
  // "Closed today" is stored as the date it applies to (Israel time), so it resets itself.
  closedOn: date({ mode: 'string' }),
  closedNote: text().notNull().default(''),
  createdAt: now(),
})

export const tastings = pgTable('tastings', {
  id: serial().primaryKey(),
  stallId: integer()
    .notNull()
    .references(() => stalls.id),
  name: text().notNull(),
  allergens: textArray(),
  diets: textArray(),
  feeAgorot: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  createdAt: now(),
})

export const riddles = pgTable('riddles', {
  id: serial().primaryKey(),
  stallId: integer()
    .notNull()
    .references(() => stalls.id),
  title: text().notNull().default(''),
  answer: text().notNull(),
  accepted: textArray(),
  hint: text().notNull().default(''),
  templates: jsonb().$type<RiddleTemplates>().notNull().default({}),
  // Text shown after solving, e.g. "עכשיו מצאו את תקווה בשוק."
  afterText: text().notNull().default(''),
  active: boolean().notNull().default(true),
  createdAt: now(),
})

export const questionSets = pgTable('question_sets', {
  id: serial().primaryKey(),
  name: text().notNull(),
  questions: jsonb().$type<Question[]>().notNull().default([]),
  createdAt: now(),
})

// An occasion (private) or company type. Admin can add more.
export const occasions = pgTable('occasions', {
  id: serial().primaryKey(),
  key: text().notNull().unique(),
  label: text().notNull(),
  audience: text().$type<'private' | 'company'>().notNull(),
  questionSetId: integer().references(() => questionSets.id),
  forms: text().array().$type<Form[]>().notNull(),
  sort: integer().notNull().default(0),
  active: boolean().notNull().default(true),
})

export const routes = pgTable('routes', {
  id: serial().primaryKey(),
  marketId: integer()
    .notNull()
    .references(() => markets.id),
  name: text().notNull(),
  stops: jsonb().$type<RouteStop[]>().notNull().default([]),
  active: boolean().notNull().default(true),
  createdAt: now(),
})

export const themes = pgTable('themes', {
  id: serial().primaryKey(),
  name: text().notNull(),
  marketId: integer()
    .notNull()
    .references(() => markets.id),
  // Path relative to the uploads root, or "builtin:<file>" for maps shipped in assets/maps.
  mapFile: text().notNull(),
  palette: jsonb().$type<Palette>().notNull(),
  // Stall pins on this map, in percent of the image: { [stallId]: { x, y } }.
  pins: jsonb().$type<Record<string, { x: number; y: number }>>().notNull().default({}),
  sort: integer().notNull().default(0),
  active: boolean().notNull().default(true),
})

export const settings = pgTable('settings', {
  key: text().primaryKey(),
  value: jsonb().notNull(),
  updatedAt: now(),
})

// ---------- Orders and games ----------

export const orders = pgTable('orders', {
  id: serial().primaryKey(),
  orderNo: text().notNull().unique(),
  kind: text().$type<'private' | 'company'>().notNull(),
  status: text().$type<OrderStatus>().notNull(),
  createdAt: now(),
  paidAt: timestamp({ withTimezone: true }),
  priceAgorot: integer().notNull().default(0),
  paymentRef: text(),
  buyerName: text().notNull().default(''),
  buyerPhone: text().notNull().default(''),
  buyerEmail: text().notNull().default(''),
  occasionKey: text().notNull(),
  form: text().$type<Form>().notNull(),
  honoreeName: text().notNull().default(''),
  themeId: integer().references(() => themes.id),
  routeId: integer().references(() => routes.id),
  people: integer().notNull().default(2),
  allergens: textArray(),
  diets: textArray(),
  answers: jsonb().$type<Record<string, string>>().notNull().default({}),
  letterNotes: jsonb().$type<LetterNote[]>().notNull().default([]),
  photos: textArray(),
  companyName: text(),
  companyLogo: text(),
  companyPalette: jsonb().$type<Palette | null>(),
  validUntil: date({ mode: 'string' }),
  game: jsonb().$type<GameSnapshot | null>(),
  flags: jsonb().$type<OrderFlag[]>().notNull().default([]),
  // Unguessable tokens for the public links.
  gameToken: text().notNull().unique(),
  manageToken: text().notNull().unique(),
  notes: text().notNull().default(''),
  // Set when the buyer (or the owner, for companies) finished the questions.
  answersSubmittedAt: timestamp({ withTimezone: true }),
  // Delivery of the game link happened (email/WhatsApp), so it is not sent twice.
  deliveredAt: timestamp({ withTimezone: true }),
})

// Shared progress of one game across every phone.
export const gameStates = pgTable('game_states', {
  orderId: integer()
    .primaryKey()
    .references(() => orders.id, { onDelete: 'cascade' }),
  stopIndex: integer().notNull().default(0),
  step: text().$type<'opening' | 'riddle' | 'revealed' | 'redeem' | 'done'>().notNull().default('opening'),
  hintsShown: integer().array().notNull().default(sql`'{}'::integer[]`),
  // Stops where the stall was closed on the day and the backup stall was used.
  backupStops: integer().array().notNull().default(sql`'{}'::integer[]`),
  wrongAnswers: integer().notNull().default(0),
  // Bumped on every change; clients poll and re-render when it moves.
  version: integer().notNull().default(0),
  startedAt: timestamp({ withTimezone: true }),
  finishedAt: timestamp({ withTimezone: true }),
  lastActivityAt: now(),
})

export const redemptions = pgTable(
  'redemptions',
  {
    id: serial().primaryKey(),
    orderId: integer()
      .notNull()
      .references(() => orders.id),
    stopIndex: integer().notNull(),
    stallId: integer()
      .notNull()
      .references(() => stalls.id),
    tastingId: integer()
      .notNull()
      .references(() => tastings.id),
    portions: integer().notNull(),
    feeAgorot: integer().notNull(),
    usedBackup: boolean().notNull().default(false),
    redeemedAt: now(),
  },
  (t) => [uniqueIndex('redemptions_order_stop').on(t.orderId, t.stopIndex)],
)

// One row per payment attempt (Tranzila hosted page).
export const paySessions = pgTable(
  'pay_sessions',
  {
    id: serial().primaryKey(),
    orderId: integer()
      .notNull()
      .references(() => orders.id),
    token: text().notNull().unique(),
    amountAgorot: integer().notNull(),
    // What was being bought when the window opened; a charge from an older window does not pay a changed order.
    priceKey: text().notNull().default(''),
    env: text().notNull(),
    provider: text().$type<'pelecard' | 'tranzila' | 'mock'>().notNull().default('tranzila'),
    status: text().$type<'open' | 'paid' | 'failed'>().notNull().default('open'),
    transactionId: text(),
    raw: jsonb(),
    createdAt: now(),
    settledAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('pay_sessions_txn').on(t.transactionId)],
)

export const leads = pgTable('leads', {
  id: serial().primaryKey(),
  companyName: text().notNull(),
  contactName: text().notNull(),
  phone: text().notNull().default(''),
  email: text().notNull().default(''),
  occasionKey: text(),
  people: integer(),
  preferredDate: text().notNull().default(''),
  message: text().notNull().default(''),
  status: text().$type<'new' | 'quoted' | 'won' | 'lost'>().notNull().default('new'),
  // Owner's notes on the lead (admin only).
  notes: text().notNull().default(''),
  orderId: integer().references(() => orders.id),
  createdAt: now(),
})

export const uploads = pgTable('uploads', {
  id: serial().primaryKey(),
  orderId: integer().references(() => orders.id),
  kind: text().$type<'photo' | 'logo' | 'map'>().notNull(),
  // Paths relative to the uploads root.
  originalPath: text().notNull(),
  path: text().notNull(),
  createdAt: now(),
})

// Outbound messages (email, WhatsApp), logged for the admin and for retries.
export const messages = pgTable('messages', {
  id: serial().primaryKey(),
  orderId: integer().references(() => orders.id),
  channel: text().$type<'email' | 'whatsapp'>().notNull(),
  to: text().notNull(),
  template: text().notNull(),
  status: text().$type<'queued' | 'sent' | 'failed' | 'skipped'>().notNull(),
  error: text(),
  createdAt: now(),
})
