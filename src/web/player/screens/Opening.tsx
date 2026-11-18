// Opening: the market map and the race title on a ribbon, waiting for the captain. There is no
// start here: the buyer starts the game from the manage page, and every phone follows by polling.
import { Doodles } from '../../shared/decor.tsx'
import { joinList } from '../copy.ts'
import { Paper, Ribbon, TornEdge } from '../draw.tsx'
import { iconUrl, ribbonFontSize } from '../logic.ts'
import type { ScreenProps } from './types.ts'

export function Opening({ view, t }: Omit<ScreenProps, 'act'>) {
  const title = t('start.ribbon', { name: view.honoree })
  const stops = view.totalStops
  const summary = view.allergens.length
    ? t('start.summaryAllergens', { stops, allergens: joinList(view.allergens) })
    : t('start.summary', { stops })
  const map = view.theme?.map
  const tint = view.theme?.palette.mapTint

  return (
    <main className="scr opening" data-decor={view.decor}>
      <div className="opening-map" aria-hidden={!map}>
        {map && <img className="kb" src={map} alt={t('start.mapAlt')} fetchPriority="high" />}
        {map && tint && <span className="map-tint" style={{ background: tint }} />}
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
        <Doodles
          decor={view.decor}
          className="opening-doodles"
          spots={[
            { top: -26, right: '3%', size: 58, rot: 8 },
            { top: -18, left: '2%', size: 54, rot: -10 },
            { top: 112, left: '3%', size: 40, rot: -6 },
            { top: 104, right: '4%', size: 38, rot: 12 },
            { top: 40, left: '-2%', size: 30, rot: 14 },
            { top: 36, right: '-1%', size: 28, rot: -12 },
          ]}
        />
        <Ribbon text={title} fontSize={ribbonFontSize(title)} />
        <p className="opening-summary">{summary}</p>
        <p className="opening-together">{t('start.together')}</p>
        <Paper className="wait-note rise" tilt={-1.4}>
          <h2 className="wait-title">{t('wait.title')}</h2>
          <p className="wait-body" role="status">
            {t('wait.body')}
          </p>
          <span className="wait-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
        </Paper>
      </div>
    </main>
  )
}
