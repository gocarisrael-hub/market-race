// The order's look for its game photos: the occasion's doodle set and the palette the game plays
// in, and the renderer that draws a photo in it (doodle-frame.ts), seeded by the photo's id.
import { eq } from 'drizzle-orm'
import type { DB } from '../db/index.ts'
import { occasions, type orders, palettes, themes } from '../db/schema.ts'
import { isDecor } from '../domain/types.ts'
import {
  DEFAULT_FRAME_COLORS,
  doodleFrameCutout,
  doodleFramePhoto,
  type FrameColors,
} from './doodle-frame.ts'

export interface PhotoLook {
  decor: string
  palette: FrameColors
}

type OrderRow = typeof orders.$inferSelect

/**
 * A built game's own decor and palette; before the build, the occasion's set and the palette the
 * build will use (company colors, then the buyer's palette, then the theme's).
 */
export async function photoLook(db: DB, order: OrderRow): Promise<PhotoLook> {
  let decor = order.game && isDecor(order.game.decor) ? order.game.decor : null
  if (!decor) {
    const [occ] = await db
      .select({ decor: occasions.decor })
      .from(occasions)
      .where(eq(occasions.key, order.occasionKey))
    decor = isDecor(occ?.decor) ? occ.decor : 'generic'
  }
  let pal = order.game?.theme.palette ?? order.companyPalette ?? null
  if (!pal && order.paletteId) {
    const [p] = await db.select().from(palettes).where(eq(palettes.id, order.paletteId))
    pal = p?.palette ?? null
  }
  if (!pal && order.themeId) {
    const [t] = await db.select({ palette: themes.palette }).from(themes).where(eq(themes.id, order.themeId))
    pal = t?.palette ?? null
  }
  return {
    decor,
    palette: pal
      ? { paper: pal.paper, ink: pal.ink, accent: pal.accent, accent2: pal.accent2 }
      : DEFAULT_FRAME_COLORS,
  }
}

/** A game photo in the live look: with its background ('bg', from the photo) or cut ('cut'). */
export function renderGamePhoto(input: Buffer, mode: 'bg' | 'cut', photoId: number, look: PhotoLook) {
  const opts = { seed: photoId, decor: look.decor, palette: look.palette }
  return mode === 'bg' ? doodleFramePhoto(input, opts) : doodleFrameCutout(input, opts)
}
