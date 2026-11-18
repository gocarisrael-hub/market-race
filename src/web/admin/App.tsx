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
import { CompaniesPage } from './pages/companies.tsx'
import { QuestionSetsPage, RiddlesPage } from './pages/content.tsx'
import { LivePage, OrdersPage, ReviewPage, TestGamePage } from './pages/orders.tsx'
import { PalettesPage, RoutesPage, ThemesPage } from './pages/routes-themes.tsx'
import { SettlementPage } from './pages/settlement.tsx'
import { useLoc } from './ui.tsx'

const OPS = [
  { key: 'orders', label: 'הזמנות', Page: OrdersPage },
  { key: 'review', label: 'לבדיקה', Page: ReviewPage },
  { key: 'live', label: 'משחקים פעילים', Page: LivePage },
  { key: 'test-game', label: 'משחק בדיקה', Page: TestGamePage },
  { key: 'companies', label: 'חברות', Page: CompaniesPage },
  { key: 'settlement', label: 'התחשבנות', Page: SettlementPage },
]

const CATALOG = [
  { key: 'markets', label: 'שווקים', Page: MarketsPage },
  { key: 'stalls', label: 'דוכנים', Page: StallsPage },
  { key: 'tastings', label: 'טעימות', Page: TastingsPage },
  { key: 'riddles', label: 'חידות', Page: RiddlesPage },
  { key: 'question-sets', label: 'שאלונים', Page: QuestionSetsPage },
  { key: 'occasions', label: 'אירועים', Page: OccasionsPage },
  { key: 'routes', label: 'מסלולים', Page: RoutesPage },
  { key: 'themes', label: 'עיצובים', Page: ThemesPage },
  { key: 'palettes', label: 'צבעים', Page: PalettesPage },
  { key: 'settings', label: 'הגדרות', Page: SettingsPage },
]
const SECTIONS = [...OPS, ...CATALOG]

/** Orders waiting in the review queue, refreshed on navigation, on changes and every minute. */
function useReviewCount(hash: string) {
  const [n, setN] = useState(0)
  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh when the location changes
  useEffect(() => {
    const load = () =>
      api<{ counts: Record<string, number> }>('/orders/summary')
        .then((r) => setN(r.counts.review ?? 0))
        .catch(() => {})
    load()
    const t = setInterval(load, 60_000)
    window.addEventListener('orders-changed', load)
    return () => {
      clearInterval(t)
      window.removeEventListener('orders-changed', load)
    }
  }, [hash])
  return n
}

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
  const review = useReviewCount(`${loc.section}/${loc.id ?? ''}`)
  const link = (s: (typeof SECTIONS)[number]) => (
    <a key={s.key} href={`#/${s.key}`} className={s.key === loc.section ? 'on' : ''}>
      {s.label}
      {s.key === 'review' && review > 0 && <span className="badge"> {review}</span>}
    </a>
  )
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
          {OPS.map(link)}
          <span className="nav-group">קטלוג</span>
          {CATALOG.map(link)}
        </nav>
        <main>
          {loc.section === 'codes' ? (
            <CodesPage />
          ) : current ? (
            <current.Page key={current.key} />
          ) : (
            <OrdersPage />
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
