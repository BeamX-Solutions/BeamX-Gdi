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
