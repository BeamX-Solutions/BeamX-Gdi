/**
 * Beacon's bands and categories (spec 0010): the fixed lists scoring, the advisory and
 * the view share. Kept apart so `scoring.ts` and `advisory.ts` never import each other
 * at runtime.
 */
export const bands = [
  "scale_ready",
  "stable_foundation",
  "building_blocks",
  "survival_mode",
  "red_alert",
] as const;
export type Band = (typeof bands)[number];

/** The fixed category order (ties in a sort keep it). */
export const categoryKeys = [
  "financial_health",
  "customer_strength",
  "operational_maturity",
  "financial_intelligence",
  "growth_resilience",
] as const;
export type CategoryKey = (typeof categoryKeys)[number];

/** Band labels as clients see them, without the original's emoji. */
export const bandLabels: Readonly<Record<Band, string>> = {
  scale_ready: "Scale-Ready",
  stable_foundation: "Stable Foundation",
  building_blocks: "Building Blocks",
  survival_mode: "Survival Mode",
  red_alert: "Red Alert",
};

/** A category with its key, for sorting. */
type Keyed<C> = readonly [CategoryKey, C];

/**
 * Categories weakest percentage first. Starts from the fixed order (never the object's
 * key order, which a jsonb round trip changes), and the sort is stable, so ties keep it.
 */
export const weakestFirst = <C extends { readonly percentage: number }>(
  categories: Readonly<Record<CategoryKey, C>>,
): readonly Keyed<C>[] =>
  categoryKeys
    .map((key): Keyed<C> => [key, categories[key]])
    .sort((a, b) => a[1].percentage - b[1].percentage);
