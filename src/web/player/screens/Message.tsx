// Loading, not found, not ready, expired, connection error: one note on the market background.
import type { T } from '../copy.ts'
import { BrushButton, Paper } from '../draw.tsx'
import { iconUrl } from '../logic.ts'

type Kind = 'loading' | 'notFound' | 'notReady' | 'expired' | 'error'

const ICON: Record<Kind, string> = {
  loading: 'awning',
  notFound: 'spices',
  notReady: 'hummus',
  expired: 'flowers',
  error: 'awning',
}

export function Message({ t, kind, onRetry }: { t: T; kind: Kind; onRetry?: () => void }) {
  if (kind === 'loading') {
    return (
      <main className="scr message loading" aria-busy="true">
        <img className="message-icon bob" src={iconUrl(ICON.loading)} alt="" />
        <p className="loading-text">{t('loading')}</p>
      </main>
    )
  }
  const title =
    kind === 'error'
      ? t('offline')
      : t(`${kind}.title` as 'expired.title' | 'notFound.title' | 'notReady.title')
  const body = kind === 'error' ? '' : t(`${kind}.body` as 'expired.body' | 'notFound.body' | 'notReady.body')
  return (
    <main className={`scr message ${kind}`}>
      <img className="message-icon bob" src={iconUrl(ICON[kind])} alt="" />
      <Paper className="message-note rise" tilt={-1.5}>
        <h1>{title}</h1>
        {body && <p>{body}</p>}
      </Paper>
      {onRetry && (
        <div className="foot">
          <BrushButton onClick={onRetry}>{t('retry')}</BrushButton>
        </div>
      )}
    </main>
  )
}
