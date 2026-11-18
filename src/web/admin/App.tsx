import { useEffect, useState } from 'react'
import { ApiError, api } from './api.ts'
import {
  CodesPage,
  MarketsPage,
  OccasionsPage,
  SettingsPage,
  StallsPage,
  TastingsPage,
} from './pages/basic.tsx'
import { QuestionSetsPage, RiddlesPage } from './pages/content.tsx'
import { RoutesPage, ThemesPage } from './pages/routes-themes.tsx'
import { useLoc } from './ui.tsx'

const SECTIONS = [
  { key: 'markets', label: 'שווקים', Page: MarketsPage },
  { key: 'stalls', label: 'דוכנים', Page: StallsPage },
  { key: 'tastings', label: 'טעימות', Page: TastingsPage },
  { key: 'riddles', label: 'חידות', Page: RiddlesPage },
  { key: 'question-sets', label: 'שאלונים', Page: QuestionSetsPage },
  { key: 'occasions', label: 'אירועים', Page: OccasionsPage },
  { key: 'routes', label: 'מסלולים', Page: RoutesPage },
  { key: 'themes', label: 'עיצובים', Page: ThemesPage },
  { key: 'settings', label: 'הגדרות', Page: SettingsPage },
]

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
  return <Shell owner={owner} onLogout={() => setOwner(null)} />
}

function Shell({ owner, onLogout }: { owner: Owner; onLogout: () => void }) {
  const loc = useLoc()
  const current = SECTIONS.find((s) => s.key === loc.section)
  return (
    <div className="shell">
      <header className="no-print">
        <strong>market-race admin</strong>
        <span>{owner.email}</span>
        <button
          type="button"
          onClick={async () => {
            await api('/logout', { method: 'POST' })
            onLogout()
          }}
        >
          התנתקות
        </button>
      </header>
      <div className="layout">
        <nav className="no-print">
          {SECTIONS.map((s) => (
            <a key={s.key} href={`#/${s.key}`} className={s.key === loc.section ? 'on' : ''}>
              {s.label}
            </a>
          ))}
        </nav>
        <main>
          {loc.section === 'codes' ? (
            <CodesPage />
          ) : current ? (
            <current.Page key={current.key} />
          ) : (
            <h1>ניהול</h1>
          )}
        </main>
      </div>
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
