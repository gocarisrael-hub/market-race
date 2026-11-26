import { describe, expect, it } from 'vitest'
import type { Palette } from '../../src/server/domain/types.ts'
import { mapFrame, ribbonFontSize, splitQuestion, trailPath } from '../../src/web/player/logic.ts'
import { contrast, readableOn, shade, themeVars } from '../../src/web/player/theme.ts'

// The seeded themes (src/server/services/seed-demo.ts).
const THEMES: Record<string, Palette> = {
  watercolor: { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' },
  riso: { background: '#737FB0', accent: '#F3859F', accent2: '#0A297D', ink: '#0A297D', paper: '#F6EEF2' },
  night: { background: '#0B2B47', accent: '#AFC7AE', ink: '#08223A', paper: '#F3EFE4', dark: true },
}

describe('theme colors', () => {
  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 0)
    expect(contrast('#777777', '#777777')).toBeCloseTo(1, 5)
    expect(contrast('nope', '#fff')).toBe(1)
  })

  it('darkens until readable', () => {
    expect(contrast(readableOn('#F3859F', '#F6EEF2'), '#F6EEF2')).toBeGreaterThanOrEqual(3.2)
    expect(shade('#808080', 0.5)).toBe('#404040')
  })

  for (const [name, p] of Object.entries(THEMES)) {
    it(`keeps ${name} readable`, () => {
      const v = themeVars(p)
      expect(contrast(v['--on-bg'], p.background), 'text on background').toBeGreaterThanOrEqual(3)
      expect(contrast(v['--on-accent'], p.accent), 'button text').toBeGreaterThanOrEqual(3)
      expect(contrast(v['--on-ribbon'], v['--ribbon']), 'ribbon text').toBeGreaterThanOrEqual(3)
      expect(contrast(v['--slot'], p.paper), 'personal text on paper').toBeGreaterThanOrEqual(3)
      expect(contrast(p.ink, p.paper), 'riddle text').toBeGreaterThanOrEqual(4.5)
    })
  }

  it('uses the accent as is when it already reads (watercolor)', () => {
    const v = themeVars(THEMES.watercolor)
    expect(v['--slot']).toBe('#B4161B')
    expect(v['--on-accent']).toBe('#FFFFFF')
    expect(v['--on-bg']).toBe('#2B2420')
  })

  it('uses light text on the night theme and ink text on riso buttons', () => {
    expect(themeVars(THEMES.night)['--on-bg']).toBe('#F3EFE4')
    expect(themeVars(THEMES.riso)['--on-accent']).toBe('#0A297D')
    expect(themeVars(THEMES.riso)['--ribbon']).toBe('#0A297D')
  })
})

describe('splitQuestion', () => {
  const text = (v: string) => ({ t: 'text' as const, v })
  const slot = (v: string) => ({ t: 'slot' as const, v, slot: 'x' })

  it('sets a short final question apart', () => {
    const r = splitQuestion([text('מאז '), slot('יואב'), text(', היא עוד לא אבדה. מה היא?')])
    expect(r.question).toBe('מה היא?')
    expect(r.body).toEqual([text('מאז '), slot('יואב'), text(', היא עוד לא אבדה.')])
  })

  it('leaves long questions and texts without a question alone', () => {
    const long = [text('נכנסים ביום שישי. איך קוראים למאפה התימני שיוצא בשבת בבוקר?')]
    expect(splitQuestion(long).question).toBeNull()
    expect(splitQuestion([text('בלי שאלה.')]).question).toBeNull()
    expect(splitQuestion([text('מה אני?')]).question).toBeNull()
    expect(splitQuestion([slot('מה?')]).question).toBeNull()
    expect(splitQuestion([]).question).toBeNull()
  })

  it('takes the question off the last line of a multi-line riddle', () => {
    const r = splitQuestion([text('שורה ראשונה,\nו'), slot('מיכל'), text(' יודעת.\nמה היא?')])
    expect(r.question).toBe('מה היא?')
    expect(r.body).toEqual([text('שורה ראשונה,\nו'), slot('מיכל'), text(' יודעת.')])
  })

  it('splits after a colon too', () => {
    expect(splitQuestion([text('לכבוד '), slot('מיכל'), text(' מרימים כוסות: מה אומרים?')]).question).toBe(
      'מה אומרים?',
    )
  })
})

describe('mapFrame', () => {
  const pins = [
    { x: 0, y: 0 },
    { x: 100, y: 100 },
    { x: 78, y: 70 },
    { x: 22, y: 20 },
    { x: 50, y: 50 },
  ]
  for (const pin of pins) {
    it(`covers the frame and lands the pin where it says (${pin.x},${pin.y})`, () => {
      const ratio = 1.42
      const frame = 0.9
      const f = mapFrame(pin, ratio, frame, 1.8)
      const hPct = (f.width * ratio) / frame // image height in % of the frame height
      // No blank edges.
      expect(f.left).toBeLessThanOrEqual(0)
      expect(f.top).toBeLessThanOrEqual(0)
      expect(f.left + f.width).toBeGreaterThanOrEqual(100 - 1e-9)
      expect(f.top + hPct).toBeGreaterThanOrEqual(100 - 1e-9)
      // The marker is on the pin.
      expect(f.x).toBeCloseTo(f.left + (pin.x / 100) * f.width, 6)
      expect(f.y).toBeCloseTo(f.top + (pin.y / 100) * hPct, 6)
      expect(f.x).toBeGreaterThanOrEqual(0)
      expect(f.x).toBeLessThanOrEqual(100)
    })
  }

  it('aims a central pin at the preferred spot', () => {
    const f = mapFrame({ x: 50, y: 50 }, 1.42, 0.9, 1.8)
    expect(f.x).toBeCloseTo(58, 6)
    expect(f.y).toBeCloseTo(42, 6)
  })

  it('draws a trail that ends next to the pin', () => {
    expect(trailPath(60, 40)).toMatch(/^M12 94 .* 60 45$/)
    expect(trailPath(30, 40)).toMatch(/^M88 94 /)
  })
})

describe('ribbonFontSize', () => {
  it('shrinks for long names, within bounds', () => {
    expect(ribbonFontSize('המירוץ של מיכל')).toBeLessThanOrEqual(46)
    expect(ribbonFontSize('קצר')).toBe(46)
    expect(ribbonFontSize('המירוץ של צוות המכירות והשיווק הארצי')).toBe(26)
  })
})
