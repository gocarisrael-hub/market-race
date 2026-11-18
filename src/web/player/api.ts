// Player API client. See src/server/routes/public-game.ts.
import type { PlayAction, PlayerView } from '../../server/services/play.ts'

export type { PlayAction, PlayerView }

export type Loaded =
  | { kind: 'view'; view: PlayerView; texts?: Record<string, string>; correct?: boolean }
  | { kind: 'not_found' }
  | { kind: 'not_ready' }
  | { kind: 'error' }

async function parse(res: Response): Promise<Loaded> {
  let body: unknown = null
  try {
    body = await res.json()
  } catch {
    return { kind: 'error' }
  }
  const b = body as {
    error?: string
    view?: PlayerView
    correct?: boolean
    texts?: Record<string, string>
  } & Partial<PlayerView>
  if (res.status === 404) return { kind: 'not_found' }
  if (res.status === 409) {
    // stale / expired: another phone moved first, the body has the current view.
    if (b.view) return { kind: 'view', view: b.view }
    if (b.error === 'not_ready') return { kind: 'not_ready' }
    return { kind: 'error' }
  }
  if (!res.ok) return { kind: 'error' }
  if (b.view) return { kind: 'view', view: b.view, correct: b.correct }
  const { texts, ...view } = b
  return { kind: 'view', view: view as PlayerView, texts }
}

export async function fetchGame(token: string): Promise<Loaded> {
  try {
    const res = await fetch(`/api/game/${encodeURIComponent(token)}`, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
    })
    return await parse(res)
  } catch {
    return { kind: 'error' }
  }
}

export async function sendAction(token: string, action: PlayAction): Promise<Loaded> {
  try {
    const res = await fetch(`/api/game/${encodeURIComponent(token)}/action`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(action),
    })
    return await parse(res)
  } catch {
    return { kind: 'error' }
  }
}

export function tokenFromPath(pathname: string): string {
  const m = /^\/g\/([^/?#]+)/.exec(pathname)
  return m ? decodeURIComponent(m[1]) : ''
}
