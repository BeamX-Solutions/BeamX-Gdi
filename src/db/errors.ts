/**
 * The code raised by `billing_assert(ok, code)` (SQLSTATE P0001), found anywhere in the
 * cause chain, or null when `e` is some other error.
 */
export const billingAssertCode = (e: unknown): string | null => {
  let current: unknown = e;
  for (
    let depth = 0;
    depth < 4 && typeof current === "object" && current;
    depth++
  ) {
    const c = current as { code?: unknown; message?: unknown; cause?: unknown };
    if (c.code === "P0001" && typeof c.message === "string") return c.message;
    current = c.cause;
  }
  return null;
};

/** True when `e` (or its cause chain) is a Postgres unique violation (23505) on `constraint`. */
export const isUniqueViolation = (e: unknown, constraint: string): boolean => {
  let current: unknown = e;
  for (
    let depth = 0;
    depth < 4 && typeof current === "object" && current;
    depth++
  ) {
    const c = current as {
      code?: unknown;
      constraint?: unknown;
      cause?: unknown;
    };
    if (c.code === "23505" && c.constraint === constraint) return true;
    current = c.cause;
  }
  return false;
};
