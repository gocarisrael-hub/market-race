import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/fonts.css'
import './site.css'
import { getShop, type Shop } from './api.ts'
import { copy } from './copy.ts'
import { type Draft, emptyDraft, loadDraft, orderableThemes, parseRoute, saveDraft } from './logic.ts'
import { Checkout } from './pages/Checkout.tsx'
import { Companies } from './pages/Companies.tsx'
import { CompanyPay } from './pages/CompanyPay.tsx'
import { Home } from './pages/Home.tsx'
import { Manage } from './pages/Manage.tsx'
import { PayDone } from './pages/PayDone.tsx'
import { PayMock } from './pages/PayMock.tsx'
import { Photos } from './pages/Photos.tsx'
import { Questions } from './pages/Questions.tsx'
import { useLocation } from './router.ts'
import { Failed, Link, Loading } from './ui.tsx'

function App() {
  const loc = useLocation()
  const route = parseRoute(loc.path)
  const [shop, setShop] = useState<Shop | null>(null)
  const [shopError, setShopError] = useState(false)
  const [draft, setDraftState] = useState<Draft | null>(null)
  const needsShop = !['payDone', 'payMock', 'manage', 'companyPay'].includes(route.page)

  useEffect(() => {
    if (!needsShop || shop) return
    getShop().then(
      (s) => {
        setShop(s)
        if (s.brand) document.title = s.brand
        const saved = loadDraft()
        const d = saved ?? emptyDraft(s.minPeople)
        // Defaults: the first orderable theme; people within the current limits.
        if (d.themeId === null) d.themeId = orderableThemes(s)[0]?.id ?? null
        d.people = Math.min(s.maxPeople, Math.max(s.minPeople, d.people))
        setDraftState(d)
      },
      () => setShopError(true),
    )
  }, [needsShop, shop])

  const setDraft = (d: Draft) => {
    setDraftState(d)
    saveDraft(d)
  }

  switch (route.page) {
    case 'payMock':
      return <PayMock search={loc.search} />
    case 'payDone':
      return <PayDone search={loc.search} />
    case 'manage':
      return <Manage token={route.token} search={loc.search} />
    case 'companyPay':
      return <CompanyPay token={route.token} />
    case 'notFound':
      return (
        <main className="page">
          <p className="status" style={{ marginTop: 80 }}>
            {copy.notFound}
          </p>
          <Link href="/">{copy.toHome}</Link>
        </main>
      )
  }
  if (shopError) return <Failed text={copy.loadFailed} />
  if (!shop || !draft) return <Loading />
  switch (route.page) {
    case 'home':
      return <Home shop={shop} draft={draft} setDraft={setDraft} />
    case 'questions':
      return <Questions shop={shop} draft={draft} setDraft={setDraft} />
    case 'photos':
      return <Photos token={route.token} draft={draft} />
    case 'checkout':
      return <Checkout token={route.token} shop={shop} draft={draft} setDraft={setDraft} />
    case 'companies':
      return <Companies shop={shop} />
  }
}

createRoot(document.getElementById('root')!).render(<App />)
