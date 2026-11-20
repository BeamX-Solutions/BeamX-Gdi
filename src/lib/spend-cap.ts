/**
 * The daily AI spend cap hook (spec 0005, AC-12). The report runner calls it before each
 * phase. It allows everything until the abuse limits feature (#21) fills it in with the
 * Upstash daily counter (spec 0001).
 */
import { ok, type Result } from "./result";

export type SpendCapError = { readonly code: "spend_cap" };

export const checkSpendCap = async (
  userId: string,
): Promise<Result<void, SpendCapError>> => {
  void userId;
  return ok(undefined);
};
