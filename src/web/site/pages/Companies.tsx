// /companies: companies don't order on the site; they leave a lead and get a quote.
import { useState } from 'react'
import { ApiError, type Shop, sendLead } from '../api.ts'
import { copy } from '../copy.ts'
import { companyOccasions, errorText, type Lead, leadErrors } from '../logic.ts'
import { Back, Cta, Deco, Field, Link, Opt } from '../ui.tsx'

export function Companies({ shop }: { shop: Shop }) {
  const [lead, setLead] = useState<Lead>({
    companyName: '',
    contactName: '',
    phone: '',
    email: '',
    occasionKey: null,
    people: '',
    preferredDate: '',
    message: '',
  })
  const [errors, setErrors] = useState<ReturnType<typeof leadErrors>>({})
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const set = (k: keyof Lead, v: string | null) => {
    setErrors({})
    setError(null)
    setLead({ ...lead, [k]: v })
  }

  const submit = async () => {
    const e = leadErrors(lead)
    setErrors(e)
    if (Object.keys(e).length) return
    setBusy(true)
    try {
      await sendLead({
        companyName: lead.companyName.trim(),
        contactName: lead.contactName.trim(),
        phone: lead.phone.trim(),
        email: lead.email.trim(),
        ...(lead.occasionKey ? { occasionKey: lead.occasionKey } : {}),
        ...(lead.people.trim() ? { people: Number(lead.people) } : {}),
        preferredDate: lead.preferredDate.trim(),
        message: lead.message.trim(),
      })
      setSent(true)
      window.scrollTo(0, 0)
    } catch (err) {
      setError(errorText(err instanceof ApiError ? err.code : 'generic'))
    } finally {
      setBusy(false)
    }
  }

  const [t1, t2] = copy.companies.title
  if (sent) {
    const [a, b] = copy.companies.thanks
    return (
      <main className="page">
        <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />
        <div className="thanks" style={{ marginTop: 160 }}>
          <h1 className="title rise">{a}</h1>
          <p className="status" role="status">
            {b}
          </p>
          <Link href="/">{copy.companies.backHome}</Link>
        </div>
      </main>
    )
  }

  return (
    <main className="page">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 200 }} />
      <Deco
        icon="hummus"
        className="bob"
        style={{ top: 640, left: -30, width: 100, ['--r' as string]: '10deg' }}
      />
      <Back href="/" />
      <div style={{ marginTop: 50, marginLeft: 40 }}>
        <div className="eyebrow">{copy.companies.eyebrow}</div>
        <h1 className="title rise" style={{ fontSize: 56 }}>
          {t1}
          <br />
          {t2}
        </h1>
        <p className="lead">{copy.companies.intro}</p>
      </div>

      {companyOccasions(shop).length > 0 && (
        <section className="section" aria-labelledby="l-cocc">
          <div className="label" id="l-cocc">
            {copy.companies.occasion}
          </div>
          <div className="row" role="radiogroup" aria-labelledby="l-cocc">
            {companyOccasions(shop).map((o) => (
              <Opt
                key={o.key}
                role="radio"
                pressed={lead.occasionKey === o.key}
                onClick={() => set('occasionKey', lead.occasionKey === o.key ? null : o.key)}
              >
                {o.label}
              </Opt>
            ))}
          </div>
        </section>
      )}

      <div className="section">
        <Field
          label={copy.companies.companyName}
          value={lead.companyName}
          autoComplete="organization"
          error={errors.companyName}
          onChange={(v) => set('companyName', v)}
        />
        <Field
          label={copy.companies.contactName}
          value={lead.contactName}
          autoComplete="name"
          error={errors.contactName}
          onChange={(v) => set('contactName', v)}
        />
        <Field
          label={copy.companies.phone}
          value={lead.phone}
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          ltr
          error={errors.phone}
          onChange={(v) => set('phone', v)}
        />
        <Field
          label={copy.companies.email}
          value={lead.email}
          type="email"
          inputMode="email"
          autoComplete="email"
          ltr
          error={errors.email}
          onChange={(v) => set('email', v)}
        />
        <Field
          label={copy.companies.people}
          value={lead.people}
          inputMode="numeric"
          error={errors.people}
          onChange={(v) => set('people', v)}
        />
        <Field
          label={copy.companies.date}
          value={lead.preferredDate}
          placeholder={copy.companies.datePlaceholder}
          onChange={(v) => set('preferredDate', v)}
        />
        <Field
          label={copy.companies.message}
          value={lead.message}
          multiline
          onChange={(v) => set('message', v)}
        />
      </div>

      <Cta onClick={submit} busy={busy} error={error}>
        {copy.companies.submit}
      </Cta>
    </main>
  )
}
