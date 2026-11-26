import { useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import '../shared/fonts.css'
import '../shared/decor.css'
import '../shared/desk.css'
import './site.css'
import { DecorDefs } from '../shared/decor.tsx'
import { Desk } from '../shared/desk.tsx'
import { getShop, type Shop } from './api.ts'
import { copy } from './copy.ts'
import {
  chooseTheme,
  type Draft,
  decorFor,
  emptyDraft,
  loadDraft,
  orderableThemes,
  parseRoute,
  saveDraft,
} from './logic.ts'
import { Checkout } from './pages/Checkout.tsx'
import { Companies } from './pages/Companies.tsx'
import { CompanyPay } from './pages/CompanyPay.tsx'
import { Home } from './pages/Home.tsx'
import { LostLink } from './pages/LostLink.tsx'
import { Manage } from './pages/Manage.tsx'
import { PayDone } from './pages/PayDone.tsx'
import { PayMock } from './pages/PayMock.tsx'
import { Photos } from './pages/Photos.tsx'
import { Questions } from './pages/Questions.tsx'
import { useLocation } from './router.ts'
import { Failed, Loading, Sketch } from './ui.tsx'

function App() {
  const loc = useLocation()
  const route = parseRoute(loc.path)
  const [shop, setShop] = useState<Shop | null>(null)
  const [shopError, setShopError] = useState(false)
  const [draft, setDraftState] = useState<Draft | null>(null)
  const needsShop = !['payDone', 'payMock', 'manage', 'companyPay', 'lostLink'].includes(route.page)

  useEffect(() => {
    if (!needsShop || shop) return
    getShop().then(
      (s) => {
        setShop(s)
        if (s.brand) document.title = s.brand
        const saved = loadDraft()
        let d = saved ?? emptyDraft(s.minPeople)
        // Defaults: the first orderable theme and its first palette; people within the limits.
        const themeId = d.themeId ?? orderableThemes(s)[0]?.id ?? null
        if (themeId !== null) d = chooseTheme(s, d, themeId)
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

  // Pages without the shop: a plain desk (the manage page draws its own, with the order's look).
  const bare = (page: React.ReactNode) => (
    <>
      <Desk />
      {page}
    </>
  )
  switch (route.page) {
    case 'payMock':
      return bare(<PayMock search={loc.search} />)
    case 'payDone':
      return bare(<PayDone search={loc.search} />)
    case 'manage':
      return <Manage token={route.token} search={loc.search} />
    case 'companyPay':
      return bare(<CompanyPay token={route.token} />)
    case 'lostLink':
      return bare(<LostLink />)
    case 'notFound':
      return bare(
        <main className="page">
          <p className="status" style={{ marginTop: 80 }}>
            {copy.notFound}
          </p>
          <Sketch href="/" icon="house" small>
            {copy.toHome}
          </Sketch>
        </main>,
      )
  }
  if (shopError) return bare(<Failed text={copy.loadFailed} />)
  if (!shop || !draft) return bare(<Loading />)
  let page: React.ReactNode
  switch (route.page) {
    case 'home':
      page = <Home shop={shop} draft={draft} setDraft={setDraft} />
      break
    case 'questions':
      page = <Questions shop={shop} draft={draft} setDraft={setDraft} />
      break
    case 'photos':
      page = <Photos token={route.token} shop={shop} draft={draft} />
      break
    case 'checkout':
      page = <Checkout token={route.token} shop={shop} draft={draft} setDraft={setDraft} />
      break
    case 'companies':
      page = <Companies shop={shop} />
      break
  }
  // The desk behind the page on wide screens: the chosen map and the occasion's doodles.
  const themes = orderableThemes(shop)
  const theme = themes.find((t) => t.id === draft.themeId) ?? themes[0]
  return (
    <>
      <Desk map={theme?.map} decor={decorFor(shop, draft.occasionKey)} />
      {page}
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <>
    <DecorDefs />
    <App />
  </>,
)
