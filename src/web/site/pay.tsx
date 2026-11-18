// Card payment: Tranzila's page in a full-screen sheet, then wait for the server to settle.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError, getManage, startPay } from './api.ts'
import { copy } from './copy.ts'
import { errorText, isPayMessage } from './logic.ts'
import { Link, Spinner } from './ui.tsx'

type State =
  | { s: 'idle' }
  | { s: 'opening' }
  | { s: 'sheet'; url: string }
  | { s: 'checking' }
  | { s: 'slow' }
  | { s: 'error'; text: string }

const POLL_MS = 3000
const POLL_FOR_MS = 90_000

function stopPolling(timer: { current: number | null }) {
  if (timer.current) window.clearTimeout(timer.current)
  timer.current = null
}

/** Opens the pay window for an order; calls onPaid once the server shows it paid. */
export function usePay(token: string, onPaid: () => void, before?: () => Promise<void>) {
  const [state, setState] = useState<State>({ s: 'idle' })
  const timer = useRef<number | null>(null)
  const paidRef = useRef(onPaid)
  paidRef.current = onPaid

  const check = useCallback(() => {
    stopPolling(timer)
    setState({ s: 'checking' })
    const until = Date.now() + POLL_FOR_MS
    const tick = async () => {
      try {
        const m = await getManage(token)
        if (m.paid) return paidRef.current()
      } catch {}
      if (Date.now() > until) return setState({ s: 'slow' })
      timer.current = window.setTimeout(tick, POLL_MS)
    }
    tick()
  }, [token])

  useEffect(() => {
    const on = (e: MessageEvent) => {
      if (e.origin !== location.origin || !isPayMessage(e.data) || e.data.token !== token) return
      if (e.data.ok) check()
      else setState({ s: 'error', text: copy.pay.failed })
    }
    window.addEventListener('message', on)
    return () => {
      window.removeEventListener('message', on)
      stopPolling(timer)
    }
  }, [token, check])

  const start = async () => {
    setState({ s: 'opening' })
    try {
      if (before) await before()
      const { url } = await startPay(token)
      setState({ s: 'sheet', url })
    } catch (e) {
      const code = e instanceof ApiError ? e.code : 'generic'
      if (code === 'already_paid') return check()
      setState({ s: 'error', text: errorText(code) })
    }
  }

  return { state, start, close: () => setState({ s: 'idle' }), check }
}

/** The sheet and overlays for a usePay state. */
export function PayLayer({ pay, token }: { pay: ReturnType<typeof usePay>; token: string }) {
  const { state } = pay
  if (state.s === 'sheet')
    return (
      <div className="sheet" role="dialog" aria-modal="true" aria-label={copy.pay.sheetTitle}>
        <header>
          <h2 className="sheet-title">{copy.pay.sheetTitle}</h2>
          <button type="button" className="link-btn" onClick={pay.close}>
            {copy.pay.close}
          </button>
        </header>
        <iframe
          title={copy.pay.sheetTitle}
          src={state.url}
          allow="payment"
          {...{ allowpaymentrequest: 'true' }}
        />
      </div>
    )
  if (state.s === 'checking' || state.s === 'opening')
    return (
      <div className="overlay" role="status" aria-live="polite">
        <Spinner />
        <h2>{state.s === 'checking' ? copy.pay.checking : copy.pay.opening}</h2>
        {state.s === 'checking' && <p className="hint">{copy.pay.checkingHint}</p>}
      </div>
    )
  if (state.s === 'slow')
    return (
      <div className="overlay" role="status">
        <h2>{copy.pay.checking}</h2>
        <p className="status">{copy.pay.slow}</p>
        <Link href={`/m/${token}`} className="big-link">
          {copy.pay.toManage}
        </Link>
      </div>
    )
  return null
}
