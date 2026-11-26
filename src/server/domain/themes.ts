// Which game styles (themes) an order can pick, and what of a style a built game keeps.
import type { ThemeStyle } from './types.ts'

export interface Offerable {
  occasionKeys: string[]
  recipients: string[]
}

/**
 * Whether a style is offered for an occasion and recipient. An empty list offers it for every
 * occasion (or recipient); the recipient filter is skipped when there is none (company games).
 */
export function offeredFor(t: Offerable, occasionKey: string | null | undefined, recipient?: string | null) {
  if (t.occasionKeys.length && (!occasionKey || !t.occasionKeys.includes(occasionKey))) return false
  if (t.recipients.length && recipient && !t.recipients.includes(recipient)) return false
  return true
}

/** The styles offered for an occasion and recipient, in their order. */
export const themesFor = <T extends Offerable>(
  list: T[],
  occasionKey: string | null | undefined,
  recipient?: string | null,
) => list.filter((t) => offeredFor(t, occasionKey, recipient))

/**
 * The style a game is built with. Its fixed colors belong to the theme's own palette: a game
 * played in another palette (a buyer's variant or a company's colors) derives them instead.
 */
export function gameStyle(style: ThemeStyle | null | undefined, ownPalette: boolean): ThemeStyle {
  const s = { ...(style ?? {}) }
  if (!ownPalette) delete s.colors
  return s
}
