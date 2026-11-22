// /lost-link: "איבדתי את הקישור". The buyer enters the email they ordered with; the server emails
// that address its manage links. The answer is the same whether or not the address has orders, so
// this page never tells who ordered.
import { useState } from 'react'
import { ApiError, lostLink } from '../api.ts'
import { copy } from '../copy.ts'
import { errorText, validEmail } from '../logic.ts'
import { Back, Cta, Deco, Field, Sketch } from '../ui.tsx'

export function LostLink() {
  const [email, setEmail] = useState('')
  const [fieldError, setFieldError] = useState<string | undefined>()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const c = copy.lostLink

  const submit = async () => {
    if (!validEmail(email)) return setFieldError(c.badEmail)
    setBusy(true)
    setError(null)
    try {
      await lostLink(email.trim())
      setSent(true)
      window.scrollTo(0, 0)
    } catch (e) {
      setError(errorText(e instanceof ApiError ? e.code : 'generic'))
    } finally {
      setBusy(false)
    }
  }

  if (sent) {
    const [a, b] = c.sent
    return (
      <main className="page lost-link">
        <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 210 }} />
        <div className="thanks" style={{ marginTop: 160 }}>
          <h1 className="title rise">{a}</h1>
          <p className="status" role="status">
            {b}
          </p>
          <Sketch
            icon="pencil"
            small
            onClick={() => {
              setSent(false)
              setEmail('')
            }}
          >
            {c.again}
          </Sketch>
          <Sketch href="/" icon="house" small>
            {c.backHome}
          </Sketch>
        </div>
      </main>
    )
  }

  const [t1, t2] = c.title
  return (
    <main className="page lost-link">
      <Deco icon="awning" className="sway" style={{ top: -30, left: -36, width: 200 }} />
      <Back href="/" />
      <div style={{ marginTop: 50, marginLeft: 40 }}>
        <div className="eyebrow">{c.eyebrow}</div>
        <h1 className="title rise" style={{ fontSize: 56 }}>
          {t1}
          <br />
          {t2}
        </h1>
        <p className="lead">{c.intro}</p>
      </div>
      <form
        className="section"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <Field
          label={c.email}
          type="email"
          ltr
          inputMode="email"
          autoComplete="email"
          value={email}
          error={fieldError}
          onChange={(v) => {
            setFieldError(undefined)
            setError(null)
            setEmail(v)
          }}
        />
      </form>
      <Cta onClick={submit} busy={busy} error={error}>
        {c.submit}
      </Cta>
    </main>
  )
}
