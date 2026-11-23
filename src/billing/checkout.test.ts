import { describe, expect, it, vi } from "vitest";
import {
  callbackDestination,
  callbackUrl,
  handleCallback,
  handleWebhook,
  parsePaymentNotice,
  settle,
  startCheckout,
  sweepPayments,
  type CheckoutDeps,
  type PaymentView,
  type SettleDeps,
  type VerifyFn,
} from "./checkout";
import { billingConfig } from "./config";
import type { Transaction } from "./paystack";
import { err, ok } from "@/lib/result";

// Spec 0004, AC-8, AC-13, AC-21: the buying flows with fakes for every effect.

const USER = "0190a1b2-0000-7000-8000-0000000000aa";
const PAYMENT = "0190a1b2-0000-7000-8000-000000000001";
const CHAT = "0190a1b2-0000-7000-8000-0000000000cc";

const checkoutDeps = (over: Partial<CheckoutDeps> = {}) => {
  const deps = {
    user: { id: USER, isAnonymous: false, email: "ada@test.beamx" },
    packs: billingConfig.packs,
    appUrl: "https://app.test",
    allow: vi.fn(async () => true),
    openAccount: vi.fn(async () => undefined),
    createPayment: vi.fn(async () => ({ id: PAYMENT })),
    initialize: vi.fn(async () =>
      ok({ authorizationUrl: "https://checkout.paystack.com/x" }),
    ),
    log: vi.fn(),
    ...over,
  };
  return deps;
};

describe("startCheckout", () => {
  it("starts a pack's checkout at the config price, in kobo, with our reference", async () => {
    const deps = checkoutDeps();
    const result = await startCheckout(deps, {
      packId: "p300",
      returnTo: CHAT,
    });
    expect(result).toEqual(
      ok({ authorizationUrl: "https://checkout.paystack.com/x" }),
    );
    expect(deps.openAccount).toHaveBeenCalledWith(USER);
    expect(deps.createPayment).toHaveBeenCalledWith(USER, {
      id: "p300",
      credits: 300,
      amountKobo: 2_700_000,
    });
    expect(deps.initialize).toHaveBeenCalledWith({
      email: "ada@test.beamx",
      amountKobo: 2_700_000,
      reference: PAYMENT,
      callbackUrl: `https://app.test/credits/callback?returnTo=${CHAT}`,
      currency: "NGN",
    });
  });

  it("refuses guests and no session before touching anything (AC-13)", async () => {
    for (const user of [
      null,
      { id: USER, isAnonymous: true, email: "guest@anon.local" },
    ]) {
      const deps = checkoutDeps({ user });
      expect(
        await startCheckout(deps, { packId: "p100", returnTo: null }),
      ).toEqual(err({ code: "not_signed_in" }));
      expect(deps.createPayment).not.toHaveBeenCalled();
      expect(deps.allow).not.toHaveBeenCalled();
    }
  });

  it("refuses a pack that is not in config", async () => {
    const deps = checkoutDeps();
    expect(await startCheckout(deps, { packId: "p5", returnTo: null })).toEqual(
      err({ code: "unknown_pack" }),
    );
    expect(deps.createPayment).not.toHaveBeenCalled();
  });

  it("is rate limited before any payment is made", async () => {
    const deps = checkoutDeps({ allow: vi.fn(async () => false) });
    expect(
      await startCheckout(deps, { packId: "p100", returnTo: null }),
    ).toEqual(err({ code: "rate_limited" }));
    expect(deps.createPayment).not.toHaveBeenCalled();
  });

  it("answers paystack_unavailable when Paystack can't start it (AC-21)", async () => {
    const deps = checkoutDeps({
      initialize: vi.fn(async () => err({ code: "paystack_unavailable" })),
    });
    expect(
      await startCheckout(deps, { packId: "p100", returnTo: null }),
    ).toEqual(err({ code: "paystack_unavailable" }));
    expect(deps.log).toHaveBeenCalledWith(
      "paystack_unavailable",
      expect.objectContaining({ paymentId: PAYMENT }),
    );
  });
});

describe("callbackUrl", () => {
  it("adds returnTo only when it is a UUID", () => {
    expect(callbackUrl("https://app.test", CHAT)).toBe(
      `https://app.test/credits/callback?returnTo=${CHAT}`,
    );
    expect(callbackUrl("https://app.test", null)).toBe(
      "https://app.test/credits/callback",
    );
    expect(callbackUrl("https://app.test", "https://evil.test")).toBe(
      "https://app.test/credits/callback",
    );
  });
});

const payment = (over: Partial<PaymentView> = {}): PaymentView => ({
  id: PAYMENT,
  userId: USER,
  credits: 100,
  amountKobo: 1_000_000,
  currency: "NGN",
  status: "pending",
  createdAt: "2026-11-23 10:00:00.000000+00",
  ...over,
});

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: "4099260516",
  reference: PAYMENT,
  status: "success",
  amount: 1_000_000,
  currency: "NGN",
  paidAt: "2026-11-23T10:15:00.000Z",
  ...over,
});

/** A fake payment store where only the first success grants, like the SQL. */
const store = (initial: PaymentView = payment()) => {
  let row = initial;
  let grants = 0;
  const deps: SettleDeps = {
    markSucceeded: vi.fn(async () => {
      if (row.status === "succeeded") return { granted: false };
      row = { ...row, status: "succeeded" };
      grants += 1;
      return { granted: true };
    }),
    markFailed: vi.fn(async () => {
      if (row.status !== "pending") return false;
      row = { ...row, status: "failed" };
      return true;
    }),
    log: vi.fn(),
  };
  return { deps, row: () => row, grants: () => grants };
};

describe("settle", () => {
  it("grants a matching success once", async () => {
    const s = store();
    expect(await settle(s.deps, s.row(), txn(), "webhook")).toBe("succeeded");
    expect(s.deps.markSucceeded).toHaveBeenCalledWith(PAYMENT, {
      transactionId: "4099260516",
      paidAt: "2026-11-23T10:15:00.000Z",
      amountKobo: 1_000_000,
      currency: "NGN",
    });
    expect(s.grants()).toBe(1);
  });

  it("does nothing for a payment already succeeded", async () => {
    const s = store(payment({ status: "succeeded" }));
    expect(await settle(s.deps, s.row(), txn(), "callback")).toBe("succeeded");
    expect(s.deps.markSucceeded).not.toHaveBeenCalled();
  });

  it("grants nothing and logs when the amount or currency differs (AC-13)", async () => {
    for (const t of [txn({ amount: 100 }), txn({ currency: "USD" })]) {
      const s = store();
      expect(await settle(s.deps, s.row(), t, "webhook")).toBe("mismatch");
      expect(s.deps.markSucceeded).not.toHaveBeenCalled();
      expect(s.deps.log).toHaveBeenCalledWith(
        "payment_amount_mismatch",
        expect.objectContaining({ paymentId: PAYMENT }),
      );
    }
  });

  it("still grants a late success on an abandoned payment", async () => {
    const s = store(payment({ status: "abandoned" }));
    expect(await settle(s.deps, s.row(), txn(), "webhook")).toBe("succeeded");
    expect(s.grants()).toBe(1);
  });

  it("marks a failure failed and leaves pending alone", async () => {
    const s = store();
    expect(
      await settle(s.deps, s.row(), txn({ status: "pending" }), "sweep"),
    ).toBe("pending");
    expect(s.deps.markFailed).not.toHaveBeenCalled();
    expect(
      await settle(s.deps, s.row(), txn({ status: "failed" }), "sweep"),
    ).toBe("failed");
    expect(s.row().status).toBe("failed");
  });
});

describe("handleCallback", () => {
  const callbackDeps = (
    s: ReturnType<typeof store>,
    verify: VerifyFn = vi.fn(async () => ok(txn())),
  ) => ({
    ...s.deps,
    forUser: vi.fn(async (userId: string, id: string) =>
      userId === USER && id === PAYMENT ? s.row() : null,
    ),
    verify,
  });

  it("verifies on the server and grants", async () => {
    const s = store();
    expect(await handleCallback(callbackDeps(s), USER, PAYMENT)).toBe(
      "succeeded",
    );
    expect(s.grants()).toBe(1);
  });

  it("is not_found for a bad reference or another user's payment", async () => {
    const s = store();
    const deps = callbackDeps(s);
    expect(await handleCallback(deps, USER, null)).toBe("not_found");
    expect(await handleCallback(deps, USER, "junk")).toBe("not_found");
    expect(
      await handleCallback(
        deps,
        "0190a1b2-0000-7000-8000-0000000000bb",
        PAYMENT,
      ),
    ).toBe("not_found");
    expect(deps.verify).not.toHaveBeenCalled();
  });

  it("is pending when Paystack is down or does not know it yet, with no retry", async () => {
    for (const code of ["paystack_unavailable", "not_found"] as const) {
      const s = store();
      const verify = vi.fn(async () => err({ code }));
      expect(await handleCallback(callbackDeps(s, verify), USER, PAYMENT)).toBe(
        "pending",
      );
      expect(verify).toHaveBeenCalledTimes(1);
      expect(s.grants()).toBe(0);
    }
  });

  it("skips Paystack when the webhook already granted it", async () => {
    const s = store(payment({ status: "succeeded" }));
    const deps = callbackDeps(s);
    expect(await handleCallback(deps, USER, PAYMENT)).toBe("succeeded");
    expect(deps.verify).not.toHaveBeenCalled();
  });
});

describe("callbackDestination", () => {
  it("returns to the chat on success or pending, else to /credits", () => {
    expect(callbackDestination("succeeded", CHAT)).toBe(
      `/c/${CHAT}?payment=succeeded`,
    );
    expect(callbackDestination("pending", CHAT)).toBe(
      `/c/${CHAT}?payment=pending`,
    );
    expect(callbackDestination("failed", CHAT)).toBe("/credits?payment=failed");
    expect(callbackDestination("mismatch", CHAT)).toBe(
      "/credits?payment=failed",
    );
    expect(callbackDestination("not_found", null)).toBe(
      "/credits?payment=not_found",
    );
    expect(callbackDestination("succeeded", null)).toBe(
      "/credits?payment=succeeded",
    );
  });
});

describe("parsePaymentNotice", () => {
  it("accepts only known values", () => {
    expect(parsePaymentNotice("succeeded")).toBe("succeeded");
    expect(parsePaymentNotice("hacked")).toBeNull();
    expect(parsePaymentNotice(["succeeded"])).toBeNull();
    expect(parsePaymentNotice(undefined)).toBeNull();
  });
});

describe("handleWebhook", () => {
  const event = { kind: "charge_success" as const, transaction: txn() };
  const webhookDeps = (
    s: ReturnType<typeof store>,
    over: { valid?: boolean; parsed?: unknown } = {},
  ) => ({
    ...s.deps,
    validSignature: vi.fn(() => over.valid ?? true),
    parse: vi.fn(() =>
      over.parsed === undefined ? event : (over.parsed as typeof event | null),
    ),
    byId: vi.fn(async (id: string) => (id === PAYMENT ? s.row() : null)),
  });

  it("answers 401 and changes nothing on a bad signature (AC-13)", async () => {
    const s = store();
    const deps = webhookDeps(s, { valid: false });
    const res = await handleWebhook(deps, "{}", "bad");
    expect(res.status).toBe(401);
    expect(deps.parse).not.toHaveBeenCalled();
    expect(deps.byId).not.toHaveBeenCalled();
    expect(s.grants()).toBe(0);
  });

  it("grants charge.success for our payment", async () => {
    const s = store();
    const res = await handleWebhook(webhookDeps(s), "{}", "sig");
    expect(res).toEqual({
      status: 200,
      body: { ok: true, outcome: "succeeded" },
    });
    expect(s.grants()).toBe(1);
  });

  it("answers 200 for other events, unreadable bodies, and references not ours", async () => {
    const s = store();
    for (const parsed of [
      { kind: "ignored", event: "transfer.success" },
      null,
      { kind: "charge_success", transaction: txn({ reference: "LUNA-123" }) },
      {
        kind: "charge_success",
        transaction: txn({ reference: "0190a1b2-0000-7000-8000-00000000ffff" }),
      },
    ]) {
      const res = await handleWebhook(webhookDeps(s, { parsed }), "{}", "sig");
      expect(res.status).toBe(200);
    }
    expect(s.grants()).toBe(0);
  });

  it("grants once when the webhook and the callback arrive together (AC-13)", async () => {
    const s = store();
    await Promise.all([
      handleWebhook(webhookDeps(s), "{}", "sig"),
      handleCallback(
        {
          ...s.deps,
          forUser: async () => s.row(),
          verify: async () => ok(txn()),
        },
        USER,
        PAYMENT,
      ),
    ]);
    expect(s.grants()).toBe(1);
  });
});

describe("sweepPayments", () => {
  const sweepDeps = (
    rows: readonly PaymentView[],
    verify: VerifyFn,
    over: { now?: () => number; budgetMs?: number } = {},
  ) => {
    const s = store();
    return {
      ...s.deps,
      markSucceeded: vi.fn(async () => ({ granted: true })),
      markFailed: vi.fn(async () => true),
      listStalePending: vi.fn(async () => rows),
      verify: vi.fn(verify),
      markAbandoned: vi.fn(async () => true),
      now: over.now ?? (() => 0),
      budgetMs: over.budgetMs ?? 60_000,
      limit: 100,
    };
  };

  const id = (n: number) => `0190a1b2-0000-7000-8000-00000000000${n}`;

  it("grants successes, fails failures, abandons the rest, and skips Paystack outages", async () => {
    const rows = [1, 2, 3, 4, 5].map((n) => payment({ id: id(n) }));
    const deps = sweepDeps(rows, async (ref) => {
      if (ref === id(1)) return ok(txn({ reference: ref }));
      if (ref === id(2)) return ok(txn({ reference: ref, status: "failed" }));
      if (ref === id(3)) return ok(txn({ reference: ref, status: "pending" }));
      if (ref === id(4)) return err({ code: "not_found" });
      return err({ code: "paystack_unavailable" });
    });
    const counts = await sweepPayments(deps);
    expect(deps.listStalePending).toHaveBeenCalledWith(60, 100);
    expect(counts).toEqual({
      checked: 5,
      succeeded: 1,
      failed: 1,
      abandoned: 2,
      unavailable: 1,
    });
    expect(deps.markAbandoned).toHaveBeenCalledWith(id(3), 24);
    expect(deps.markAbandoned).toHaveBeenCalledWith(id(4), 24);
    expect(deps.markAbandoned).toHaveBeenCalledTimes(2);
  });

  it("stops starting checks once the time budget is spent", async () => {
    let t = 0;
    const deps = sweepDeps(
      [1, 2, 3].map((n) => payment({ id: id(n) })),
      async (ref) => {
        t += 40_000;
        return ok(txn({ reference: ref, status: "pending" }));
      },
      { now: () => t, budgetMs: 60_000 },
    );
    const counts = await sweepPayments(deps);
    expect(counts.checked).toBe(2);
  });
});
