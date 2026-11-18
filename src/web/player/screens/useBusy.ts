import { useCallback, useRef, useState } from 'react'

/** Runs one async action at a time; `busy` disables the button meanwhile. */
export function useBusy() {
  const [busy, setBusy] = useState(false)
  const running = useRef(false)
  const run = useCallback(async <R>(fn: () => Promise<R>): Promise<R | undefined> => {
    if (running.current) return undefined
    running.current = true
    setBusy(true)
    try {
      return await fn()
    } finally {
      running.current = false
      setBusy(false)
    }
  }, [])
  return { busy, run }
}
