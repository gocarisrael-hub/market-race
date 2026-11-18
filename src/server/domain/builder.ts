// Builds the frozen game snapshot for an order. Pure: the catalog is passed in.
// SPEC "Building the game": safety swap → backup stall → block and flag. Never silently shorten.
import { fillTemplate } from './template.ts'
import type {
  Form,
  GameSnapshot,
  LetterNote,
  OrderFlag,
  Palette,
  Question,
  RiddleTemplates,
  RouteStop,
  SnapshotStall,
  SnapshotStop,
  SnapshotTasting,
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
  }
  stalls: CatalogStall[]
  tastings: CatalogTasting[]
  riddles: CatalogRiddle[]
  questions: Question[]
  order: {
    form: Form
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

export function isSafe(t: CatalogTasting, allergens: string[], diets: string[]): boolean {
  if (!t.active) return false
  if (t.allergens.some((a) => allergens.includes(a))) return false
  return diets.every((d) => t.diets.includes(d))
}

export function buildGame(input: BuildInput): BuildResult {
  const { order } = input
  const stallById = new Map(input.stalls.map((s) => [s.id, s]))
  const tastingById = new Map(input.tastings.map((t) => [t.id, t]))
  const riddleById = new Map(input.riddles.map((r) => [r.id, r]))
  const flags: OrderFlag[] = []
  // Slot "name" is the honoree unless the buyer answered it explicitly.
  const answers: Record<string, string> = { name: order.honoreeName, ...order.answers }
  if (order.company && !answers.company_name) answers.company_name = order.company.name

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
  const safe = (t: CatalogTasting | undefined) => !!t && isSafe(t, order.allergens, order.diets)
  // Preferred tasting if safe, else the first other safe tasting at the stall.
  const pickTasting = (stallId: number, preferredId?: number | null) => {
    const preferred = preferredId != null ? tastingById.get(preferredId) : undefined
    if (preferred && preferred.stallId === stallId && safe(preferred)) return preferred
    return input.tastings.filter((t) => t.stallId === stallId && safe(t)).sort((a, b) => a.id - b.id)[0]
  }
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

  const photos = order.photos.slice(0, 5)
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
      photo: !finale ? (photos[index] ?? null) : null,
      backup:
        !swappedToBackup && backupStall && backupTasting
          ? { stall: snapStall(backupStall), tasting: snapTasting(backupTasting) }
          : null,
      swappedToBackup,
    })
  })

  const palette = order.company?.palette ?? input.theme.palette
  const game: GameSnapshot = {
    version: 1,
    builtAt: (input.now ?? new Date()).toISOString(),
    market: { ...input.market },
    theme: { id: input.theme.id, name: input.theme.name, map: input.theme.mapFile, palette: { ...palette } },
    company: order.company ? { name: order.company.name, logo: order.company.logo } : null,
    form: order.form,
    honoree: order.honoreeName,
    people: order.people,
    allergens: [...order.allergens],
    diets: [...order.diets],
    stops,
    letter: { notes: order.letterNotes.map((n) => ({ ...n })), photos },
  }
  return { game, flags }
}
