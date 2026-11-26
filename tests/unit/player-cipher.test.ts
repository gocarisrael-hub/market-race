// @vitest-environment happy-dom
// The cipher screen labels its two answers apart: what the hidden word is, and the key.
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ALEFBET } from '../../src/server/domain/minigames.ts'
import type { PlayerView } from '../../src/server/services/play.ts'
import { makeT } from '../../src/web/player/copy.ts'
import { MiniGame } from '../../src/web/player/screens/MiniGame.tsx'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const view: PlayerView = {
  status: 'active',
  version: 5,
  pollSeconds: 4,
  theme: null,
  decor: 'generic',
  company: null,
  honoree: 'מיכל',
  form: 'she',
  voice: 'she',
  people: 4,
  players: 4,
  allergens: [],
  diets: [],
  totalStops: 5,
  stages: [
    { kind: 'stop', index: 0, state: 'done' },
    { kind: 'stop', index: 1, state: 'done' },
    { kind: 'game', index: 0, type: 'cipher', state: 'now' },
    { kind: 'stop', index: 2, state: 'later' },
  ],
  stage: 3,
  step: 'minigame',
  stopIndex: 2,
  minigame: {
    index: 0,
    type: 'cipher',
    prompt: [
      { t: 'text', v: 'המילה שהכי מתארת את ' },
      { t: 'slot', v: 'מיכל', slot: 'name' },
    ],
    options: null,
    statements: null,
    photo: null,
    focus: null,
    cipher: 'שבדקסה',
    keyHint: [{ t: 'text', v: 'מזיזים כל אות אחורה כמספר האותיות של: המקום שהכי עושה למיכל טוב' }],
    alefbet: ALEFBET,
    solved: false,
    reward: null,
  },
  current: null,
  completed: [],
  letter: null,
}

describe('cipher screen', () => {
  let el: HTMLDivElement
  let root: Root
  beforeEach(() => {
    el = document.createElement('div')
    document.body.appendChild(el)
    root = createRoot(el)
  })
  afterEach(() => {
    act(() => root.unmount())
    el.remove()
  })

  it('labels the hidden word and the key apart', () => {
    act(() => root.render(createElement(MiniGame, { view, t: makeT('she'), act: vi.fn() })))
    const prompt = el.querySelector('[data-testid="game-prompt"]')!.textContent
    const key = el.querySelector('[data-testid="cipher-key"]')!.textContent
    expect(prompt).toBe('המילה המוצפנת היא: המילה שהכי מתארת את מיכל')
    expect(key).toMatch(/^המפתח: מזיזים כל אות אחורה/)
    expect(key).toContain('המקום שהכי עושה למיכל טוב')
    expect(prompt).not.toContain('המקום')
    expect(el.querySelectorAll('.cipher-letter')).toHaveLength(6)
  })
})
