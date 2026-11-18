import { useEffect, useState } from 'react'
import { ApiError, api } from './api.ts'

type Owner = { id: number; email: string; name: string }

export function App() {
  const [owner, setOwner] = useState<Owner | null | undefined>(undefined)

  useEffect(() => {
    api<{ owner: Owner }>('/me')
      .then((r) => setOwner(r.owner))
      .catch(() => setOwner(null))
  }, [])

  if (owner === undefined) return null
  if (!owner) return <Login onLogin={setOwner} />
  return (
    <div className="shell">
      <header>
        <strong>market-race admin</strong>
        <span>{owner.email}</span>
        <button
          type="button"
          onClick={async () => {
            await api('/logout', { method: 'POST' })
            setOwner(null)
          }}
        >
          התנתקות
        </button>
      </header>
      <main>
        <h1>ניהול</h1>
      </main>
    </div>
  )
}

function Login({ onLogin }: { onLogin: (o: Owner) => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  return (
    <form
      className="login"
      onSubmit={async (e) => {
        e.preventDefault()
        setError('')
        try {
          await api('/login', { method: 'POST', json: { email, password } })
          const r = await api<{ owner: Owner }>('/me')
          onLogin(r.owner)
        } catch (err) {
          setError(err instanceof ApiError && err.status === 401 ? 'אימייל או סיסמה שגויים' : 'שגיאה')
        }
      }}
    >
      <h1>כניסה לניהול</h1>
      <label>
        אימייל
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required dir="ltr" />
      </label>
      <label>
        סיסמה
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          dir="ltr"
        />
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit">כניסה</button>
    </form>
  )
}
