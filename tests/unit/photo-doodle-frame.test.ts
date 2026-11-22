// The live game-photo look (src/server/photos/doodle-frame.ts): the photo stays sharp in a drawn
// frame, 6 to 10 doodles of the occasion's set round it, seeded by the photo's id: the same photo
// always draws the same, different photos draw differently, and no doodle touches the subject.
import { readFileSync } from 'node:fs'
import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import { doodleData } from '../../scripts/gen-photo-doodles.ts'
import {
  DOODLE_REACH,
  DOODLES_MAX,
  DOODLES_MIN,
  doodleFrameCutout,
  doodleFramePhoto,
  type FrameMode,
  planDoodles,
  renderDoodleFrame,
  rngOf,
} from '../../src/server/photos/doodle-frame.ts'
import { DECOR_DOODLES, DOODLE_SVG } from '../../src/server/photos/doodles.generated.ts'
import { DECOR_SETS } from '../../src/web/shared/decor.tsx'

const DOG = readFileSync('tests/fixtures/dog-on-grass.jpg')
const DOG_CUT = readFileSync('tests/fixtures/dog-on-grass-cut.png')
const input = (m: FrameMode) => (m === 'bg' ? DOG : DOG_CUT)
const palette = { paper: '#FFFBF4', ink: '#2B2420', accent: '#B4161B', accent2: '#1F5E8C' }
const MODES: FrameMode[] = ['bg', 'cut']

describe('doodles for the server', () => {
  it('are the site’s own drawings and sets (regenerate with scripts/gen-photo-doodles.ts)', () => {
    const { svgs, sets } = doodleData()
    expect(DOODLE_SVG).toEqual(svgs)
    expect(DECOR_DOODLES).toEqual(sets)
    for (const set of Object.values(DECOR_SETS)) for (const n of set) expect(DOODLE_SVG[n]).toBeTruthy()
  })
})

describe('doodle frame', () => {
  it('renders both modes as a 4:5 JPEG', async () => {
    const bg = await sharp(await doodleFramePhoto(DOG, { seed: 1, height: 250 })).metadata()
    expect([bg.format, bg.width, bg.height]).toEqual(['jpeg', 200, 250])
    const cut = await sharp(await doodleFrameCutout(DOG_CUT, { seed: 1 })).metadata()
    expect([cut.format, cut.width, cut.height]).toEqual(['jpeg', 800, 1000])
  })

  it('is the same for the same seed, byte for byte', async () => {
    for (const m of MODES) {
      const opts = { seed: 42, decor: 'love', palette, height: 300 }
      const a = await (m === 'bg' ? doodleFramePhoto : doodleFrameCutout)(input(m), opts)
      const b = await (m === 'bg' ? doodleFramePhoto : doodleFrameCutout)(input(m), opts)
      expect(a.equals(b)).toBe(true)
    }
  })

  it('varies the doodles, their places, turns and colors from seed to seed', async () => {
    for (const m of MODES) {
      const plans = []
      for (let seed = 1; seed <= 6; seed++)
        plans.push(
          (await renderDoodleFrame(input(m), m, { seed, decor: 'birthday', palette, height: 400 })).doodles,
        )
      const keys = plans.map((p) => p.map((d) => `${d.name}@${Math.round(d.x)},${Math.round(d.y)}`).join('|'))
      expect(new Set(keys).size).toBe(6)
      // Different selections, not just shifted places.
      const picks = plans.map((p) => [...new Set(p.map((d) => d.name))].sort().join(','))
      expect(new Set(picks).size).toBeGreaterThanOrEqual(4)
      const turns = plans.flat().map((d) => d.rotate)
      expect(Math.max(...turns) - Math.min(...turns)).toBeGreaterThan(20)
      const colors = new Set(plans.flat().map((d) => d.color))
      expect(colors.size).toBe(2)
      for (const p of plans) {
        expect(p.length).toBeGreaterThanOrEqual(DOODLES_MIN)
        expect(p.length).toBeLessThanOrEqual(DOODLES_MAX)
        for (const d of p) expect(DECOR_SETS.birthday).toContain(d.name)
      }
    }
  })

  it('never puts a doodle on the subject', async () => {
    for (const m of MODES)
      for (let seed = 1; seed <= 5; seed++) {
        const opts = { seed, decor: 'friends', palette, height: 400 }
        const r = await renderDoodleFrame(input(m), m, opts)
        const W = r.width
        // Every doodle's reach (its rotated box and the wobble) is clear of the subject's area.
        for (const d of r.doodles) {
          const rad = d.size * DOODLE_REACH
          expect(d.x - rad).toBeGreaterThanOrEqual(0)
          expect(d.y - rad).toBeGreaterThanOrEqual(0)
          expect(d.x + rad).toBeLessThanOrEqual(W)
          expect(d.y + rad).toBeLessThanOrEqual(r.height)
          for (let y = Math.floor(d.y - rad); y <= d.y + rad; y++)
            for (let x = Math.floor(d.x - rad); x <= d.x + rad; x++)
              if ((x - d.x) ** 2 + (y - d.y) ** 2 <= rad * rad) expect(r.keepOut[y * W + x]).toBe(0)
        }
        // And the subject's pixels are exactly those of the same render without doodles.
        const bare = await renderDoodleFrame(input(m), m, { ...opts, doodles: false })
        let subject = 0
        let changed = 0
        for (let i = 0; i < W * r.height; i++) {
          if (!r.subject[i]) continue
          subject++
          if (r.raw[i * 3] !== bare.raw[i * 3] || r.raw[i * 3 + 2] !== bare.raw[i * 3 + 2]) changed++
        }
        expect(subject).toBeGreaterThan(W * r.height * 0.1)
        expect(changed).toBe(0)
      }
  })

  it('plans no doodle at all where the sheet is taken', () => {
    const W = 200
    const H = 250
    const full = new Uint8Array(W * H).fill(1)
    expect(planDoodles(rngOf(3), DECOR_SETS.love, full, W, H, ['#000000'])).toEqual([])
  })

  it('keeps the photo sharp and true: no blur, no flattened colors', async () => {
    // A fine checkerboard in two colors: blur or posterising would wash it out.
    const W = 600
    const H = 750
    const px = Buffer.alloc(W * H * 3)
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        const on = (Math.floor(x / 4) + Math.floor(y / 4)) % 2 === 0
        px.set(on ? [30, 90, 200] : [240, 200, 60], (y * W + x) * 3)
      }
    const photo = await sharp(px, { raw: { width: W, height: H, channels: 3 } })
      .png()
      .toBuffer()
    const r = await renderDoodleFrame(photo, 'bg', { seed: 9, palette, height: 750 })
    let edges = 0
    let n = 0
    let blue = 0
    for (let y = 300; y < 450; y++)
      for (let x = 200; x < 400; x++) {
        const i = (y * r.width + x) * 3
        const j = i + 3
        n++
        if (Math.abs(r.raw[i] - r.raw[j]) > 120) edges++
        if (r.raw[i + 2] > 150 && r.raw[i] < 80) blue++
      }
    expect(edges / n).toBeGreaterThan(0.15) // checker edges every 4 px survive
    expect(blue / n).toBeGreaterThan(0.3) // the blue stays blue (only a light warm grade)
  })

  it('draws a thin ink outline round a cut subject', async () => {
    const r = await renderDoodleFrame(DOG_CUT, 'cut', { seed: 2, palette, height: 400, doodles: false })
    const W = r.width
    let dark = 0
    let ring = 0
    for (let y = 1; y < r.height - 1; y++)
      for (let x = 1; x < W - 1; x++) {
        const i = y * W + x
        // Just outside the silhouette.
        if (r.subject[i] || !(r.subject[i - 1] || r.subject[i + 1] || r.subject[i - W] || r.subject[i + W]))
          continue
        ring++
        if (r.raw[i * 3] + r.raw[i * 3 + 1] + r.raw[i * 3 + 2] < 3 * 150) dark++
      }
    expect(ring).toBeGreaterThan(100)
    expect(dark / ring).toBeGreaterThan(0.5)
  })
})
