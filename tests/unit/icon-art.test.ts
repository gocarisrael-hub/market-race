// Every icon the code names is in the library, and the order build picks icons only where obvious.
import { describe, expect, it } from 'vitest'
import { ICON_MANIFEST } from '../../src/server/domain/icon-manifest.generated.ts'
import { DECOR_ICONS, decorIcons } from '../../src/server/domain/icons.ts'
import { DECORS, RECIPIENTS } from '../../src/server/domain/types.ts'
import { DEMO_OCCASION_ICONS, DEMO_TASTING_ICONS, KIDS_DRINK } from '../../src/server/services/seed-demo.ts'
import { occasionIcon, questionIcon, recipientIcon, STAGE_ICONS } from '../../src/web/site/build/art.ts'

const keys = new Set<string>(ICON_MANIFEST.map((e) => e.key))

describe('icons named in code', () => {
  it('are all in the library', () => {
    const named = [
      ...Object.values(DECOR_ICONS).flat(),
      ...Object.values(DEMO_OCCASION_ICONS).flat(),
      ...Object.values(DEMO_TASTING_ICONS),
      KIDS_DRINK.teaserIcon,
      ...Object.values(STAGE_ICONS),
    ]
    for (const k of named) expect(keys.has(k as string), String(k)).toBe(true)
    for (const d of DECORS) expect(DECOR_ICONS[d].length, d).toBeGreaterThan(0)
  })

  it("draws an occasion's own icons, else its doodle set's", () => {
    expect(decorIcons('birthday', ['fun/oud'])).toEqual(['fun/oud'])
    expect(decorIcons('birthday', [])).toEqual(DECOR_ICONS.birthday)
    expect(decorIcons('nope', null)).toEqual(DECOR_ICONS.generic)
    expect(occasionIcon({ decor: 'love', icons: [] })).toBe(DECOR_ICONS.love[0])
  })

  it('gives recipients animal and fun icons, kids their own', () => {
    for (const r of RECIPIENTS) {
      expect(keys.has(recipientIcon(r)!), r).toBe(true)
      expect(keys.has(recipientIcon(r, 'kids')!), r).toBe(true)
    }
    expect(recipientIcon('she', 'kids')).not.toBe(recipientIcon('she'))
  })

  it('gives a question an icon only when its subject is obvious', () => {
    expect(questionIcon('favorite_food')).toBe('game/fork-knife')
    expect(questionIcon('favorite_place')).toBe('game/map-pin')
    expect(questionIcon('wedding_song')).toBe('ui/music-notes')
    expect(questionIcon('photo_where')).toBe('game/camera')
    expect(questionIcon('one_word')).toBe('game/speech-bubble')
    expect(questionIcon('name')).toBeNull()
    expect(questionIcon('company_name')).toBeNull()
  })
})
