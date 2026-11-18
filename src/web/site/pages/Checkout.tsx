// Step 4: buyer details, summary, pay.
import { useEffect, useState } from 'react'
import { Doodles } from '../../shared/decor.tsx'
import { ApiError, getManage, type Manage, type Shop, updateOrder } from '../api.ts'
import { copy } from '../copy.ts'
import {
  buyerErrors,
  clearDraft,
  currentPalette,
  type Draft,
  decorFor,
  errorText,
  formatShekels,
} from '../logic.ts'
import { PayLayer, usePay } from '../pay.tsx'
import { navigate } from '../router.ts'
import { Back, Cta, Deco, Failed, Field, Loading, Sketch, StepTrail, TitleIcon, TornPaper } from '../ui.tsx'
import { STEPS } from './Home.tsx'

export function Checkout(props: { token: string; shop: Shop; draft: Draft; setDraft: (d: Draft) => void }) {
  const { token, shop, draft, setDraft } = props
  const [order, setOrder] = useState<Manage | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<ReturnType<typeof buyerErrors>>({})
  const mine = draft.manageToken === token
  const [buyer, setBuyer] = useState(mine ? draft.buyer : { name: '', phone: '', email: '' })

  useEffect(() => {
    getManage(token).then(
      (m) => (m.paid ? navigate(`/m/${token}`, { replace: true }) : setOrder(m)),
      (e) => setLoadError(errorText(e instanceof ApiError ? e.code : 'generic')),
    )
  }, [token])

  const paid = () => {
    clearDraft()
    navigate(`/m/${token}`)
  }
  const pay = usePay(token, paid, async () => {
    await updateOrder(token, { buyer })
  })

  if (loadError) return <Failed text={loadError} />
  if (!order) return <Loading />

  const setField = (k: keyof typeof buyer, v: string) => {
    const b = { ...buyer, [k]: v }
    setBuyer(b)
    setErrors({})
    if (mine) setDraft({ ...draft, buyer: b })
  }
  const occasion = shop.occasions.find((o) => o.key === order.occasionKey)?.label ?? ''
  const theme = mine ? shop.themes.find((t) => t.id === draft.themeId)?.name : undefined
  const palette = mine ? currentPalette(shop, draft)?.name : undefined
  const decor = decorFor(shop, order.occasionKey)
  const allergens = mine ? [...draft.allergens, ...draft.diets.map((x) => copy.home.dietLabels[x] ?? x)] : []
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
      <Back href={`/order/${token}/photos`} />
      <div style={{ marginTop: 18, marginLeft: 70 }}>
        <StepTrail step={4} total={STEPS} />
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

      <div className="section">
        <Field
          label={copy.checkout.name}
          value={buyer.name}
          autoComplete="name"
          error={errors.name}
          onChange={(v) => setField('name', v)}
        />
        <Field
          label={copy.checkout.phone}
          value={buyer.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          ltr
          error={errors.phone}
          onChange={(v) => setField('phone', v)}
        />
        <Field
          label={copy.checkout.email}
          value={buyer.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          ltr
          error={errors.email}
          onChange={(v) => setField('email', v)}
        />
      </div>

      <TornPaper tilt="l">
        <h2 className="sub">{copy.checkout.summary}</h2>
        <dl className="summary">
          {occasion && (
            <>
              <dt>{copy.checkout.occasion}</dt>
              <dd>{occasion}</dd>
            </>
          )}
          <dt>{copy.checkout.honoree}</dt>
          <dd>{order.honoree}</dd>
          <dt>{copy.checkout.people}</dt>
          <dd>{order.people}</dd>
          {theme && (
            <>
              <dt>{copy.checkout.theme}</dt>
              <dd>{theme}</dd>
            </>
          )}
          {palette && (
            <>
              <dt>{copy.checkout.palette}</dt>
              <dd>{palette}</dd>
            </>
          )}
          {allergens.length > 0 && (
            <>
              <dt>{copy.checkout.allergens}</dt>
              <dd>{allergens.join(', ')}</dd>
            </>
          )}
        </dl>
        {order.needsAnswers && <p className="hint">{copy.checkout.answersLater}</p>}
        <div className="summary-total" data-testid="total">
          <span>{copy.checkout.total}</span>
          <span>{amount}</span>
        </div>
      </TornPaper>

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
