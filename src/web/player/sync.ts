// Keeping every phone in the group on the same step: polling and merging views.
// Pure and timer-injectable so it is unit tested without a browser.
import type { PlayerView } from '../../server/services/play.ts'

/**
 * Decides which view to show when a new one arrives (from a poll or an action).
 * Responses can arrive out of order, so an older version never replaces a newer one. A view with
 * the same version and status is the same step: keep the current object so nothing re-renders.
 */
export function pickView(prev: PlayerView | null, next: PlayerView): PlayerView {
  if (!prev) return next
  if (next.version < prev.version) return prev
  if (next.version === prev.version && next.status === prev.status) return prev
  return next
}

/** Identifies the screen a view puts on: used as a React key, so local state (the answer being
 * typed) survives polls for the same step and resets when the step changes. */
export function screenKey(v: PlayerView): string {
  if (v.status === 'expired') return 'expired'
  if (v.step === 'done') return 'done'
  if (v.step === 'opening') return 'opening'
  return `${v.step}-${v.stopIndex}`
}

export interface PollerDeps {
  /** Fetches and applies the latest view. Errors are the caller's to handle. */
  tick: () => Promise<unknown>
  /** Seconds between polls; read on every schedule so a new `pollSeconds` takes effect. */
  seconds: () => number
  isHidden: () => boolean
  /** Subscribes to visibility changes; returns an unsubscribe function. */
  onVisibilityChange: (cb: () => void) => () => void
  setTimer?: (cb: () => void, ms: number) => unknown
  clearTimer?: (id: unknown) => void
}

export interface Poller {
  /** Polls now (if visible) and restarts the countdown. */
  refresh: () => void
  stop: () => void
}

/**
 * Polls every `seconds()` while the page is visible. Hidden: stops polling. Visible again:
 * polls at once, then resumes. Never runs two requests at the same time.
 */
export function startPoller(deps: PollerDeps): Poller {
  const setTimer = deps.setTimer ?? ((cb, ms) => setTimeout(cb, ms))
  const clearTimer = deps.clearTimer ?? ((id) => clearTimeout(id as ReturnType<typeof setTimeout>))
  let timer: unknown = null
  let inFlight = false
  let stopped = false

  const schedule = () => {
    if (timer != null) clearTimer(timer)
    timer = null
    if (stopped || deps.isHidden()) return
    const ms = Math.max(1, deps.seconds()) * 1000
    timer = setTimer(run, ms)
  }

  const run = async () => {
    timer = null
    if (stopped || deps.isHidden()) return
    if (inFlight) return schedule()
    inFlight = true
    try {
      await deps.tick()
    } catch {
      // The caller reports errors; polling keeps going.
    } finally {
      inFlight = false
      schedule()
    }
  }

  const unsubscribe = deps.onVisibilityChange(() => {
    if (deps.isHidden()) {
      if (timer != null) clearTimer(timer)
      timer = null
    } else {
      void run()
    }
  })

  schedule()

  return {
    refresh: () => void run(),
    stop: () => {
      stopped = true
      if (timer != null) clearTimer(timer)
      timer = null
      unsubscribe()
    },
  }
}
