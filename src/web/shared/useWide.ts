// Wide screens (computers, tablets in landscape) get real desktop layouts: side panels and
// spreads that phones never render. Matches the 1024px breakpoint in the CSS.
import { useEffect, useState } from 'react'

export const WIDE_QUERY = '(min-width: 1024px)'

const matches = (q: string) => typeof window !== 'undefined' && !!window.matchMedia?.(q).matches

export function useWide(query = WIDE_QUERY): boolean {
  const [wide, setWide] = useState(() => matches(query))
  useEffect(() => {
    const mq = window.matchMedia?.(query)
    if (!mq) return
    const onChange = () => setWide(mq.matches)
    onChange()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [query])
  return wide
}
