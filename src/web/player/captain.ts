// The captain's phone. The manage page sends the captain into the game with a captain token in
// the URL hash (#c=...); this phone keeps it per game and sends it with its requests, so the server
// can let it pause the game. The bare game link never carries it. Pure helpers, unit tested.

const PREFIX = 'market-race:captain:'
const TOKEN = /^[A-Za-z0-9_-]{16,64}$/

/** The captain token in a URL hash ("#c=..."), or null. */
export function captainFromHash(hash: string): string | null {
  const m = /(?:^#|&)c=([^&]+)/.exec(hash)
  if (!m) return null
  const v = decodeURIComponent(m[1])
  return TOKEN.test(v) ? v : null
}

type Store = Pick<Storage, 'getItem' | 'setItem'>

function storage(): Store | null {
  try {
    return window.localStorage
  } catch {
    return null
  }
}

/**
 * Takes the captain token from the hash (and removes it from the address bar, so a shared screenshot
 * or copied link never carries it), keeps it for this game, and returns the one this phone holds.
 */
export function captainTokenFor(
  gameToken: string,
  loc: { hash: string } = window.location,
  store: Store | null = storage(),
  clearHash: () => void = () =>
    history.replaceState(null, '', window.location.pathname + window.location.search),
): string | null {
  const fromHash = captainFromHash(loc.hash)
  if (fromHash) {
    clearHash()
    try {
      store?.setItem(PREFIX + gameToken, fromHash)
    } catch {
      // Private mode: it still works for this visit.
    }
    return fromHash
  }
  try {
    const kept = store?.getItem(PREFIX + gameToken) ?? null
    return kept && TOKEN.test(kept) ? kept : null
  } catch {
    return null
  }
}
