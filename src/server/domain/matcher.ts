// Forgiving answer checking (SPEC: trim, case-fold, strip niqqud and punctuation,
// exact match against the accepted list, then edit distance <= 1).

const NIQQUD = /[֑-ׇ]/g
// Letters (any script) and digits survive; everything else becomes a space or is dropped.
const APOSTROPHES = /['"׳״‘’“”`´]/g
const NON_WORD = /[^\p{L}\p{N}]+/gu

export function normalizeAnswer(input: string): string {
  return input
    .normalize('NFC')
    .replace(NIQQUD, '')
    .replace(APOSTROPHES, '')
    .toLowerCase()
    .replace(NON_WORD, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

/** Levenshtein distance with an early exit once it exceeds `max`. */
export function editDistance(a: string, b: string, max = Number.POSITIVE_INFINITY): number {
  if (a === b) return 0
  if (Math.abs(a.length - b.length) > max) return max + 1
  const ca = [...a]
  const cb = [...b]
  let prev = Array.from({ length: cb.length + 1 }, (_, i) => i)
  for (let i = 1; i <= ca.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= cb.length; j++) {
      const cost = ca[i - 1] === cb[j - 1] ? 0 : 1
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost)
      rowMin = Math.min(rowMin, cur[j])
    }
    if (rowMin > max) return max + 1
    prev = cur
  }
  return prev[cb.length]
}

export type MatchResult = { ok: true; via: 'exact' | 'fuzzy'; matched: string } | { ok: false }

export function matchAnswer(input: string, answer: string, accepted: string[] = []): MatchResult {
  const guess = normalizeAnswer(input)
  if (!guess) return { ok: false }
  const targets = [...new Set([answer, ...accepted].map(normalizeAnswer).filter(Boolean))]
  for (const t of targets) if (t === guess) return { ok: true, via: 'exact', matched: t }
  // Without spaces too: "פלאפל בפיתה" vs "פלאפלבפיתה".
  const squash = (s: string) => s.replace(/ /g, '')
  for (const t of targets) if (squash(t) === squash(guess)) return { ok: true, via: 'exact', matched: t }
  for (const t of targets) {
    // Fuzzy only for answers long enough that one edit is still the same word.
    if ([...t].length >= 3 && editDistance(t, guess, 1) <= 1) return { ok: true, via: 'fuzzy', matched: t }
  }
  return { ok: false }
}
