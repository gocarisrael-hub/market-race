// @vitest-environment happy-dom
import { act, createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '../../src/server/services/play.ts'
import { makeT } from '../../src/web/player/copy.ts'
import { Riddle } from '../../src/web/player/screens/Riddle.tsx'
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const riddleView = (over: { version?: number; hint?: string | null } = {}): PlayerView => ({
  status: 'active',
  version: over.version ?? 2,
  pollSeconds: 4,
  theme: null,
  decor: 'generic',
  company: null,
  honoree: 'מיכל',
  form: 'she',
  people: 4,
  players: 4,
  allergens: [],
  diets: [],
  totalStops: 5,
  step: 'riddle',
  stopIndex: 0,
  current: {
    index: 0,
    finale: false,
    riddle: {
      parts: [
        { t: 'text', v: 'מאז ' },
        { t: 'slot', v: 'יואב מהשכבה', slot: 'first_love' },
        { t: 'text', v: ', היא עוד לא אבדה. מה היא?' },
      ],
      hint: over.hint ?? null,
      hasHint: true,
      hintQuestion: null,
    },
    photo: null,
    reveal: null,
    redeem: null,
  },
  completed: [],
  letter: null,
})

/** Types like a user: React listens to the native value setter + input event. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(input, value)
  input.dispatchEvent(new Event('input', { bubbles: true }))
}

describe('riddle screen', () => {
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

  it('shows personal text as slots and the question apart', () => {
    const t = makeT('she')
    act(() => root.render(createElement(Riddle, { view: riddleView(), t, act: vi.fn() })))
    expect(el.querySelector('.slot')?.textContent).toBe('יואב מהשכבה')
    expect(el.querySelector('.riddle-q')?.textContent).toBe('מה היא?')
    expect(el.querySelector('h1')?.textContent).toBe('חידה ראשונה')
    expect(el.textContent).toContain('התשובה שלכן')
  })

  it('keeps what a player is typing when a poll brings the same step (hint shown by another phone)', () => {
    const t = makeT('she')
    const send = vi.fn()
    act(() => root.render(createElement(Riddle, { view: riddleView(), t, act: send })))
    const input = el.querySelector('input')!
    act(() => type(input, 'תקו'))
    expect(input.value).toBe('תקו')
    act(() =>
      root.render(
        createElement(Riddle, { view: riddleView({ version: 3, hint: 'זה גם שם של המנון' }), t, act: send }),
      ),
    )
    expect(el.querySelector('input')!.value).toBe('תקו')
    expect(el.textContent).toContain('רמז: זה גם שם של המנון')
    // The hint button is gone once the hint is shown.
    expect(el.querySelector('.hint-btn')).toBeNull()
  })

  it('sends the answer for this stop and shows gentle feedback when it is wrong', async () => {
    const t = makeT('she')
    const send = vi.fn(async () => ({ kind: 'view' as const, view: riddleView(), correct: false }))
    act(() => root.render(createElement(Riddle, { view: riddleView(), t, act: send })))
    const input = el.querySelector('input')!
    act(() => type(input, '  סתם '))
    await act(async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(send).toHaveBeenCalledWith({ type: 'answer', stopIndex: 0, answer: 'סתם' })
    expect(el.querySelector('.feedback')?.textContent).toBe('כמעט! נסו שוב')
    // The answer itself is never revealed and the typed text stays for editing.
    expect(input.value).toBe('  סתם ')
  })

  it('asks for an answer instead of sending an empty one', async () => {
    const t = makeT('she')
    const send = vi.fn()
    act(() => root.render(createElement(Riddle, { view: riddleView(), t, act: send })))
    await act(async () => {
      el.querySelector('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(send).not.toHaveBeenCalled()
    expect(el.querySelector('.feedback')?.textContent).toBe('קודם כותבים תשובה')
  })
})
