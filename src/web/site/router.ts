// Minimal history router: the site has a handful of paths (see parseRoute in logic.ts).
import { useEffect, useState } from 'react'

const EVENT = 'market-race:navigate'

export function navigate(href: string, opts: { replace?: boolean } = {}) {
  if (opts.replace) history.replaceState(null, '', href)
  else history.pushState(null, '', href)
  window.dispatchEvent(new Event(EVENT))
  if (!href.includes('#')) window.scrollTo(0, 0)
}

export function useLocation() {
  const [loc, setLoc] = useState(() => ({ path: location.pathname, search: location.search }))
  useEffect(() => {
    const on = () => setLoc({ path: location.pathname, search: location.search })
    window.addEventListener('popstate', on)
    window.addEventListener(EVENT, on)
    // A child may navigate in its first effect, which runs before this one.
    on()
    return () => {
      window.removeEventListener('popstate', on)
      window.removeEventListener(EVENT, on)
    }
  }, [])
  return loc
}
