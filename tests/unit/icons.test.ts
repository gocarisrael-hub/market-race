import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { iconFilesOnDisk } from '../../scripts/icons/manifest.ts'
import { ICONS_VERSION } from '../../src/server/domain/icon-keys.generated.ts'
import { ICON_MANIFEST } from '../../src/server/domain/icon-manifest.generated.ts'
import {
  CLASSIC_ICONS,
  ICON_CATEGORIES,
  iconUrl,
  isRecolored,
  looksLikeIconKey,
} from '../../src/server/domain/icons.ts'
import { isIconKey, iconUrl as serverIconUrl } from '../../src/server/lib/icons.ts'
import { makeTestApp } from '../helpers/app.ts'

const root = fileURLToPath(new URL('../..', import.meta.url))
const iconsDir = path.join(root, 'assets/icons')

describe('icon manifest', () => {
  it('lists every icon file, and every entry has its file', () => {
    const onDisk = iconFilesOnDisk()
    const keys = ICON_MANIFEST.map((e) => e.key)
    expect(keys).toEqual(onDisk)
    for (const e of ICON_MANIFEST) {
      expect(existsSync(path.join(iconsDir, e.file)), e.file).toBe(true)
      expect(e.file).toBe(`${e.key}.webp`)
    }
  })

  it('has unique keys, a known category and a Hebrew label for each icon', () => {
    const keys = ICON_MANIFEST.map((e) => e.key)
    expect(new Set(keys).size).toBe(keys.length)
    const cats = new Set<string>([...ICON_CATEGORIES.map((c) => c.key), 'classic'])
    for (const e of ICON_MANIFEST) {
      expect(cats.has(e.category), e.key).toBe(true)
      expect(e.key.startsWith(e.category === 'classic' ? '' : `${e.category}/`), e.key).toBe(true)
      expect(e.label, e.key).toMatch(/[֐-׿]/)
      expect(e.label, e.key).not.toMatch(/[a-z]{3}/)
      expect(looksLikeIconKey(e.key), e.key).toBe(true)
    }
    // Every category has icons, and the library is the size the sheets give.
    for (const c of ICON_CATEGORIES)
      expect(
        ICON_MANIFEST.some((e) => e.category === c.key),
        c.key,
      ).toBe(true)
    expect(ICON_MANIFEST.length).toBeGreaterThanOrEqual(500)
  })

  it('is current with the files (the version hashes them)', () => {
    const generated = readFileSync(path.join(root, 'src/server/domain/icon-keys.generated.ts'), 'utf8')
    expect(generated).toContain(`'${ICON_MANIFEST[0].key}'`)
    expect(ICONS_VERSION).toMatch(/^[0-9a-f]{8}$/)
  })

  it('resolves URLs, recolored only for the classics of a theme', () => {
    expect(iconUrl('food/falafel-cone')).toBe(`/static/icons/food/falafel-cone.webp?v=${ICONS_VERSION}`)
    expect(iconUrl('falafel', 'ink')).toBe('/static/icons/ink/falafel.webp')
    expect(iconUrl('food/falafel-cone', 'ink')).toBe(
      `/static/icons/food/falafel-cone.webp?v=${ICONS_VERSION}`,
    )
    expect(isRecolored('falafel', 'ink')).toBe(true)
    expect(isRecolored('food/falafel-cone', 'ink')).toBe(false)
    for (const c of CLASSIC_ICONS) expect(isIconKey(c), c).toBe(true)
    expect(isIconKey('food/nope')).toBe(false)
    expect(isIconKey('../secret')).toBe(false)
    expect(serverIconUrl(null)).toBeNull()
    expect(serverIconUrl('drinks/beer')).toContain('/static/icons/drinks/beer.webp?v=')
  })
})

describe('icon serving', () => {
  let t: Awaited<ReturnType<typeof makeTestApp>>
  beforeAll(async () => {
    t = await makeTestApp()
  })
  afterAll(() => t.close())

  it('serves versioned icons with a year-long cache', async () => {
    const res = await t.app.inject({ url: iconUrl('game/trophy') })
    expect(res.statusCode).toBe(200)
    expect(res.headers['content-type']).toContain('image/webp')
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable')
    const plain = await t.app.inject({ url: '/static/icons/ink/falafel.webp' })
    expect(plain.statusCode).toBe(200)
    expect(plain.headers['cache-control']).not.toContain('immutable')
  })
})
