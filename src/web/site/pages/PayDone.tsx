// /pay/done: where Tranzila sends its window back (inside our iframe). Tells the parent page.
import { useEffect } from 'react'
import { copy } from '../copy.ts'
import { PAY_MESSAGE, type PayMessage } from '../logic.ts'
import { navigate } from '../router.ts'
import { Spinner } from '../ui.tsx'

export function PayDone({ search }: { search: string }) {
  useEffect(() => {
    const q = new URLSearchParams(search)
    const token = q.get('o') ?? ''
    const ok = q.get('error') !== '1'
    const msg: PayMessage = { type: PAY_MESSAGE, token, ok }
    if (window.parent !== window) {
      window.parent.postMessage(msg, location.origin)
    } else if (/^[A-Za-z0-9_-]{10,64}$/.test(token)) {
      // Opened on its own (the window broke out of the iframe): continue on the manage page.
      navigate(`/m/${token}${ok ? '?paid=1' : ''}`, { replace: true })
    }
  }, [search])
  return (
    <main
      className="page"
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 80 }}
    >
      <Spinner />
      <p className="status">{copy.pay.done}</p>
    </main>
  )
}
