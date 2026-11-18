import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  adjustForContrast,
  companyPalette,
  contrastRatio,
  dominantColors,
  fromHex,
  type RGB,
  toHex,
} from '../../src/server/domain/palette.ts'
import { paletteFromLogo } from '../../src/server/services/logo.ts'

const watercolor = { background: '#EADBC8', accent: '#B4161B', ink: '#2B2420', paper: '#FFFBF4' }
const night = { background: '#0B2B47', accent: '#AFC7AE', ink: '#08223A', paper: '#F3EFE4', dark: true }

/** RGBA buffer with `parts` of solid colors, in proportion. */
function pixels(parts: [RGB, number, number?][]): Uint8Array {
  const out: number[] = []
  for (const [c, n, a = 255] of parts) for (let i = 0; i < n; i++) out.push(c[0], c[1], c[2], a)
  return new Uint8Array(out)
}

describe('color math', () => {
  it('hex round trip and WCAG contrast', () => {
    expect(toHex([180, 22, 27])).toBe('#B4161B')
    expect(fromHex('#b4161b')).toEqual([180, 22, 27])
    expect(contrastRatio([0, 0, 0], [255, 255, 255])).toBeCloseTo(21, 1)
    expect(contrastRatio([255, 255, 255], [255, 255, 255])).toBe(1)
  })

  it('darkens a pale color until it reaches 3:1 on a light background', () => {
    const c = adjustForContrast([255, 220, 0], fromHex(watercolor.background))
    expect(contrastRatio(c, fromHex(watercolor.background))).toBeGreaterThanOrEqual(3)
  })
})

describe('dominant colors', () => {
  it('finds the colors by share, ignoring transparent pixels', () => {
    const sw = dominantColors(
      pixels([
        [[255, 255, 255], 600],
        [[10, 60, 200], 300],
        [[230, 30, 40], 100],
        [[0, 255, 0], 900, 0],
      ]),
      4,
    )
    expect(sw.map((s) => s.hex)).toEqual(['#FFFFFF', '#0A3CC8', '#E61E28'])
    expect(sw[0].share).toBeCloseTo(0.6, 2)
  })

  it('returns nothing for a fully transparent image', () => {
    expect(dominantColors(pixels([[[1, 2, 3], 10, 0]]))).toEqual([])
  })
})

describe('company palette', () => {
  it('picks the most present colorful color with contrast as accent, keeps theme bg and paper', () => {
    const sw = dominantColors(
      pixels([
        [[255, 255, 255], 600],
        [[10, 60, 200], 300],
        [[20, 20, 20], 100],
      ]),
    )
    const p = companyPalette(sw, watercolor)
    expect(p).toMatchObject({ background: '#EADBC8', paper: '#FFFBF4', accent: '#0A3CC8', ink: '#141414' })
    expect(contrastRatio(fromHex(p.accent), fromHex(p.background))).toBeGreaterThanOrEqual(3)
  })

  it('adjusts a pale brand color that lacks contrast, keeps the theme ink when the logo has no dark', () => {
    const sw = dominantColors(pixels([[[255, 210, 0], 500]]))
    const p = companyPalette(sw, watercolor)
    expect(p.ink).toBe(watercolor.ink)
    expect(contrastRatio(fromHex(p.accent), fromHex(watercolor.background))).toBeGreaterThanOrEqual(3)
    expect(p.accent).not.toBe('#FFD200')
  })

  it('on a dark theme picks a light accent and keeps the dark flag', () => {
    const sw = dominantColors(
      pixels([
        [[8, 34, 58], 500],
        [[255, 140, 0], 300],
      ]),
    )
    const p = companyPalette(sw, night)
    expect(p.accent).toBe('#FF8C00')
    expect(p.dark).toBe(true)
  })

  it('falls back to the theme accent with no colors', () => {
    expect(companyPalette([], watercolor).accent).toBe(watercolor.accent)
  })
})

describe('palette from a logo file (sharp)', () => {
  it('reads a generated PNG', async () => {
    const png = await sharp({
      create: { width: 120, height: 60, channels: 4, background: { r: 255, g: 255, b: 255, alpha: 0 } },
    })
      .composite([
        {
          input: await sharp({
            create: { width: 80, height: 60, channels: 4, background: { r: 0, g: 120, b: 80, alpha: 1 } },
          })
            .png()
            .toBuffer(),
          left: 0,
          top: 0,
        },
      ])
      .png()
      .toBuffer()
    const { swatches, palette } = await paletteFromLogo(png, watercolor)
    expect(swatches[0].hex).toBe('#007850')
    expect(swatches).toHaveLength(1)
    expect(palette.accent).toBe('#007850')
  })
})
