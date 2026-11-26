import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { PlayerView } from '../../src/server/services/play.ts'
import { pickView, screenKey, startPoller } from '../../src/web/player/sync.ts'

const view = (over: Partial<PlayerView> = {}): PlayerView => ({
  status: 'active',
  version: 3,
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
  step: 'riddle',
  stopIndex: 0,
  current: null,
  completed: [],
  letter: null,
  ...over,
})

describe('pickView', () => {
  it('takes the first view and any newer one', () => {
    const a = view()
    expect(pickView(null, a)).toBe(a)
    const b = view({ version: 4, step: 'revealed' })
    expect(pickView(a, b)).toBe(b)
  })

  it('never goes back to an older version (out-of-order responses)', () => {
    const newer = view({ version: 5 })
    expect(pickView(newer, view({ version: 4 }))).toBe(newer)
  })

  it('keeps the current object for the same version, so nothing re-renders', () => {
    const a = view()
    expect(pickView(a, view())).toBe(a)
  })

  it('takes a same-version view whose status changed (expired by date)', () => {
    const a = view()
    const b = view({ status: 'expired' })
    expect(pickView(a, b)).toBe(b)
  })
})

describe('screenKey', () => {
  it('changes with the step and stop, not with polls', () => {
    expect(screenKey(view())).toBe('riddle-0')
    expect(screenKey(view({ version: 9 }))).toBe('riddle-0')
    expect(screenKey(view({ step: 'redeem', stopIndex: 2 }))).toBe('redeem-2')
    expect(screenKey(view({ status: 'ready', step: 'opening' }))).toBe('opening')
    expect(screenKey(view({ status: 'done', step: 'done' }))).toBe('done')
    expect(screenKey(view({ status: 'expired' }))).toBe('expired')
  })
})

describe('startPoller', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  function setup(seconds = 4) {
    let hidden = false
    let onVis: () => void = () => {}
    const tick = vi.fn(async () => {})
    const poller = startPoller({
      tick,
      seconds: () => seconds,
      isHidden: () => hidden,
      onVisibilityChange: (cb) => {
        onVis = cb
        return () => {
          onVis = () => {}
        }
      },
    })
    return {
      tick,
      poller,
      hide: () => {
        hidden = true
        onVis()
      },
      show: () => {
        hidden = false
        onVis()
      },
    }
  }

  it('polls every pollSeconds', async () => {
    const { tick, poller } = setup(4)
    await vi.advanceTimersByTimeAsync(3999)
    expect(tick).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(tick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(8000)
    expect(tick).toHaveBeenCalledTimes(3)
    poller.stop()
  })

  it('pauses while hidden and refreshes at once when visible again', async () => {
    const { tick, poller, hide, show } = setup(4)
    hide()
    await vi.advanceTimersByTimeAsync(20000)
    expect(tick).toHaveBeenCalledTimes(0)
    show()
    await vi.advanceTimersByTimeAsync(0)
    expect(tick).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(4000)
    expect(tick).toHaveBeenCalledTimes(2)
    poller.stop()
  })

  it('never runs two requests at once', async () => {
    let release: () => void = () => {}
    let running = 0
    let maxRunning = 0
    const poller = startPoller({
      tick: () => {
        running++
        maxRunning = Math.max(maxRunning, running)
        return new Promise<void>((r) => {
          release = () => {
            running--
            r()
          }
        })
      },
      seconds: () => 1,
      isHidden: () => false,
      onVisibilityChange: () => () => {},
    })
    await vi.advanceTimersByTimeAsync(1000)
    poller.refresh()
    poller.refresh()
    await vi.advanceTimersByTimeAsync(5000)
    expect(maxRunning).toBe(1)
    release()
    poller.stop()
  })

  it('stops for good', async () => {
    const { tick, poller } = setup(1)
    poller.stop()
    await vi.advanceTimersByTimeAsync(10000)
    expect(tick).not.toHaveBeenCalled()
  })
})
