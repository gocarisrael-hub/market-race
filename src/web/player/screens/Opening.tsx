// Opening: the market map, the race title on a ribbon, and "start".
import { joinList } from '../copy.ts'
import { BrushButton, Ribbon, TornEdge } from '../draw.tsx'
import { iconUrl, ribbonFontSize } from '../logic.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

export function Opening({ view, t, act }: ScreenProps) {
  const { busy, run } = useBusy()
  const title = t('start.ribbon', { name: view.honoree })
  const stops = view.totalStops
  const summary = view.allergens.length
    ? t('start.summaryAllergens', { stops, allergens: joinList(view.allergens) })
    : t('start.summary', { stops })
  const map = view.theme?.map

  return (
    <main className="scr opening">
      <div className="opening-map" aria-hidden={!map}>
        {map && <img className="kb" src={map} alt={t('start.mapAlt')} fetchPriority="high" />}
      </div>
      <div className="opening-top">
        <div className="brand">{t('brand')}</div>
        {view.company?.logo && (
          <img
            className="company-logo"
            src={view.company.logo}
            alt={t('start.logoAlt', { company: view.company.name })}
          />
        )}
      </div>

      <div className="opening-stage" aria-hidden="true">
        <img className="side side-r bob" src={iconUrl('fruit')} alt="" />
        <img className="side side-l bob" src={iconUrl('tomatoes')} alt="" />
      </div>

      <div className="opening-sheet">
        <TornEdge />
        <Ribbon text={title} fontSize={ribbonFontSize(title)} />
        <p className="opening-summary">{summary}</p>
        <p className="opening-together">{t('start.together')}</p>
        <div className="foot">
          <BrushButton disabled={busy} onClick={() => run(() => act({ type: 'start' }))}>
            {t('start.button')}
          </BrushButton>
        </div>
      </div>
    </main>
  )
}
