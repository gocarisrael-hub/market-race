// Paying for an order outside the build: opened from the manage page ("complete the payment") or on
// another device, without this device's draft. Buyer details, the summary, pay. The build's own
// details and pay stages are in build/stages.tsx.
import { useEffect, useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import { ApiError, type Buyer, getManage, type Manage, type Shop, updateOrder } from '../api.ts'
import { copy } from '../copy.ts'
import { buyerErrors, clearDraft, decorFor, errorText, formatShekels } from '../logic.ts'
import { PayLayer, usePay } from '../pay.tsx'
import { navigate } from '../router.ts'
import { OrderSummary } from '../summary.tsx'
import { Back, Cta, Deco, Failed, Field, Loading, Sketch, TitleIcon } from '../ui.tsx'

export function Checkout(props: { token: string; shop: Shop }) {
  const { token, shop } = props
  const [order, setOrder] = useState<Manage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof buyerErrors>>({})
  const [buyer, setBuyer] = useState<Buyer>({ name: '', phone: '', email: '' })

  useEffect(() => {
    getManage(token).then(
      (m) => (m.paid ? navigate(`/m/${token}`, { replace: true }) : setOrder(m)),
      (e) => setLoadError(errorText(e instanceof ApiError ? e.code : 'generic')),
    )
  }, [token])

  const pay = usePay(
    token,
    () => {
      clearDraft()
      navigate(`/m/${token}`)
    },
    async () => {
      await updateOrder(token, { buyer })
    },
  )

  if (loadError) return <Failed text={loadError} />
  if (!order) return <Loading />

  const setField = (k: keyof Buyer, v: string) => {
    setBuyer({ ...buyer, [k]: v })
    setErrors({})
  }
  const decor = decorFor(shop, order.occasionKey)
  const amount = formatShekels(order.amountAgorot)
  const submit = () => {
    const e = buyerErrors(buyer)
    setErrors(e)
    if (Object.keys(e).length) return
    pay.start()
  }
  const [t1, t2] = copy.checkout.title

  return (
    <main className="page" data-decor={decor ?? undefined}>
      <Doodles
        className="deco"
        decor={decor}
        spots={[
          { top: 330, left: 8, size: 46, rot: 8 },
          { top: 560, left: -10, size: 40, rot: -12 },
        ]}
      />
      <Deco
        icon="tomatoes"
        className="bob"
        style={{ top: 30, left: -30, width: 96, ['--r' as string]: '10deg' }}
      />
      <Back href={`/m/${token}`} />
      <div style={{ marginTop: 18, marginLeft: 70 }}>
        <div className="title-row">
          <h1 className="title rise">
            {t1}
            <br />
            {t2}
          </h1>
          <TitleIcon icon="ticket" />
        </div>
        <p className="lead">{copy.checkout.intro}</p>
      </div>

      <BuyerFields buyer={buyer} errors={errors} onChange={setField} />
      <OrderSummary order={order} shop={shop} draft={null} />

      {pay.state.s === 'error' && (
        <p className="hint" style={{ marginTop: 16 }}>
          <Sketch href={`/m/${token}`} icon="ticket" small>
            {copy.pay.toManage}
          </Sketch>
        </p>
      )}

      <Cta
        onClick={submit}
        busy={pay.state.s === 'opening'}
        error={pay.state.s === 'error' ? pay.state.text : null}
      >
        {copy.checkout.pay(amount)}
      </Cta>
      <PayLayer pay={pay} token={token} />
    </main>
  )
}

/** The buyer's name, phone and email (plain fields, Heebo). */
export function BuyerFields(props: {
  buyer: Buyer
  errors: ReturnType<typeof buyerErrors>
  onChange: (k: keyof Buyer, v: string) => void
}) {
  const { buyer, errors, onChange } = props
  return (
    <div className="section">
      <Field
        label={copy.checkout.name}
        value={buyer.name}
        autoComplete="name"
        error={errors.name}
        onChange={(v) => onChange('name', v)}
      />
      <Field
        label={copy.checkout.phone}
        value={buyer.phone}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        ltr
        error={errors.phone}
        onChange={(v) => onChange('phone', v)}
      />
      <Field
        label={copy.checkout.email}
        value={buyer.email}
        type="email"
        inputMode="email"
        autoComplete="email"
        ltr
        error={errors.email}
        onChange={(v) => onChange('email', v)}
      />
    </div>
  )
}
