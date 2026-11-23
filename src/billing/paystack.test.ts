import { createHmac } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import {
  initialize,
  parseWebhook,
  transactionStatus,
  validSignature,
  verify,
  type PaystackDeps,
} from "./paystack";

// Spec 0004, AC-13: the Paystack client and the webhook signature check, against
// recorded response shapes.

const SECRET = "sk_test_0123456789abcdef";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const deps = (
  respond: () => Promise<Response>,
  secretKey: string = SECRET,
): PaystackDeps & { readonly calls: ReturnType<typeof vi.fn> } => {
  const calls = vi.fn(respond);
  return {
    secretKey,
    fetch: calls as unknown as typeof fetch,
    calls,
  };
};

// Recorded from the Paystack API docs (test mode), trimmed to the fields we read.
const INITIALIZE_OK = {
  status: true,
  message: "Authorization URL created",
  data: {
    authorization_url: "https://checkout.paystack.com/0peioxfhpn",
    access_code: "0peioxfhpn",
    reference: "0190a1b2-0000-7000-8000-000000000001",
  },
};

const transaction = (over: Record<string, unknown> = {}) => ({
  id: 4099260516,
  domain: "test",
  status: "success",
  reference: "0190a1b2-0000-7000-8000-000000000001",
  amount: 1_000_000,
  currency: "NGN",
  paid_at: "2026-11-23T10:15:00.000Z",
  channel: "card",
  ...over,
});

const VERIFY_OK = {
  status: true,
  message: "Verification successful",
  data: transaction(),
};

const input = {
  email: "ada@test.beamx",
  amountKobo: 1_000_000,
  reference: "0190a1b2-0000-7000-8000-000000000001",
  callbackUrl: "https://app.test/credits/callback",
  currency: "NGN" as const,
};

describe("transactionStatus", () => {
  it("folds Paystack's states into success, failed and pending", () => {
    expect(transactionStatus("success")).toBe("success");
    expect(transactionStatus("failed")).toBe("failed");
    expect(transactionStatus("reversed")).toBe("failed");
    for (const s of ["abandoned", "ongoing", "pending", "processing", "queued"])
      expect(transactionStatus(s)).toBe("pending");
  });
});

describe("initialize", () => {
  it("sends the amount in kobo, our reference and the callback, and returns the page", async () => {
    const d = deps(async () => json(200, INITIALIZE_OK));
    const result = await initialize(d, input);
    expect(result).toEqual({
      ok: true,
      value: { authorizationUrl: INITIALIZE_OK.data.authorization_url },
    });
    const [url, init] = d.calls.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.paystack.co/transaction/initialize");
    expect(init.method).toBe("POST");
    expect(new Headers(init.headers).get("Authorization")).toBe(
      `Bearer ${SECRET}`,
    );
    expect(JSON.parse(String(init.body))).toEqual({
      email: input.email,
      amount: 1_000_000,
      reference: input.reference,
      callback_url: input.callbackUrl,
      currency: "NGN",
    });
  });

  it("is unavailable on an error status, a bad shape, a network error, or no key", async () => {
    const unavailable = { ok: false, error: { code: "paystack_unavailable" } };
    expect(
      await initialize(
        deps(async () => json(500, { status: false })),
        input,
      ),
    ).toEqual(unavailable);
    expect(
      await initialize(
        deps(async () => json(200, { status: true, data: {} })),
        input,
      ),
    ).toEqual(unavailable);
    expect(
      await initialize(
        deps(async () => {
          throw new TypeError("fetch failed");
        }),
        input,
      ),
    ).toEqual(unavailable);
    const withKey = deps(async () => json(200, INITIALIZE_OK));
    const noKey = { ...withKey, secretKey: undefined };
    expect(await initialize(noKey, input)).toEqual(unavailable);
    expect(withKey.calls).not.toHaveBeenCalled();
  });
});

describe("verify", () => {
  it("returns the transaction by our reference", async () => {
    const d = deps(async () => json(200, VERIFY_OK));
    const result = await verify(d, input.reference);
    expect(result).toEqual({
      ok: true,
      value: {
        id: "4099260516",
        reference: input.reference,
        status: "success",
        amount: 1_000_000,
        currency: "NGN",
        paidAt: "2026-11-23T10:15:00.000Z",
      },
    });
    expect(d.calls.mock.calls[0]?.[0]).toBe(
      `https://api.paystack.co/transaction/verify/${input.reference}`,
    );
  });

  it("is not_found on 404 and unavailable on other failures", async () => {
    expect(
      await verify(
        deps(async () => json(404, { status: false })),
        input.reference,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    // Recorded from test mode: an unknown reference is a 400 with this code.
    expect(
      await verify(
        deps(async () =>
          json(400, {
            status: false,
            message: "Transaction reference not found.",
            code: "transaction_not_found",
            type: "validation_error",
          }),
        ),
        input.reference,
      ),
    ).toEqual({ ok: false, error: { code: "not_found" } });
    expect(
      await verify(
        deps(async () => json(400, { status: false, code: "other_error" })),
        input.reference,
      ),
    ).toEqual({ ok: false, error: { code: "paystack_unavailable" } });
    expect(
      await verify(
        deps(async () => json(502, {})),
        input.reference,
      ),
    ).toEqual({ ok: false, error: { code: "paystack_unavailable" } });
    expect(
      await verify(
        deps(async () => json(200, { status: true, data: { id: 1 } })),
        input.reference,
      ),
    ).toEqual({ ok: false, error: { code: "paystack_unavailable" } });
  });
});

describe("validSignature", () => {
  const body = JSON.stringify({ event: "charge.success", data: transaction() });
  const sign = (raw: string, key = SECRET) =>
    createHmac("sha512", key).update(raw).digest("hex");

  it("accepts the HMAC SHA512 of the raw body", () => {
    expect(validSignature(body, sign(body), SECRET)).toBe(true);
  });

  it("rejects a tampered body, another key, junk, or a missing header or secret", () => {
    expect(validSignature(`${body} `, sign(body), SECRET)).toBe(false);
    expect(validSignature(body, sign(body, "sk_test_other"), SECRET)).toBe(
      false,
    );
    expect(validSignature(body, "abc", SECRET)).toBe(false);
    expect(validSignature(body, "zz-not-hex", SECRET)).toBe(false);
    expect(validSignature(body, null, SECRET)).toBe(false);
    expect(validSignature(body, sign(body), undefined)).toBe(false);
  });
});

describe("parseWebhook", () => {
  it("reads charge.success", () => {
    const event = parseWebhook(
      JSON.stringify({ event: "charge.success", data: transaction() }),
    );
    expect(event).toMatchObject({
      kind: "charge_success",
      transaction: { reference: input.reference, amount: 1_000_000 },
    });
  });

  it("ignores other events and refuses junk", () => {
    expect(
      parseWebhook(JSON.stringify({ event: "transfer.success", data: {} })),
    ).toEqual({ kind: "ignored", event: "transfer.success" });
    expect(parseWebhook("not json")).toBeNull();
    expect(parseWebhook(JSON.stringify({ data: {} }))).toBeNull();
    expect(
      parseWebhook(JSON.stringify({ event: "charge.success", data: {} })),
    ).toBeNull();
  });
});
