// Help: a scrawled "עזרה" in the corner of every game screen. Opens a torn-paper sheet with
// WhatsApp to us and, while a stall is shown, "the stall is closed" (sends the group to the backup).
import { useCallback, useEffect, useId, useState } from 'react'
import type { Support } from '../api.ts'
import { BrushButton, BrushLink, HandCircle, Paper, SketchButton, Underline } from '../draw.tsx'
import { canReportClosed, supportHref } from '../support.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

type Mode = 'menu' | 'confirm' | 'noBackup'

export function Help({ view, t, act, support }: ScreenProps & { support: Support }) {
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState<Mode>('menu')
  const [failed, setFailed] = useState(false)
  const { busy, run } = useBusy()
  const titleId = useId()
  const href = supportHref(support, view, t)
  const closable = canReportClosed(view)

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
  }, [closable, mode])

  if (!href && !closable) return null
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
                {mode === 'noBackup' ? t('help.noBackup') : t('help.title')}
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
                </ul>
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
