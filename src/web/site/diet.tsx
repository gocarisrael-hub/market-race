// "Who doesn't eat what": allergen and diet chips, and for each ticked one how many of the group it
// is for (a small stepper, 1 up to the participants). Used by the order's diet stage and the
// manage page. Buyers are never told about swaps: we simply take care of it.
import { copy } from './copy.ts'
import { type Draft, restrictionCount, toggleRestriction } from './logic.ts'
import { Opt } from './ui.tsx'

export type DietValue = Pick<Draft, 'allergens' | 'diets' | 'restrictionCounts'>

export function DietPicker(props: {
  allergenOptions: readonly string[]
  dietOptions: readonly string[]
  people: number
  value: DietValue
  onChange: (v: DietValue) => void
  /** The id of the title the allergen chips are labelled by. */
  labelledBy: string
}) {
  const { value: v, people, onChange } = props
  const ticked = [...v.allergens, ...v.diets]
  const label = (k: string) => copy.home.dietLabels[k] ?? k
  const setCount = (k: string, n: number) =>
    onChange({ ...v, restrictionCounts: { ...v.restrictionCounts, [k]: Math.max(1, Math.min(people, n)) } })
  return (
    <>
      <fieldset className="row plain-set" aria-labelledby={props.labelledBy} style={{ gap: '2px 10px' }}>
        {props.allergenOptions.map((a) => (
          <Opt
            key={a}
            small
            role="checkbox"
            pressed={v.allergens.includes(a)}
            onClick={() => onChange(toggleRestriction(v, 'allergens', a))}
          >
            {a}
          </Opt>
        ))}
      </fieldset>
      <div className="label" id="l-diets" style={{ marginTop: 14 }}>
        {copy.home.diets}
      </div>
      <fieldset className="row plain-set" aria-labelledby="l-diets" style={{ gap: '2px 10px' }}>
        {props.dietOptions.map((x) => (
          <Opt
            key={x}
            small
            role="checkbox"
            pressed={v.diets.includes(x)}
            onClick={() => onChange(toggleRestriction(v, 'diets', x))}
          >
            {label(x)}
          </Opt>
        ))}
      </fieldset>
      {ticked.length > 0 && people > 1 && (
        <section className="diet-counts" aria-labelledby="l-diet-counts" data-testid="diet-counts">
          <div className="label" id="l-diet-counts">
            {copy.home.howMany}
          </div>
          <ul>
            {ticked.map((k) => {
              const n = restrictionCount({ people, restrictionCounts: v.restrictionCounts }, k)
              return (
                <li key={k} className="diet-count" data-key={k}>
                  <span className="what">{label(k)}</span>
                  <span className="stepper small-stepper">
                    <button
                      type="button"
                      aria-label={copy.home.howManyLess(label(k))}
                      disabled={n <= 1}
                      onClick={() => setCount(k, n - 1)}
                    >
                      −
                    </button>
                    <output className="n" aria-live="polite" aria-label={copy.home.howManyOf(label(k), n)}>
                      {n}
                    </output>
                    <button
                      type="button"
                      aria-label={copy.home.howManyMore(label(k))}
                      disabled={n >= people}
                      onClick={() => setCount(k, n + 1)}
                    >
                      +
                    </button>
                  </span>
                  <span className="unit">{copy.home.ofPeople(people)}</span>
                </li>
              )
            })}
          </ul>
        </section>
      )}
    </>
  )
}
