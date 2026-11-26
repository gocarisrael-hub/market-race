// The hand-drawn icon library (assets/icons/<category>/<name>.webp) and the original map
// illustrations (assets/icons/<name>.webp). Keys are paths without the extension. This module is
// light (no manifest) so the player and the site can resolve URLs without shipping the library;
// the admin and the server import the manifest from icon-manifest.generated.ts.
import { ICONS_VERSION, type IconKey } from './icon-keys.generated.ts'

export type { IconKey }

export const ICON_CATEGORIES = [
  { key: 'food', label: 'אוכל' },
  { key: 'bakery', label: 'מאפים' },
  { key: 'sweets', label: 'מתוקים' },
  { key: 'snacks', label: 'חטיפים' },
  { key: 'drinks', label: 'משקאות' },
  { key: 'produce', label: 'פירות וירקות' },
  { key: 'meat-fish', label: 'בשר ודגים' },
  { key: 'pantry', label: 'מזווה' },
  { key: 'herbs-spices', label: 'תבלינים ועשבים' },
  { key: 'market', label: 'שוק' },
  { key: 'holidays', label: 'חגים' },
  { key: 'game', label: 'משחק' },
  { key: 'reactions', label: 'תגובות' },
  { key: 'fun', label: 'כיף ומוזיקה' },
  { key: 'animals', label: 'חיות' },
  { key: 'nature', label: 'טבע ופרחים' },
  { key: 'city', label: 'עיר' },
  { key: 'travel', label: 'טיולים' },
  { key: 'ui', label: 'סמלים' },
] as const

export type IconCategory = (typeof ICON_CATEGORIES)[number]['key'] | 'classic'

export const CLASSIC_LABEL = 'איורי המפה'

export interface IconEntry {
  key: IconKey
  category: IconCategory
  /** Path under assets/icons. */
  file: string
  label: string
}

/** The original map illustrations, the only ones with recolored copies per theme (scripts/themes). */
export const CLASSIC_ICONS = [
  'awning',
  'coffee',
  'falafel',
  'flowers',
  'fruit',
  'gate',
  'hummus',
  'spices',
  'tomatoes',
] as const
const classic = new Set<string>(CLASSIC_ICONS)
/** Theme folders that hold recolored classics (every one but gate). */
const THEMED_CLASSICS = new Set<string>(CLASSIC_ICONS.filter((k) => k !== 'gate'))

/** Library keys have a category folder. Cheap shape check; the server checks against the manifest. */
export const looksLikeIconKey = (v: unknown): v is IconKey =>
  typeof v === 'string' && /^([a-z-]+\/)?[a-z0-9-]+$/.test(v)

/**
 * URL of an icon. `set` is a theme's recolored folder (ThemeStyle.icons): only the classics have
 * recolored copies; library icons get the theme's CSS treatment instead (see iconTreatment).
 */
export function iconUrl(key: IconKey | string, set?: string | null): string {
  if (set && THEMED_CLASSICS.has(key)) return `/static/icons/${set}/${key}.webp`
  return `/static/icons/${key}.webp?v=${ICONS_VERSION}`
}

/** True when the icon is drawn from the theme's recolored copy (so no CSS treatment applies). */
export const isRecolored = (key: string, set?: string | null) => !!set && THEMED_CLASSICS.has(key)

export const isClassicIcon = (key: string) => classic.has(key)
