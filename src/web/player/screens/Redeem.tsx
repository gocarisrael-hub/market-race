// Redeem: the screen the vendor checks. Day's code, who it is for, portions, tasting, allergens.
import { Icon } from '../../shared/decor.tsx'
import { joinList } from '../copy.ts'
import { BrushButton, Paper, Underline } from '../draw.tsx'
import { stopIcon } from '../logic.ts'
import type { ScreenProps } from './types.ts'
import { useBusy } from './useBusy.ts'

export function Redeem({ view, t, act }: ScreenProps) {
  const cur = view.current!
  const rd = cur.redeem!
  const { busy, run } = useBusy()
  const digits = [...rd.code]
  return (
    <main className="scr redeem">
      <header className="redeem-head">
        <div className="muted-label">{t('redeem.stopOf', { n: cur.index + 1, total: view.totalStops })}</div>
        <h1 className="redeem-title">{t('redeem.title')}</h1>
        {cur.reveal && <div className="redeem-stall">{cur.reveal.stall.name}</div>}
      </header>

      <img className="redeem-icon bob" src={stopIcon(cur.index)} alt="" />

      <div className="code-block">
        <div className="muted-label with-icon">
          <Icon name="key" size={28} tilt={-10} />
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
        <div className="portions">
          <Icon name="plate" size={34} tilt={-4} />
          {rd.portions === 1
            ? t('redeem.portionsOne', { tasting: rd.tasting })
            : t('redeem.portions', { n: rd.portions, tasting: rd.tasting })}
        </div>
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
