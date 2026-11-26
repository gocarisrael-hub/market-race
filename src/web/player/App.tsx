import { useEffect, useMemo } from 'react'
import type { Palette } from '../../server/domain/types.ts'
import { DecorDefs } from '../shared/decor.tsx'
import { Desk } from '../shared/desk.tsx'
import { tokenFromPath } from './api.ts'
import { makeT } from './copy.ts'
import { Help } from './screens/Help.tsx'
import { Letter } from './screens/Letter.tsx'
import { Message } from './screens/Message.tsx'
import { Opening } from './screens/Opening.tsx'
import { Redeem } from './screens/Redeem.tsx'
import { Reveal } from './screens/Reveal.tsx'
import { Riddle } from './screens/Riddle.tsx'
import { screenKey } from './sync.ts'
import { DEFAULT_PALETTE, themeVars } from './theme.ts'
import { useGame } from './useGame.ts'

function useTheme(palette: Palette) {
  useEffect(() => {
    const vars = themeVars(palette)
    const root = document.documentElement
    for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v)
    root.dataset.dark = vars['--on-bg'] === palette.ink ? 'no' : 'yes'
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = palette.background
  }, [palette])
}

export function App() {
  const token = tokenFromPath(window.location.pathname)
  const { state, texts, support, offline, act, retry, captain, pause } = useGame(token)
  const view = state.phase === 'view' ? state.view : null
  const palette = view?.theme?.palette ?? DEFAULT_PALETTE
  useTheme(palette)
  // The players' grammar (feminine plural only for an occasion like a bachelorette).
  const voice = view?.voice ?? view?.form ?? 'she'
  const t = useMemo(() => makeT(voice, texts), [voice, texts])

  let screen: React.ReactNode
  if (state.phase === 'loading') screen = <Message t={t} kind="loading" />
  else if (state.phase === 'not_found') screen = <Message t={t} kind="notFound" />
  else if (state.phase === 'not_ready') screen = <Message t={t} kind="notReady" />
  else if (state.phase === 'error') screen = <Message t={t} kind="error" onRetry={retry} />
  else {
    const v = state.view
    const key = screenKey(v)
    if (v.status === 'expired') screen = <Message key={key} t={t} kind="expired" />
    else if (v.step === 'done') screen = <Letter key={key} view={v} t={t} />
    else if (v.step === 'opening') screen = <Opening key={key} view={v} t={t} />
    else if (v.status === 'paused') screen = <Opening key={key} view={v} t={t} paused />
    else if (v.step === 'riddle') screen = <Riddle key={key} view={v} t={t} act={act} />
    else if (v.step === 'revealed') screen = <Reveal key={key} view={v} t={t} act={act} />
    else screen = <Redeem key={key} view={v} t={t} act={act} />
  }

  return (
    <>
      <DecorDefs />
      <Desk map={view?.theme?.map} decor={view?.decor} />
      {offline && state.phase === 'view' && (
        <div className="offline" role="status">
          {t('offline')}
        </div>
      )}
      {screen}
      {view && view.status !== 'expired' && (
        <Help view={view} t={t} act={act} support={support} captain={captain} pause={pause} />
      )}
    </>
  )
}
