// Help: a scrawled "עזרה" in the corner of every game screen. Opens a torn-paper sheet with
// WhatsApp to us and, while a stall is shown, "the stall is closed" (sends the group to the backup).
// On the captain's own phone it also holds "עוצרים להיום": pause the game for everyone, after a
// confirm. Resuming is on the manage link.
import { useCallback, useEffect, useId, useState } from 'react'
import type { Loaded, Support } from '../api.ts'
import { BrushButton, BrushLink, HandCircle, Paper, SketchButton, Underline } from '../draw.tsx'
import { canReportClosed, supportHref } from '../support.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

type Mode = 'menu' | 'confirm' | 'noBackup' | 'pause'

/** The pause is offered on the captain's phone while a stop or a mini-game is being played. */
export const canPause = (view: ScreenProps['view'], captain: boolean) =>
  captain && view.status === 'active' && ['riddle', 'revealed', 'redeem', 'minigame'].includes(view.step)

export function Help({
  view,
  t,
  act,
  support,
  captain = false,
  pause,
}: ScreenProps & { support: Support; captain?: boolean; pause?: () => Promise<Loaded> }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('menu')
  const [failed, setFailed] = useState(false)
  const { busy, run } = useBusy()
  const titleId = useId()
  const href = supportHref(support, view, t)
  const closable = canReportClosed(view)
  const pausable = canPause(view, captain) && !!pause

  const close = useCallback(() => {
    setOpen(false)
    setMode('menu')
    setFailed(false)
  }, [])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])

  // The confirm only makes sense on the step it was asked on.
  useEffect(() => {
    if (!closable && mode === 'confirm') setMode('menu')
    if (!pausable && mode === 'pause') close()
  }, [closable, pausable, mode, close])

  if (!href && !closable && !pausable) return null
  const cur = view.current
  const stall = cur?.reveal?.stall

  const report = () =>
    run(async () => {
      if (!cur || !stall) return
      setFailed(false)
      const r = await act({ type: 'stall_closed', stopIndex: cur.index, stallId: stall.id })
      if (r.kind !== 'view') return setFailed(true)
      if (r.noBackup) return setMode('noBackup')
      close()
    })

  const doPause = () =>
    run(async () => {
      if (!pause) return
      setFailed(false)
      const r = await pause()
      if (r.kind !== 'view') return setFailed(true)
      close()
    })

  return (
    <>
      <button
        type="button"
        className="help-btn"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <span>{t('help.open')}</span>
        <HandCircle />
      </button>

      {open && (
        <div className="help-layer">
          <button type="button" className="help-veil" aria-label={t('help.dismiss')} onClick={close} />
          <div className="help-sheet rise" role="dialog" aria-modal="true" aria-labelledby={titleId}>
            <Paper tilt={-1}>
              <h2 className="help-title" id={titleId}>
                {mode === 'noBackup'
                  ? t('help.noBackup')
                  : mode === 'pause'
                    ? t('pause.title')
                    : t('help.title')}
              </h2>

              {mode === 'menu' && (
                <ul className="help-list">
                  {href && (
                    <li>
                      <a className="help-item" href={href} target="_blank" rel="noopener noreferrer">
                        {t('help.whatsapp')}
                        <Underline />
                      </a>
                    </li>
                  )}
                  {closable && (
                    <li>
                      <button type="button" className="help-item" onClick={() => setMode('confirm')}>
                        {t('help.closed')}
                        <Underline />
                      </button>
                    </li>
                  )}
                  {pausable && (
                    <li>
                      <button
                        type="button"
                        className="help-item pause-item"
                        onClick={() => {
                          setFailed(false)
                          setMode('pause')
                        }}
                      >
                        {t('pause.open')}
                        <Underline />
                      </button>
                    </li>
                  )}
                </ul>
              )}

              {mode === 'pause' && (
                <div className="help-confirm">
                  <p>{t('pause.body', { n: view.stopIndex + 1, total: view.totalStops })}</p>
                  <BrushButton disabled={busy} onClick={doPause}>
                    {t('pause.confirm')}
                  </BrushButton>
                  {failed && (
                    <p className="help-failed" role="alert">
                      {t('pause.failed')}
                    </p>
                  )}
                  <SketchButton className="help-plain" onClick={() => setMode('menu')}>
                    {t('pause.cancel')}
                  </SketchButton>
                </div>
              )}

              {mode === 'confirm' && stall && (
                <div className="help-confirm">
                  <p>{t('help.closedAsk', { stall: stall.name })}</p>
                  <BrushButton disabled={busy} onClick={report}>
                    {t('help.closedYes')}
                  </BrushButton>
                  {failed && (
                    <p className="help-failed" role="alert">
                      {t('help.failed')}
                    </p>
                  )}
                  <SketchButton className="help-plain" onClick={() => setMode('menu')}>
                    {t('help.cancel')}
                  </SketchButton>
                </div>
              )}

              {mode === 'noBackup' && (
                <div className="help-confirm">
                  {href && (
                    <BrushLink href={href} target="_blank" rel="noopener noreferrer">
                      {t('help.whatsapp')}
                    </BrushLink>
                  )}
                  <SketchButton className="help-plain" onClick={close}>
                    {t('help.dismiss')}
                  </SketchButton>
                </div>
              )}
            </Paper>
          </div>
        </div>
      )}
    </>
  )
}
