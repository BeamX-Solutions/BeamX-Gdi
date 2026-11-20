/**
 * Report limits (spec 0002), in their own file with no DB import, so pure code (the
 * report status builder) can read them without pulling in the database client.
 */
export const STALE_AFTER_MINUTES = 10;
export const MAX_ATTEMPTS = 3;
