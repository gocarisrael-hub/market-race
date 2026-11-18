// The prototype photo styles (src/server/photos/styles.ts): every style renders every mode it
// offers as a 4:5 JPEG, numbered 1..n with Hebrew names, and refuses a cutout mode without one.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { PHOTO_STYLES } from '../../src/server/photos/styles.ts'

const input = {
  photo: readFileSync('tests/fixtures/dog-on-grass.jpg'),
  cutout: readFileSync('tests/fixtures/dog-on-grass-cut.png'),
}
const icons = [readFileSync('assets/icons/falafel.png')]

describe('photo styles', () => {
  it('are 10 to 20, numbered in order, each with a Hebrew name and line', () => {
    expect(PHOTO_STYLES.length).toBeGreaterThanOrEqual(10)
    expect(PHOTO_STYLES.length).toBeLessThanOrEqual(20)
    PHOTO_STYLES.forEach((s, i) => {
      expect(s.no).toBe(i + 1)
      expect(s.name).toMatch(/[֐-׿]/)
      expect(s.line).toMatch(/[֐-׿]/)
      expect(s.modes.length).toBeGreaterThan(0)
    })
    expect(new Set(PHOTO_STYLES.map((s) => s.id)).size).toBe(PHOTO_STYLES.length)
    expect(PHOTO_STYLES.some((s) => s.modes.includes('cut'))).toBe(true)
    expect(PHOTO_STYLES.some((s) => s.modes.includes('bg'))).toBe(true)
  })

  for (const style of PHOTO_STYLES)
    it(`${style.no} ${style.id} renders ${style.modes.join(' and ')}`, async () => {
      for (const mode of style.modes) {
        const out = await style.render(input, mode, { width: 200, icons, seed: 1 })
        const meta = await sharp(out).metadata()
        expect(meta.format).toBe('jpeg')
        expect(meta.width).toBe(200)
        expect(meta.height).toBe(250)
        const { data } = await sharp(out).greyscale().raw().toBuffer({ resolveWithObject: true })
        const mean = data.reduce((s, v) => s + v, 0) / data.length
        const variance = data.reduce((s, v) => s + (v - mean) ** 2, 0) / data.length
        expect(variance).toBeGreaterThan(100) // a picture, not a flat sheet
      }
      if (style.modes.includes('cut'))
        await expect(style.render({ photo: input.photo }, 'cut', { width: 120 })).rejects.toThrow()
    })
})
