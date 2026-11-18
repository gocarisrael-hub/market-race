// /pay/:token: the payment link the owner sends a company with its quote.
import { useEffect, useState } from 'react'
import { ApiError, getManage, type Manage } from '../api.ts'
import { copy } from '../copy.ts'
import { errorText, formatShekels } from '../logic.ts'
import { PayLayer, usePay } from '../pay.tsx'
import { navigate } from '../router.ts'
import { Brush, Cta, Deco, Failed, Loading, TornPaper } from '../ui.tsx'

export function CompanyPay({ token }: { token: string }) {
  const [m, setM] = useState<Manage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  useEffect(() => {
    getManage(token).then(setM, (e) => setLoadError(errorText(e instanceof ApiError ? e.code : 'generic')))
  }, [token])
  const pay = usePay(token, () => navigate(`/m/${token}`))

  if (loadError) return <Failed text={loadError} />
  if (!m) return <Loading />
  const payable = !m.paid && (m.status === 'quoted' || m.status === 'pending_payment') && m.amountAgorot > 0
  const amount = formatShekels(m.amountAgorot)
  const [t1, t2] = copy.companyPay.title

  return (
    <main className="page">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 200 }} />
      <div style={{ marginTop: 110, marginLeft: 40 }}>
        <div className="eyebrow">{copy.manage.orderNo(m.orderNo)}</div>
        <h1 className="title rise">
          {t1}
          <br />
          {t2}
        </h1>
      </div>
      {m.paid ? (
        <>
          <p className="status">{copy.companyPay.paid}</p>
          <p>
            <Brush href={`/m/${token}`}>{copy.pay.toManage}</Brush>
          </p>
        </>
      ) : !payable ? (
        <p className="status">{copy.companyPay.inactive}</p>
      ) : (
        <>
          <TornPaper tilt="r">
            <h2 className="sub">{copy.companyPay.for(m.honoree)}</h2>
            <dl className="summary">
              <dt>{copy.checkout.people}</dt>
              <dd>{m.people}</dd>
            </dl>
            <div className="summary-total" data-testid="total">
              <span>{copy.companyPay.amount}</span>
              <span>{amount}</span>
            </div>
          </TornPaper>
          <Cta
            onClick={pay.start}
            busy={pay.state.s === 'opening'}
            error={pay.state.s === 'error' ? pay.state.text : null}
          >
            {copy.companyPay.pay(amount)}
          </Cta>
          <PayLayer pay={pay} token={token} />
        </>
      )}
    </main>
  )
}
