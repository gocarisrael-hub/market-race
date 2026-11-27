// Redeem: the screen the vendor checks. Day's code, who it is for, portions per tasting (a mixed
// stop lists the regular tasting and the alternative by name), allergens.
import { Icon } from '../../shared/decor.tsx'
import { LibIcon } from '../../shared/icon.tsx'
import { joinList } from '../copy.ts'
import { BrushButton, Paper, Underline } from '../draw.tsx'
import { stopIconKey } from '../logic.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

export function Redeem({ view, t, act }: ScreenProps) {
  const cur = view.current!
  const rd = cur.redeem!
  const { busy, run } = useBusy()
  const digits = [...rd.code]
  // Older servers send no items: one tasting for everyone.
  const items = rd.items?.length ? rd.items : [{ count: rd.portions, tasting: rd.tasting }]
  const mixed = items.length > 1
  const { count: portions, tasting } = items[0]
  return (
    <main className="scr redeem">
      <header className="redeem-head">
        <div className="muted-label">{t('redeem.stopOf', { n: view.stage, total: view.stages.length })}</div>
        <h1 className="redeem-title">{t('redeem.title')}</h1>
        {cur.reveal && <div className="redeem-stall">{cur.reveal.stall.name}</div>}
      </header>

      <span className="redeem-art">
        <LibIcon
          icon={stopIconKey(cur.index, cur.reveal?.tasting.icon)}
          size={120}
          className="redeem-icon bob"
          eager
          style={{ width: undefined, height: undefined }}
        />
        <LibIcon icon="reactions/face-yummy" size={44} tilt={10} className="redeem-yum pop" eager />
      </span>

      <div className="code-block">
        <div className="muted-label with-icon">
          <LibIcon icon="game/key" size={32} tilt={-10} />
          {t('redeem.codeLabel')}
        </div>
        <div
          className="code"
          dir="ltr"
          role="img"
          aria-label={`${t('redeem.codeLabel')}: ${digits.join(' ')}`}
        >
          {digits.map((d, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: digits are positional
              key={i}
              className="digit rise"
              style={{ ['--r' as string]: `${[-4, 3, -2, 4][i % 4]}deg`, animationDelay: `${i * 0.1}s` }}
            >
              {d}
            </span>
          ))}
        </div>
        <Underline className="code-line" />
      </div>

      <div className="redeem-what">
        {mixed ? (
          // A mixed stop: each tasting with its portions, by its own name (the stall must know).
          <div className="portions mixed" data-testid="portions">
            <LibIcon icon="game/fork-knife" size={34} tilt={-4} />
            <ul>
              {items.map((it) => (
                <li key={it.tasting}>{t('redeem.item', { n: it.count, tasting: it.tasting })}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="portions" data-testid="portions">
            <LibIcon icon="game/fork-knife" size={34} tilt={-4} />
            {portions === 1
              ? t('redeem.portionsOne', { tasting: tasting })
              : t('redeem.portions', { n: portions, tasting: tasting })}
          </div>
        )}
        <div className="for">
          <Icon name="people" size={26} tilt={4} />
          {t('redeem.for', { name: rd.name })}
        </div>
      </div>

      {rd.allergens.length > 0 && (
        <Paper className="allergy" tilt={-2}>
          <Icon name="alert" size={30} />
          {t('redeem.allergens', { allergens: joinList(rd.allergens) })}
        </Paper>
      )}

      <div className="foot">
        <BrushButton
          disabled={busy}
          onClick={() => run(() => act({ type: 'redeemed', stopIndex: cur.index }))}
        >
          {cur.finale ? t('redeem.buttonLast') : t('redeem.button')}
        </BrushButton>
      </div>
    </main>
  )
}
