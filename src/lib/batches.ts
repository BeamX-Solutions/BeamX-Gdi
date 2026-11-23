/**
 * Runs a batch job until it runs dry or a time budget is spent (spec 0009, AC-14: the
 * guest purge works in batches of 50 within 120 seconds and leaves the rest for the next
 * day). Pure apart from the injected batch and clock, so the stopping rules have tests.
 */

/** What one batch did: rows it handled, plus a sum it reports (forfeited credits). */
export type BatchResult = { readonly count: number; readonly total: number };

export type BatchRunSummary = {
  readonly count: number;
  readonly total: number;
  readonly batches: number;
  /** False when the budget ran out before a short batch showed nothing was left. */
  readonly complete: boolean;
};

export const runInBatches = async (
  batch: (limit: number) => Promise<BatchResult>,
  options: {
    readonly batchSize: number;
    readonly budgetMs: number;
    readonly now: () => number;
  },
): Promise<BatchRunSummary> => {
  const started = options.now();
  let count = 0;
  let total = 0;
  let batches = 0;
  for (;;) {
    if (options.now() - started >= options.budgetMs)
      return { count, total, batches, complete: false };
    const result = await batch(options.batchSize);
    batches += 1;
    count += result.count;
    total += result.total;
    if (result.count < options.batchSize)
      return { count, total, batches, complete: true };
  }
};
