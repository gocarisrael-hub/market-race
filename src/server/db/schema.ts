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
  Decor,
  Form,
  GameSnapshot,
  HintQuestion,
  LetterNote,
  MarketHours,
  OccasionRecipients,
  OrderFlag,
  OrderStatus,
  Palette,
  PhotoBackground,
  Question,
  Recipient,
  RecipientLabels,
  RiddleTemplates,
  RouteStop,
  ThemeStyle,
} from '../domain/types.ts'

const now = () => timestamp({ withTimezone: true }).notNull().defaultNow()
// When a row last changed (set on every ORM update): the demo refresh leaves rows the admin
// edited after it alone.
const updatedAt = () =>
  timestamp({ withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())
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
  // Shown to buyers before purchase, without the stall's name (stalls are the riddles' answers).
  teaser: text().notNull().default(''),
  // File name (no extension) of an illustration in assets/icons, or null.
  teaserIcon: text(),
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
  updatedAt: updatedAt(),
})

export const questionSets = pgTable('question_sets', {
  id: serial().primaryKey(),
  name: text().notNull(),
  questions: jsonb().$type<Question[]>().notNull().default([]),
  createdAt: now(),
  updatedAt: updatedAt(),
})

// An occasion (private) or company type. Admin can add more.
export const occasions = pgTable('occasions', {
  id: serial().primaryKey(),
  key: text().notNull().unique(),
  label: text().notNull(),
  audience: text().$type<'private' | 'company'>().notNull(),
  questionSetId: integer().references(() => questionSets.id),
  forms: text().array().$type<Form[]>().notNull(),
  // Who a private game can be for, each with its question set (null: questionSetId). Kept in step
  // with `forms`. Empty on rows saved before recipients existed: derived from `forms`.
  recipients: jsonb().$type<OccasionRecipients>().notNull().default({}),
  // How the order names each recipient on this occasion (e.g. "לילדה" on a kid's birthday); a
  // missing or empty one uses the site's default ("למישהי").
  recipientLabels: jsonb().$type<RecipientLabels>().notNull().default({}),
  // The players are addressed in the feminine plural (a bachelorette), whoever the game is for.
  playersFeminine: boolean().notNull().default(false),
  // Doodle set drawn around the game and the order flow (see DECORS).
  decor: text().$type<Decor>().notNull().default('generic'),
  sort: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  updatedAt: updatedAt(),
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

// A game style: the map it is drawn on, its palette and its look (fonts, treatment, illustrations),
// and the occasions it is offered for.
export const themes = pgTable('themes', {
  id: serial().primaryKey(),
  // Stable key of a seeded style (the demo refresh finds it by this); null for the owner's own.
  key: text().unique(),
  name: text().notNull(),
  marketId: integer()
    .notNull()
    .references(() => markets.id),
  // Path relative to the uploads root, or "builtin:<file>" for maps shipped in assets/maps.
  mapFile: text().notNull(),
  palette: jsonb().$type<Palette>().notNull(),
  // Stall pins on this map, in percent of the image: { [stallId]: { x, y } }.
  pins: jsonb().$type<Record<string, { x: number; y: number }>>().notNull().default({}),
  style: jsonb().$type<ThemeStyle>().notNull().default({}),
  // The occasion keys (and recipients) it is offered for; empty: every one.
  occasionKeys: textArray(),
  recipients: text().array().$type<Recipient[]>().notNull().default(sql`'{}'::text[]`),
  sort: integer().notNull().default(0),
  active: boolean().notNull().default(true),
  updatedAt: updatedAt(),
})

// A color palette the buyer can play a map in. Separate from the map: one palette can serve several
// themes (maps), and a map is offered in every active palette that lists it.
export const palettes = pgTable('palettes', {
  id: serial().primaryKey(),
  name: text().notNull(),
  palette: jsonb().$type<Palette>().notNull(),
  themeIds: integer().array().notNull().default(sql`'{}'::integer[]`),
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
  // Who the game is for (she, he, couple, group, family); null for company games. Picks the
  // question set with the occasion. Orders placed before it existed are mapped from `form`.
  recipient: text().$type<Recipient>(),
  honoreeName: text().notNull().default(''),
  themeId: integer().references(() => themes.id),
  // The palette the buyer chose; null plays the theme's own palette. A company palette wins.
  paletteId: integer().references(() => palettes.id, { onDelete: 'set null' }),
  routeId: integer().references(() => routes.id),
  people: integer().notNull().default(2),
  allergens: textArray(),
  diets: textArray(),
  answers: jsonb().$type<Record<string, string>>().notNull().default({}),
  letterNotes: jsonb().$type<LetterNote[]>().notNull().default([]),
  // Optional personal questions about the honoree, asked in the game to unlock a riddle's hint.
  // The answers never reach the player client.
  hintQuestions: jsonb().$type<HintQuestion[]>().notNull().default([]),
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
  // "minigame": a personal mini-game between stops (the one placed before stop `stopIndex`).
  step: text()
    .$type<'opening' | 'riddle' | 'revealed' | 'redeem' | 'minigame' | 'done'>()
    .notNull()
    .default('opening'),
  hintsShown: integer().array().notNull().default(sql`'{}'::integer[]`),
  // Stops where the stall was closed on the day and the backup stall was used.
  backupStops: integer().array().notNull().default(sql`'{}'::integer[]`),
  wrongAnswers: integer().notNull().default(0),
  // Mini-games (by index in the snapshot) solved, and skipped by the captain.
  minigamesSolved: integer().array().notNull().default(sql`'{}'::integer[]`),
  minigamesSkipped: integer().array().notNull().default(sql`'{}'::integer[]`),
  // How many players arrived, chosen by the captain (the buyer) at the start, 1..people bought.
  // Every stall serves this many portions; null on games started before it existed (= people).
  players: integer(),
  // Bumped on every change; clients poll and re-render when it moves.
  version: integer().notNull().default(0),
  startedAt: timestamp({ withTimezone: true }),
  // Set while the captain has paused the game ("עוצרים להיום"); null while it is playable.
  // Resumed from the manage link, any day it is valid, at the same stop.
  pausedAt: timestamp({ withTimezone: true }),
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
  // What is shown and played: for a photo, the illustration matching `background`.
  path: text().notNull(),
  createdAt: now(),
  // Photos only. The buyer's choice: keep the background, or cut the subject out (Dugri's
  // in-browser cutout, src/web/shared/cutout.ts) and draw it on paper (photos/doodle-frame.ts).
  background: text().$type<PhotoBackground>().notNull().default('keep'),
  // The illustration with the background (null on rows made before the choice: then `path`).
  bgPath: text(),
  // The transparent PNG cut in the buyer's browser, and its illustration on paper.
  cutoutPath: text(),
  cutPath: text(),
  // The buyer asked for a cutout and the browser could not make one (no subject found, old device).
  cutFailed: boolean().notNull().default(false),
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
