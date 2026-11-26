// A game style in the browser: its display font, loaded on demand, and its colors as CSS
// variables for the site's small previews (the player sets the full set itself, see App.tsx).
import { fontHref, fontOf, themeVars } from '../../server/domain/look.ts'
import type { Palette, ThemeStyle } from '../../server/domain/types.ts'

/** Adds a style's display font stylesheet once; nothing is loaded for styles never shown. */
export function loadThemeFont(style: ThemeStyle | null | undefined) {
  if (typeof document === 'undefined') return
  const href = fontHref(style)
  if (document.querySelector(`link[data-font="${CSS.escape(href)}"]`)) return
  const link = document.createElement('link')
  link.rel = 'stylesheet'
  link.href = href
  link.dataset.font = href
  document.head.appendChild(link)
}

/**
 * The style's look as variables with a prefix (`--pv-bg`, `--bm-ribbon`...): colors, the display
 * font and its scale, as the game would draw them.
 */
export function lookVars(palette: Palette, style: ThemeStyle | null | undefined, prefix: string) {
  const v = themeVars(palette, style ?? {})
  const font = fontOf(style)
  return {
    [`--${prefix}-bg`]: v['--bg'],
    [`--${prefix}-ribbon`]: v['--ribbon'],
    [`--${prefix}-ribbon-tail`]: v['--ribbon-tail'],
    [`--${prefix}-ribbon-line`]: v['--ribbon-line'],
    [`--${prefix}-on-ribbon`]: v['--on-ribbon'],
    [`--${prefix}-accent`]: v['--button'],
    [`--${prefix}-button-line`]: v['--button-line'],
    [`--${prefix}-on-accent`]: v['--on-accent'],
    [`--${prefix}-ink`]: v['--ink'],
    [`--${prefix}-sheet-line`]: v['--sheet-line'],
    [`--${prefix}-mark`]: v['--mark'],
    [`--${prefix}-font`]: v['--hand'],
    [`--${prefix}-weight`]: String(font.weight),
    [`--${prefix}-hs`]: String(font.scale),
  } as Record<string, string>
}
