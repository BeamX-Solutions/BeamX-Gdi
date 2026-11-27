/**
 * Calendly's webhook signature (spec 0016, AC-4): `Calendly-Webhook-Signature` is
 * `t=<unix seconds>,v1=<hex>`, where v1 is the HMAC SHA256 of `<t>.<raw body>` under
 * the subscription's signing key. A signature older than 5 minutes is refused, so a
 * captured request can't be replayed later. Pure apart from the hash.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNATURE_TOLERANCE_S = 5 * 60;

/** `t` and `v1` from the header, or null when either is missing. */
export const parseSignature = (
  header: string | null,
): { readonly t: number; readonly v1: string } | null => {
  if (header === null) return null;
  const parts = new Map(
    header.split(",").flatMap((part) => {
      const at = part.indexOf("=");
      return at > 0
        ? [[part.slice(0, at).trim(), part.slice(at + 1).trim()] as const]
        : [];
    }),
  );
  const t = Number(parts.get("t"));
  const v1 = parts.get("v1");
  return Number.isInteger(t) && v1 !== undefined && /^[0-9a-f]+$/i.test(v1)
    ? { t, v1 }
    : null;
};

export const signPayload = (key: string, t: number, rawBody: string): string =>
  createHmac("sha256", key).update(`${t}.${rawBody}`).digest("hex");

export const validSignature = (
  rawBody: string,
  header: string | null,
  key: string,
  nowS: number,
): boolean => {
  const sig = parseSignature(header);
  if (sig === null || Math.abs(nowS - sig.t) > SIGNATURE_TOLERANCE_S)
    return false;
  const expected = Buffer.from(signPayload(key, sig.t, rawBody), "hex");
  const given = Buffer.from(sig.v1, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
};
