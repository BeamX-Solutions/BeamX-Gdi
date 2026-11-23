/**
 * Paystack (spec 0004, AC-13): a typed `fetch` wrapper for the two calls the checkout
 * needs, initialize and verify, plus the webhook signature check. Every response is Zod
 * parsed; any network error, non 2xx answer, or unexpected shape is
 * `paystack_unavailable`, never a throw. The secret and `fetch` are passed in, so the
 * module reads no env and tests use recorded fixtures.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

export const PAYSTACK_API = "https://api.paystack.co";

/** How long one Paystack call may take before it counts as unavailable. */
const TIMEOUT_MS = 10_000;

export type PaystackDeps = {
  /** Null or undefined when billing is not configured: every call is unavailable. */
  readonly secretKey: string | undefined;
  readonly fetch: typeof fetch;
  readonly baseUrl?: string;
};

export type PaystackUnavailable = { readonly code: "paystack_unavailable" };

/**
 * What the app cares about in a Paystack transaction. `status` folds Paystack's many
 * states into three: `success`, `failed` (failed or reversed), and `pending` (abandoned,
 * ongoing, pending, processing, queued: the customer may still pay).
 */
export type Transaction = {
  readonly id: string;
  readonly reference: string;
  readonly status: "success" | "failed" | "pending";
  readonly amount: number;
  readonly currency: string;
  readonly paidAt: string | null;
};

const transactionSchema = z.object({
  id: z.union([z.number(), z.string()]).transform(String),
  reference: z.string().min(1),
  status: z.string(),
  amount: z.number().int(),
  currency: z.string(),
  paid_at: z.string().nullish(),
  paidAt: z.string().nullish(),
});

/** Paystack's statuses mapped to the three the app acts on. Pure. */
export const transactionStatus = (status: string): Transaction["status"] => {
  switch (status) {
    case "success":
      return "success";
    case "failed":
    case "reversed":
      return "failed";
    default:
      return "pending";
  }
};

const toTransaction = (t: z.infer<typeof transactionSchema>): Transaction => ({
  id: t.id,
  reference: t.reference,
  status: transactionStatus(t.status),
  amount: t.amount,
  currency: t.currency,
  paidAt: t.paid_at ?? t.paidAt ?? null,
});

const initializeResponse = z.object({
  status: z.literal(true),
  data: z.object({ authorization_url: z.url(), reference: z.string() }),
});

const verifyResponse = z.object({
  status: z.literal(true),
  data: transactionSchema,
});

/** Paystack's answer for a reference it has never seen (recorded: 400 with this code). */
const notFoundBody = z.object({
  status: z.literal(false),
  code: z.literal("transaction_not_found"),
});

const UNAVAILABLE: PaystackUnavailable = { code: "paystack_unavailable" };

/** One authorized JSON call; null on any network, status, or JSON failure. */
const call = async (
  deps: PaystackDeps,
  path: string,
  init: { readonly method: "GET" | "POST"; readonly body?: unknown },
): Promise<{ readonly status: number; readonly json: unknown } | null> => {
  if (!deps.secretKey) return null;
  try {
    const res = await deps.fetch(`${deps.baseUrl ?? PAYSTACK_API}${path}`, {
      method: init.method,
      headers: {
        Authorization: `Bearer ${deps.secretKey}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
    const json: unknown = await res.json().catch(() => null);
    return { status: res.status, json };
  } catch {
    return null;
  }
};

export type InitializeInput = {
  readonly email: string;
  readonly amountKobo: number;
  /** Our `payment.id`. */
  readonly reference: string;
  readonly callbackUrl: string;
  readonly currency: "NGN";
};

/** Starts a hosted checkout and returns the page to send the client to. */
export const initialize = async (
  deps: PaystackDeps,
  input: InitializeInput,
): Promise<
  Result<{ readonly authorizationUrl: string }, PaystackUnavailable>
> => {
  const res = await call(deps, "/transaction/initialize", {
    method: "POST",
    body: {
      email: input.email,
      amount: input.amountKobo,
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: input.currency,
    },
  });
  if (res === null || res.status < 200 || res.status >= 300)
    return err(UNAVAILABLE);
  const parsed = initializeResponse.safeParse(res.json);
  return parsed.success
    ? ok({ authorizationUrl: parsed.data.data.authorization_url })
    : err(UNAVAILABLE);
};

/**
 * Asks Paystack for a transaction's state by our reference. An unknown reference (Paystack
 * answers 400 `transaction_not_found`, or 404) means the client never reached the page:
 * it is returned as `not_found`, not as unavailable, so the sweep can abandon it.
 */
export const verify = async (
  deps: PaystackDeps,
  reference: string,
): Promise<
  Result<Transaction, PaystackUnavailable | { readonly code: "not_found" }>
> => {
  const res = await call(
    deps,
    `/transaction/verify/${encodeURIComponent(reference)}`,
    { method: "GET" },
  );
  if (res === null) return err(UNAVAILABLE);
  if (res.status === 404 || notFoundBody.safeParse(res.json).success)
    return err({ code: "not_found" });
  if (res.status < 200 || res.status >= 300) return err(UNAVAILABLE);
  const parsed = verifyResponse.safeParse(res.json);
  return parsed.success
    ? ok(toTransaction(parsed.data.data))
    : err(UNAVAILABLE);
};

/**
 * The webhook's signature check: `x-paystack-signature` must be the hex HMAC SHA512 of
 * the raw body with the secret key. Constant time; false with no secret or no header.
 */
export const validSignature = (
  rawBody: string,
  signature: string | null,
  secretKey: string | undefined,
): boolean => {
  if (!secretKey || !signature) return false;
  const expected = createHmac("sha512", secretKey)
    .update(rawBody, "utf8")
    .digest();
  const given = Buffer.from(signature, "hex");
  return given.length === expected.length && timingSafeEqual(given, expected);
};

const webhookSchema = z.object({
  event: z.string(),
  data: z.unknown(),
});

export type WebhookEvent =
  | { readonly kind: "charge_success"; readonly transaction: Transaction }
  | { readonly kind: "ignored"; readonly event: string };

/**
 * The webhook body (after the signature check). Only `charge.success` matters; every
 * other event is `ignored` (answered 200). Null when the body is not a Paystack event.
 */
export const parseWebhook = (rawBody: string): WebhookEvent | null => {
  let json: unknown;
  try {
    json = JSON.parse(rawBody);
  } catch {
    return null;
  }
  const event = webhookSchema.safeParse(json);
  if (!event.success) return null;
  if (event.data.event !== "charge.success")
    return { kind: "ignored", event: event.data.event };
  const transaction = transactionSchema.safeParse(event.data.data);
  return transaction.success
    ? { kind: "charge_success", transaction: toTransaction(transaction.data) }
    : null;
};
