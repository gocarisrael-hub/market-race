// Loads the game, keeps it in sync across phones, and sends actions.
import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fetchGame,
  type Loaded,
  type PlayAction,
  type PlayerView,
  type Support,
  sendAction,
  sendPause,
} from './api.ts'
import { captainTokenFor } from './captain.ts'
import { type Poller, pickView, startPoller } from './sync.ts'

export type GameState =
  | { phase: 'loading' }
  | { phase: 'not_found' }
  | { phase: 'not_ready' }
  | { phase: 'error' }
  | { phase: 'view'; view: PlayerView }

export function useGame(token: string) {
  const [state, setState] = useState<GameState>({ phase: 'loading' })
  const [texts, setTexts] = useState<Record<string, string>>({})
  const [support, setSupport] = useState<Support>({ whatsapp: '', message: '' })
  const [offline, setOffline] = useState(false)
  // The captain token this phone holds (from the manage page's "continue to the game"), and
  // whether the server accepted it.
  const [captainToken] = useState(() => (token ? captainTokenFor(token) : null))
  const [captain, setCaptain] = useState(false)
  const viewRef = useRef<PlayerView | null>(null)
  const pollerRef = useRef<Poller | null>(null)

  const apply = useCallback((r: Loaded) => {
    if (r.kind === 'error') {
      setOffline(true)
      // Only the first load shows a full error screen; later errors keep the last view.
      if (!viewRef.current) setState({ phase: 'error' })
      return
    }
    setOffline(false)
    if (r.kind === 'view') {
      if (r.texts) setTexts(r.texts)
      if (r.support) setSupport(r.support)
      if (r.captain !== undefined) setCaptain(r.captain)
      const next = pickView(viewRef.current, r.view)
      if (next !== viewRef.current) {
        viewRef.current = next
        setState({ phase: 'view', view: next })
      }
      return
    }
    if (!viewRef.current) setState({ phase: r.kind })
  }, [])

  const load = useCallback(
    async () => apply(await fetchGame(token, captainToken)),
    [token, captainToken, apply],
  )

  useEffect(() => {
    if (!token) {
      setState({ phase: 'not_found' })
      return
    }
    void load()
    const poller = startPoller({
      tick: load,
      seconds: () => viewRef.current?.pollSeconds ?? 4,
      isHidden: () => document.visibilityState === 'hidden',
      onVisibilityChange: (cb) => {
        document.addEventListener('visibilitychange', cb)
        return () => document.removeEventListener('visibilitychange', cb)
      },
    })
    pollerRef.current = poller
    return () => poller.stop()
  }, [token, load])

  const act = useCallback(
    async (action: PlayAction): Promise<Loaded> => {
      const r = await sendAction(token, action, captainToken)
      apply(r)
      return r
    },
    [token, captainToken, apply],
  )

  const pause = useCallback(async (): Promise<Loaded> => {
    if (!captainToken) return { kind: 'error' }
    const r = await sendPause(token, captainToken)
    if (r.kind === 'view') apply(r)
    return r
  }, [token, captainToken, apply])

  const retry = useCallback(() => {
    setState({ phase: 'loading' })
    void load()
  }, [load])

  return { state, texts, support, offline, act, retry, captain: captain && !!captainToken, pause }
}
