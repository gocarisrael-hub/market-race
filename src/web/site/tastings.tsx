// Step 1, "what you taste on the way": each stop's teaser (never the stall), updated for the
// group's allergens and diets with the same safety logic the server uses to build the game.
import { useEffect, useState } from 'react'
import { getRoutePreview, type PreviewStop, type Shop } from './api.ts'
import { copy } from './copy.ts'
import { listedStops, routeForTheme } from './logic.ts'
import { Underline } from './ui.tsx'

const DEBOUNCE_MS = 300

export function RouteTastings(props: {
  shop: Shop
  themeId: number | null
  allergens: string[]
  diets: string[]
}) {
  const { shop, themeId, allergens, diets } = props
  const route = routeForTheme(shop, themeId)
  const [stops, setStops] = useState<PreviewStop[]>(() => listedStops(route))
  const aKey = allergens.join(',')
  const dKey = diets.join(',')

  // biome-ignore lint/correctness/useExhaustiveDependencies: keyed by the joined lists
  useEffect(() => {
    if (themeId == null || !route) return
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      getRoutePreview(themeId, allergens, diets, ctrl.signal)
        .then(setStops)
        .catch(() => {}) // keep what is shown; the order still works
    }, DEBOUNCE_MS)
    return () => {
      clearTimeout(timer)
      ctrl.abort()
    }
  }, [themeId, route?.id, aKey, dKey])

  // A theme of another market shows that market's route right away.
  const [routeId, setRouteId] = useState(route?.id)
  if (route?.id !== routeId) {
    setRouteId(route?.id)
    setStops(listedStops(route))
  }

  if (!stops.length) return null
  const blocked = stops.some((s) => s.status === 'blocked')
  return (
    <section className="section tastings" aria-labelledby="l-tastings" data-testid="tastings">
      <div className="label" id="l-tastings">
        {copy.home.tastings}
      </div>
      <p className="hint">{copy.home.tastingsIntro}</p>
      <ol className="stops" aria-live="polite">
        {stops.map((s, i) => (
          <li
            // biome-ignore lint/suspicious/noArrayIndexKey: stops are positional
            key={i}
            className={`stop ${s.finale ? 'finale' : ''} ${s.status}`}
            data-status={s.status}
          >
            <span className="dot" aria-hidden="true">
              {s.icon ? <img src={s.icon} alt="" loading="lazy" decoding="async" /> : i + 1}
            </span>
            <span className="what">
              <span className="no">
                {s.finale ? (
                  <span className="fin">
                    {copy.home.finale}
                    <Underline />
                  </span>
                ) : (
                  copy.home.stopNo(i + 1)
                )}
              </span>
              <span className="teaser">{s.teaser || copy.home.tastingFallback}</span>
              {s.status === 'swapped' && <span className="note">{copy.home.swapped}</span>}
              {s.status === 'blocked' && <span className="warn">{copy.home.blocked}</span>}
            </span>
          </li>
        ))}
      </ol>
      {blocked && (
        <p className="error" role="alert">
          {copy.home.blockedSummary}
        </p>
      )}
    </section>
  )
}
