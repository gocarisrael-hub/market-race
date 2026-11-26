// Builds the frozen game snapshot for an order. Pure: the catalog is passed in.
// SPEC "Building the game": safety swap → backup stall → block and flag. Never silently shorten.
import { buildMinigames, type MinigameContent } from './minigames.ts'
import { fillTemplate } from './template.ts'
import { gameStyle } from './themes.ts'
import type {
  Decor,
  Form,
  GameSnapshot,
  LetterNote,
  OrderFlag,
  Palette,
  Question,
  Recipient,
  RiddleTemplates,
  RouteStop,
  SnapshotStall,
  SnapshotStop,
  SnapshotTasting,
  ThemeStyle,
} from './types.ts'

export interface CatalogStall {
  id: number
  name: string
  locationHint: string
  active: boolean
}
export interface CatalogTasting {
  id: number
  stallId: number
  name: string
  allergens: string[]
  diets: string[]
  feeAgorot: number
  active: boolean
}
export interface CatalogRiddle {
  id: number
  stallId: number
  answer: string
  accepted: string[]
  hint: string
  templates: RiddleTemplates
  afterText: string
  active: boolean
}

export interface BuildInput {
  market: { id: number; name: string }
  route: { id: number; stops: RouteStop[] }
  theme: {
    id: number
    name: string
    mapFile: string
    palette: Palette
    pins: Record<string, { x: number; y: number }>
    /** Fonts, treatment and illustrations (see ThemeStyle). */
    style?: ThemeStyle
  }
  /** The palette the buyer chose for the map; null/absent plays the theme's own palette. */
  palette?: { id: number; palette: Palette } | null
  /** The occasion's doodle set. */
  decor?: Decor
  /** The occasion addresses its players in the feminine plural (a bachelorette). */
  playersFeminine?: boolean
  stalls: CatalogStall[]
  tastings: CatalogTasting[]
  riddles: CatalogRiddle[]
  questions: Question[]
  /** The `minigames` setting. Absent: the game has no mini-games. */
  minigames?: MinigameContent
  /** The order's occasion (the mini-games an occasion prefers, see MinigameContent.byOccasion). */
  occasionKey?: string
  /** Makes the random choices of a sold game reproducible (the order number). */
  seed?: string
  order: {
    form: Form
    /** Who the game is for; null for a company game. */
    recipient?: Recipient | null
    honoreeName: string
    people: number
    allergens: string[]
    diets: string[]
    answers: Record<string, string>
    letterNotes: LetterNote[]
    photos: string[]
    company: { name: string; logo: string | null; palette: Palette | null } | null
  }
  now?: Date
}

export interface BuildResult {
  game: GameSnapshot
  flags: OrderFlag[]
}

/**
 * The answers riddles are filled from: the buyer's, plus the slots the order itself names.
 * "name" is the honoree unless answered explicitly; a group's name is always the honoree field
 * (the site asks it there); a company's name fills company_name.
 */
export function defaultAnswers(order: {
  form: Form
  honoreeName: string
  answers: Record<string, string>
  company?: { name: string } | null
}): Record<string, string> {
  const answers: Record<string, string> = { name: order.honoreeName, ...order.answers }
  if (order.form === 'group' && order.honoreeName.trim()) answers.group_name = order.honoreeName
  if (order.company && !answers.company_name) answers.company_name = order.company.name
  return answers
}

export function isSafe(t: CatalogTasting, allergens: string[], diets: string[]): boolean {
  if (!t.active) return false
  if (t.allergens.some((a) => allergens.includes(a))) return false
  return diets.every((d) => t.diets.includes(d))
}

/**
 * The tasting a stop serves at a stall: the preferred one if safe, else the first other safe
 * tasting at the stall (lowest id). Undefined when the stall has nothing safe.
 */
export function pickSafeTasting<T extends CatalogTasting>(
  tastings: T[],
  stallId: number,
  preferredId: number | null | undefined,
  allergens: string[],
  diets: string[],
): T | undefined {
  const preferred = preferredId != null ? tastings.find((t) => t.id === preferredId) : undefined
  if (preferred && preferred.stallId === stallId && isSafe(preferred, allergens, diets)) return preferred
  return tastings
    .filter((t) => t.stallId === stallId && isSafe(t, allergens, diets))
    .sort((a, b) => a.id - b.id)[0]
}

export type PreviewStatus = 'as_listed' | 'swapped' | 'blocked'
export interface PreviewStop<T> {
  index: number
  finale: boolean
  status: PreviewStatus
  /** What will be served: the listed tasting, its safe replacement, or (blocked) the listed one. */
  tasting: T | undefined
}

/**
 * Before purchase: what each stop of a route serves for a set of allergens and diets. Same safety
 * order as buildGame (listed tasting → other safe tasting at the stall → backup stall). Riddles are
 * not considered: the form is not known yet and a missing riddle is a catalog error, not the buyer's.
 */
export function previewRoute<T extends CatalogTasting>(input: {
  stops: RouteStop[]
  stalls: CatalogStall[]
  tastings: T[]
  allergens: string[]
  diets: string[]
}): PreviewStop<T>[] {
  const { allergens, diets } = input
  const stallById = new Map(input.stalls.map((s) => [s.id, s]))
  const usable = (id: number | null | undefined) => (id != null ? stallById.get(id)?.active : false)
  const listedById = new Map(input.tastings.map((t) => [t.id, t]))
  return input.stops.map((stop, index) => {
    const finale = index === input.stops.length - 1
    const listed = listedById.get(stop.tastingId)
    const main = usable(stop.stallId)
      ? pickSafeTasting(input.tastings, stop.stallId, stop.tastingId, allergens, diets)
      : undefined
    if (main)
      return { index, finale, status: main.id === stop.tastingId ? 'as_listed' : 'swapped', tasting: main }
    const backup = usable(stop.backupStallId)
      ? pickSafeTasting(input.tastings, stop.backupStallId!, stop.backupTastingId, allergens, diets)
      : undefined
    if (backup) return { index, finale, status: 'swapped', tasting: backup }
    return { index, finale, status: 'blocked', tasting: listed }
  })
}

export function buildGame(input: BuildInput): BuildResult {
  const { order } = input
  const stallById = new Map(input.stalls.map((s) => [s.id, s]))
  const tastingById = new Map(input.tastings.map((t) => [t.id, t]))
  const riddleById = new Map(input.riddles.map((r) => [r.id, r]))
  const flags: OrderFlag[] = []
  // Slot "name" is the honoree unless the buyer answered it explicitly.
  const answers = defaultAnswers(order)

  const snapStall = (s: CatalogStall): SnapshotStall => ({
    id: s.id,
    name: s.name,
    locationHint: s.locationHint,
    pin: input.theme.pins[String(s.id)] ?? null,
  })
  const snapTasting = (t: CatalogTasting): SnapshotTasting => ({
    id: t.id,
    name: t.name,
    allergens: [...t.allergens],
    diets: [...t.diets],
    feeAgorot: t.feeAgorot,
  })
  const pickTasting = (stallId: number, preferredId?: number | null) =>
    pickSafeTasting(input.tastings, stallId, preferredId, order.allergens, order.diets)
  const usableStall = (id: number | null | undefined) => {
    const s = id != null ? stallById.get(id) : undefined
    return s?.active ? s : undefined
  }
  const riddleFor = (stallId: number, preferredId?: number | null) => {
    const preferred = preferredId != null ? riddleById.get(preferredId) : undefined
    if (preferred?.active && preferred.stallId === stallId && preferred.templates[order.form])
      return preferred
    return input.riddles
      .filter((r) => r.stallId === stallId && r.active && r.templates[order.form])
      .sort((a, b) => a.id - b.id)[0]
  }

  const stops: SnapshotStop[] = []
  input.route.stops.forEach((stop, index) => {
    const finale = index === input.route.stops.length - 1
    let stall = usableStall(stop.stallId)
    let tasting = stall ? pickTasting(stall.id, stop.tastingId) : undefined
    let riddle = stall ? riddleFor(stall.id, stop.riddleId) : undefined
    let swappedToBackup = false

    // Day-of backup option (stall closed on the day): a safe tasting at the backup stall.
    const backupStall = usableStall(stop.backupStallId)
    const backupTasting = backupStall ? pickTasting(backupStall.id, stop.backupTastingId) : undefined

    if (!stall || !tasting || !riddle) {
      const bRiddle = backupStall ? riddleFor(backupStall.id, stop.backupRiddleId) : undefined
      if (backupStall && backupTasting && bRiddle) {
        stall = backupStall
        tasting = backupTasting
        riddle = bRiddle
        swappedToBackup = true
      }
    }

    if (!stall || !tasting || !riddle) {
      const s = stallById.get(stop.stallId)
      const reason = !s?.active
        ? 'הדוכן לא פעיל'
        : !tasting
          ? 'אין טעימה בטוחה לאלרגיות/תזונה'
          : 'אין חידה בצורה הזו'
      flags.push({
        code: 'blocked_stop',
        stopIndex: index,
        message: `תחנה ${index + 1} (${s?.name ?? '?'}): ${reason}, וגם לגיבוי אין חלופה`,
      })
      // Keep the stop in place with what we have so the owner can see and fix it.
      stall = s ?? { id: stop.stallId, name: '?', locationHint: '', active: false }
      tasting = tasting ?? tastingById.get(stop.tastingId)
      riddle = riddle ?? riddleById.get(stop.riddleId)
    }

    const template = riddle?.templates[order.form] ?? ''
    const filled = fillTemplate(template, answers, input.questions, order.form)
    for (const slot of filled.missing)
      flags.push({
        code: 'empty_required',
        slot,
        stopIndex: index,
        message: `חסר מילוי ל-{${slot}} בתחנה ${index + 1}`,
      })

    const t = tasting ?? {
      id: 0,
      stallId: stall.id,
      name: '?',
      allergens: [],
      diets: [],
      feeAgorot: 0,
      active: false,
    }
    stops.push({
      index,
      finale,
      stall: snapStall(stall),
      tasting: snapTasting(t),
      riddle: {
        id: riddle?.id ?? 0,
        parts: filled.parts,
        answer: riddle?.answer ?? '',
        accepted: [...(riddle?.accepted ?? [])],
        hint: riddle?.hint ?? '',
        afterText: riddle?.afterText ?? '',
      },
      photo: null,
      backup:
        !swappedToBackup && backupStall && backupTasting
          ? { stall: snapStall(backupStall), tasting: snapTasting(backupTasting) }
          : null,
      swappedToBackup,
    })
  })

  // A company's colors win over the buyer's palette, which wins over the theme's own.
  const palette = order.company?.palette ?? input.palette?.palette ?? input.theme.palette
  const game: GameSnapshot = {
    version: 1,
    builtAt: (input.now ?? new Date()).toISOString(),
    market: { ...input.market },
    theme: {
      id: input.theme.id,
      name: input.theme.name,
      map: input.theme.mapFile,
      palette: { ...palette },
      paletteId: order.company?.palette ? null : (input.palette?.id ?? null),
      style: gameStyle(input.theme.style, palette === input.theme.palette),
    },
    decor: input.decor ?? 'generic',
    company: order.company ? { name: order.company.name, logo: order.company.logo } : null,
    form: order.form,
    recipient: order.recipient ?? null,
    playersFeminine: input.playersFeminine ?? false,
    honoree: order.honoreeName,
    people: order.people,
    allergens: [...order.allergens],
    diets: [...order.diets],
    stops,
    letter: { notes: order.letterNotes.map((n) => ({ ...n })), photos: [] },
  }
  if (input.minigames)
    game.minigames = buildMinigames({
      form: order.form,
      answers,
      questions: input.questions,
      photos: [...new Set(order.photos.filter((p) => typeof p === 'string' && p.trim()))],
      letterNotes: order.letterNotes,
      content: input.minigames,
      occasionKey: input.occasionKey,
      stopCount: stops.length,
      riddleSlots: stops.map((s) => s.riddle.parts.flatMap((p) => (p.t === 'slot' ? [p.slot] : []))),
      seed: input.seed ?? game.builtAt,
    })
  return { game: attachPhotos(game, order.photos), flags }
}

export const MAX_GAME_PHOTOS = 5

/**
 * Puts the order's photos into a game: riddle stop i gets photo i (the finale has its own
 * celebration, no photo), and the letter gets them all. Pure; also used to update the photos of
 * a built game that has not started, without rebuilding it from the (possibly edited) catalog.
 */
export function attachPhotos(game: GameSnapshot, photos: string[]): GameSnapshot {
  const list = [...new Set(photos.filter((p) => typeof p === 'string' && p.trim()))].slice(0, MAX_GAME_PHOTOS)
  // The photo game asks about the first photo: it follows the list, and goes when there is none.
  const minigames = game.minigames
    ?.filter((g) => g.type !== 'photo' || list.length > 0)
    .map((g) => (g.type === 'photo' ? { ...g, photo: list[0] } : g))
  return {
    ...game,
    stops: game.stops.map((s, i) => ({ ...s, photo: s.finale ? null : (list[i] ?? null) })),
    letter: { ...game.letter, photos: list },
    ...(minigames ? { minigames } : {}),
  }
}
