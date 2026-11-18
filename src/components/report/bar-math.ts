/** How full a bar is, from 0 to 1. Bad input (no max, NaN) gives an empty bar. */
export function barFraction(score: number, max: number): number {
  if (!Number.isFinite(score) || !Number.isFinite(max) || max <= 0) return 0;
  return Math.min(1, Math.max(0, score / max));
}

/** The value as text, like "6/10". Always shown beside the bar. */
export function barText(score: number, max: number): string {
  return `${score}/${max}`;
}
