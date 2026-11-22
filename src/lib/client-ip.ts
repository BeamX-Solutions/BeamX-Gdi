/**
 * The client's IP for the abuse limits (spec 0008). Vercel sets and overwrites
 * `x-forwarded-for`, so its first address is the client; `x-real-ip` is the fallback.
 * With no IP, the IP limits are skipped (never one shared bucket for everyone).
 */
import { env } from "./env";
import { logEvent } from "./log";

const first = (value: string | null): string | null => {
  const ip = value?.split(",")[0]?.trim();
  return ip ? ip : null;
};

/** The client IP from request headers, or null. Pure. */
export const clientIp = (headers: Headers): string | null =>
  first(headers.get("x-forwarded-for")) ?? first(headers.get("x-real-ip"));

/** `clientIp`, logging `client_ip_missing` when a Vercel deploy has none. */
export const requestIp = (headers: Headers): string | null => {
  const ip = clientIp(headers);
  if (ip === null && env.VERCEL) logEvent("client_ip_missing", {});
  return ip;
};
