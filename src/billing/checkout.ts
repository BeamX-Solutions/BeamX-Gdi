/**
 * Buying credits (spec 0004, AC-13, AC-21): the checkout, the callback, the webhook and
 * the stale pending sweep. Every effect (session, DB, Paystack, rate limit, logging) is
 * passed in, so each flow is a plain function the edges wire up and tests drive with
 * fakes. Expected failures are typed results, never throws; only a DB outage throws.
 */
import { z } from "zod";
import type { Pack } from "./config";
import type { Transaction } from "./paystack";
import { err, ok, type Result } from "@/lib/result";

type Log = (
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null>>,
) => void;

/** What the checkout and the settle steps need from a payment row. */
export type PaymentView = {
  readonly id: string;
  readonly userId: string | null;
  readonly credits: number;
  readonly amountKobo: number;
  readonly currency: string;
  readonly status: "pending" | "succeeded" | "failed" | "abandoned";
  readonly createdAt: string;
};

export type PaidFields = {
  readonly transactionId: string;
  readonly paidAt: string | null;
  readonly amountKobo: number;
  readonly currency: string;
};

/** The checkout rate limit: 10 a user an hour (spec 0004, "Security model"). */
export const CHECKOUT_RATE = { window: 60 * 60, max: 10 } as const;

/** The sweep looks at payments `pending` this long after checkout (AC-13). */
export const SWEEP_AFTER_MINUTES = 60;
/** A payment with no success this long after checkout is `abandoned` (AC-13). */
export const ABANDON_AFTER_HOURS = 24;

const uuid = z.uuid();

/** True for a well formed UUID (references, `returnTo`). Pure. */
export const isUuid = (value: string | null | undefined): value is string =>
  typeof value === "string" && uuid.safeParse(value).success;

/**
 * The URL Paystack sends the client back to. `returnTo` (a conversation id) rides along
 * only when it is a UUID; ownership is checked on the way back. Pure.
 */
export const callbackUrl = (
  appUrl: string,
  returnTo: string | null,
): string => {
  const url = new URL("/credits/callback", appUrl);
  if (isUuid(returnTo)) url.searchParams.set("returnTo", returnTo);
  return url.toString();
};

export type CheckoutError =
  | { readonly code: "not_signed_in" }
  | { readonly code: "unknown_pack" }
  | { readonly code: "rate_limited" }
  | { readonly code: "paystack_unavailable" };

export type CheckoutDeps = {
  readonly user: {
    readonly id: string;
    readonly isAnonymous: boolean;
    readonly email: string;
  } | null;
  readonly packs: readonly Pack[];
  readonly appUrl: string;
  /** True when this user may start another checkout (rate limit, fails open). */
  readonly allow: (userId: string) => Promise<boolean>;
  /** Opens the credit account with what it is owed, so the purchase lands on it. */
  readonly openAccount: (userId: string) => Promise<unknown>;
  readonly createPayment: (
    userId: string,
    pack: {
      readonly id: string;
      readonly credits: number;
      readonly amountKobo: number;
    },
  ) => Promise<{ readonly id: string }>;
  readonly initialize: (input: {
    readonly email: string;
    readonly amountKobo: number;
    readonly reference: string;
    readonly callbackUrl: string;
    readonly currency: "NGN";
  }) => Promise<Result<{ readonly authorizationUrl: string }, unknown>>;
  readonly log: Log;
};

/**
 * Starts a checkout for a pack (AC-13): only a signed in account (never a guest), a pack
 * from config (never a price from the client), within the rate limit. The amount is
 * `priceNgn × 100` kobo, the reference is the new payment's id. Returns the Paystack page.
 */
export const startCheckout = async (
  deps: CheckoutDeps,
  input: { readonly packId: string; readonly returnTo: string | null },
): Promise<Result<{ readonly authorizationUrl: string }, CheckoutError>> => {
  const user = deps.user;
  if (user === null || user.isAnonymous) return err({ code: "not_signed_in" });
  const pack = deps.packs.find((p) => p.id === input.packId);
  if (pack === undefined) return err({ code: "unknown_pack" });
  if (!(await deps.allow(user.id))) return err({ code: "rate_limited" });
  await deps.openAccount(user.id);
  const amountKobo = pack.priceNgn * 100;
  const created = await deps.createPayment(user.id, {
    id: pack.id,
    credits: pack.credits,
    amountKobo,
  });
  const started = await deps.initialize({
    email: user.email,
    amountKobo,
    reference: created.id,
    callbackUrl: callbackUrl(deps.appUrl, input.returnTo),
    currency: "NGN",
  });
  if (!started.ok) {
    deps.log("paystack_unavailable", {
      step: "initialize",
      paymentId: created.id,
    });
    return err({ code: "paystack_unavailable" });
  }
  deps.log("checkout_started", {
    paymentId: created.id,
    userId: user.id,
    packId: pack.id,
  });
  return ok(started.value);
};

/** Where a payment stands after a settle attempt. */
export type SettleOutcome = "succeeded" | "pending" | "failed" | "mismatch";

export type SettleDeps = {
  readonly markSucceeded: (
    id: string,
    paid: PaidFields,
  ) => Promise<{ readonly granted: boolean }>;
  readonly markFailed: (id: string) => Promise<boolean>;
  readonly log: Log;
};

/**
 * Applies what Paystack says about one of our payments (AC-13), the same way for the
 * webhook, the callback and the sweep:
 * - already `succeeded`: nothing to do, ever (nothing leaves `succeeded`);
 * - `success` whose amount or currency differs from ours: nothing granted, logged as
 *   `payment_amount_mismatch`;
 * - `success`: marked succeeded with its credits granted, once, whoever comes first;
 * - `failed`: marked failed;
 * - anything else: still pending.
 */
export const settle = async (
  deps: SettleDeps,
  payment: PaymentView,
  transaction: Transaction,
  source: "webhook" | "callback" | "sweep",
): Promise<SettleOutcome> => {
  if (payment.status === "succeeded") return "succeeded";
  switch (transaction.status) {
    case "success": {
      if (
        transaction.amount !== payment.amountKobo ||
        transaction.currency !== payment.currency
      ) {
        deps.log("payment_amount_mismatch", {
          paymentId: payment.id,
          source,
          expectedKobo: payment.amountKobo,
          paidKobo: transaction.amount,
          currency: transaction.currency,
        });
        return "mismatch";
      }
      const result = await deps.markSucceeded(payment.id, {
        transactionId: transaction.id,
        paidAt: transaction.paidAt,
        amountKobo: transaction.amount,
        currency: transaction.currency,
      });
      if (result.granted)
        deps.log("payment_succeeded", {
          paymentId: payment.id,
          source,
          credits: payment.credits,
        });
      return "succeeded";
    }
    case "failed":
      if (await deps.markFailed(payment.id))
        deps.log("payment_failed", { paymentId: payment.id, source });
      return "failed";
    case "pending":
      return "pending";
    default: {
      const unreachable: never = transaction.status;
      return unreachable;
    }
  }
};

export type VerifyFn = (
  reference: string,
) => Promise<
  Result<
    Transaction,
    { readonly code: "paystack_unavailable" } | { readonly code: "not_found" }
  >
>;

export type CallbackOutcome = SettleOutcome | "not_found";

/**
 * The client's return from Paystack (AC-13): verifies on the server, never trusting the
 * query string. Another user's reference is `not_found`. Paystack down or not yet aware
 * of the payment is `pending`: no retry loop, the webhook or the sweep finishes it.
 */
export const handleCallback = async (
  deps: SettleDeps & {
    readonly forUser: (
      userId: string,
      id: string,
    ) => Promise<PaymentView | null>;
    readonly verify: VerifyFn;
  },
  userId: string,
  reference: string | null,
): Promise<CallbackOutcome> => {
  if (!isUuid(reference)) return "not_found";
  const payment = await deps.forUser(userId, reference);
  if (payment === null) return "not_found";
  if (payment.status === "succeeded") return "succeeded";
  const verified = await deps.verify(reference);
  if (!verified.ok) {
    if (verified.error.code === "paystack_unavailable")
      deps.log("paystack_unavailable", {
        step: "callback",
        paymentId: reference,
      });
    return "pending";
  }
  return settle(deps, payment, verified.value, "callback");
};

/**
 * Where the callback sends the client: back to the chat they bought from (only when it is
 * theirs) or to `/credits`, with the outcome for the status message. A failed or
 * mismatched payment always goes to `/credits`, where the packs are, to try again. Pure.
 */
export const callbackDestination = (
  outcome: CallbackOutcome,
  returnTo: string | null,
): string => {
  const status: PaymentNotice =
    outcome === "succeeded"
      ? "succeeded"
      : outcome === "pending"
        ? "pending"
        : outcome === "not_found"
          ? "not_found"
          : "failed";
  return returnTo !== null && (status === "succeeded" || status === "pending")
    ? `/c/${returnTo}?payment=${status}`
    : `/credits?payment=${status}`;
};

/** The `payment` query value the chat and `/credits` turn into a message. */
export type PaymentNotice = "succeeded" | "pending" | "failed" | "not_found";

const paymentNoticeSchema = z.enum([
  "succeeded",
  "pending",
  "failed",
  "not_found",
]);

/** The `payment` query value, or null when absent or unknown. Pure. */
export const parsePaymentNotice = (
  value: string | string[] | null | undefined,
): PaymentNotice | null => {
  const parsed = paymentNoticeSchema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

export type WebhookResponse = {
  readonly status: number;
  readonly body: Readonly<Record<string, unknown>>;
};

/**
 * The Paystack webhook (AC-13): 401 and nothing changed unless the signature over the raw
 * body matches. `charge.success` for one of our payments settles it; every other event,
 * and a reference that is not ours, is 200 (so Paystack stops retrying). A DB outage
 * throws, so the route answers 500 and Paystack retries.
 */
export const handleWebhook = async (
  deps: SettleDeps & {
    readonly validSignature: (raw: string, signature: string | null) => boolean;
    readonly parse: (
      raw: string,
    ) =>
      | { readonly kind: "charge_success"; readonly transaction: Transaction }
      | { readonly kind: "ignored"; readonly event: string }
      | null;
    readonly byId: (id: string) => Promise<PaymentView | null>;
  },
  rawBody: string,
  signature: string | null,
): Promise<WebhookResponse> => {
  if (!deps.validSignature(rawBody, signature)) {
    deps.log("paystack_webhook_rejected", { reason: "signature" });
    return { status: 401, body: { code: "unauthorized" } };
  }
  const event = deps.parse(rawBody);
  if (event === null) {
    deps.log("paystack_webhook_ignored", { reason: "unreadable" });
    return { status: 200, body: { ok: true } };
  }
  if (event.kind === "ignored") return { status: 200, body: { ok: true } };
  const reference = event.transaction.reference;
  const payment = isUuid(reference) ? await deps.byId(reference) : null;
  if (payment === null) {
    deps.log("paystack_webhook_ignored", { reason: "unknown_reference" });
    return { status: 200, body: { ok: true } };
  }
  const outcome = await settle(deps, payment, event.transaction, "webhook");
  return { status: 200, body: { ok: true, outcome } };
};

/**
 * The daily payment sweep (AC-13): every payment still `pending` an hour after checkout is
 * checked with Paystack. A success is granted, a failure marked failed; one with no
 * success 24 hours after checkout is marked `abandoned` (a later verified success still
 * grants it). Paystack down skips the payment until tomorrow. Stops starting new checks
 * once `budgetMs` is spent.
 */
export const sweepPayments = async (
  deps: SettleDeps & {
    readonly listStalePending: (
      olderThanMinutes: number,
      limit: number,
    ) => Promise<readonly PaymentView[]>;
    readonly verify: VerifyFn;
    readonly markAbandoned: (id: string, hours: number) => Promise<boolean>;
    readonly now: () => number;
    readonly budgetMs: number;
    readonly limit: number;
  },
): Promise<{
  readonly checked: number;
  readonly succeeded: number;
  readonly failed: number;
  readonly abandoned: number;
  readonly unavailable: number;
}> => {
  const started = deps.now();
  const stale = await deps.listStalePending(SWEEP_AFTER_MINUTES, deps.limit);
  const counts = {
    checked: 0,
    succeeded: 0,
    failed: 0,
    abandoned: 0,
    unavailable: 0,
  };
  for (const payment of stale) {
    if (deps.now() - started > deps.budgetMs) break;
    counts.checked += 1;
    const verified = await deps.verify(payment.id);
    if (!verified.ok && verified.error.code === "paystack_unavailable") {
      counts.unavailable += 1;
      continue;
    }
    const outcome = verified.ok
      ? await settle(deps, payment, verified.value, "sweep")
      : "pending";
    if (outcome === "succeeded") counts.succeeded += 1;
    else if (outcome === "failed") counts.failed += 1;
    else if (await deps.markAbandoned(payment.id, ABANDON_AFTER_HOURS))
      counts.abandoned += 1;
  }
  deps.log("payment_sweep", counts);
  return counts;
};
