// /pay/mock: a stand-in for the card page while PAYMENT_PROVIDER=mock (staging only).
// Opens inside the pay sheet like the real card page, and returns through /pay/done.
import { useEffect, useState } from 'react'
import { copy } from '../copy.ts'
import { formatShekels } from '../logic.ts'
import { Spinner } from '../ui.tsx'

type Info = { orderNo: string; amountAgorot: number; manageToken: string; paid: boolean }

export function PayMock({ search }: { search: string }) {
  const token = new URLSearchParams(search).get('s') ?? ''
  const [info, setInfo] = useState<Info | null | undefined>(undefined)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    fetch(`/api/payment/mock/${encodeURIComponent(token)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then(setInfo)
      .catch(() => setInfo(null))
  }, [token])

  const back = (manageToken: string, ok: boolean) =>
    location.assign(`/pay/done?o=${encodeURIComponent(manageToken)}${ok ? '' : '&error=1'}`)

  const pay = async () => {
    setBusy(true)
    const r = await fetch('/api/payment/mock/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
    })
    if (r.ok) location.assign((await r.json()).redirect)
    else setBusy(false)
  }

  if (info === undefined)
    return (
      <main className="page mock-pay">
        <Spinner />
      </main>
    )
  if (!info)
    return (
      <main className="page mock-pay">
        <p className="status">{copy.mockPay.missing}</p>
      </main>
    )
  return (
    <main className="page mock-pay">
      <p className="mock-label" role="note">
        {copy.mockPay.label}
      </p>
      <h1>{copy.mockPay.title}</h1>
      <p>{copy.mockPay.order(info.orderNo)}</p>
      <p className="mock-amount">{copy.mockPay.amount(formatShekels(info.amountAgorot))}</p>
      <div className="mock-actions">
        <button type="button" className="mock-btn" onClick={pay} disabled={busy}>
          {busy ? copy.mockPay.paying : copy.mockPay.pay}
        </button>
        <button
          type="button"
          className="mock-btn secondary"
          onClick={() => back(info.manageToken, false)}
          disabled={busy}
        >
          {copy.mockPay.fail}
        </button>
      </div>
    </main>
  )
}
