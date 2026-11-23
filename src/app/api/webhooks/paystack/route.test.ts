import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The Paystack webhook route (spec 0004, AC-13): the real signature check and parser run
// over the raw body; only the payment queries and logging are mocked at the boundary.

const SECRET = "sk_test_route_secret";
const PAYMENT = "0190a1b2-0000-7000-8000-000000000001";

const { byId, markSucceeded, markFailed, log } = vi.hoisted(() => ({
  byId: vi.fn(),
  markSucceeded: vi.fn(),
  markFailed: vi.fn(),
  log: vi.fn(),
}));

vi.mock("@/lib/env", () => ({ env: { PAYSTACK_SECRET_KEY: SECRET } }));
vi.mock("@/db/queries/payments", () => ({ byId }));
vi.mock("@/app/credits/payment-deps", () => ({
  settleDeps: { markSucceeded, markFailed, log },
}));

const { POST } = await import("./route");

const sign = (body: string, key = SECRET) =>
  createHmac("sha512", key).update(body, "utf8").digest("hex");

const chargeSuccess = JSON.stringify({
  event: "charge.success",
  data: {
    id: 4099260516,
    status: "success",
    reference: PAYMENT,
    amount: 1_000_000,
    currency: "NGN",
    paid_at: "2026-11-23T10:15:00.000Z",
  },
});

const post = (body: string, signature: string | null) =>
  POST(
    new Request("http://localhost:3000/api/webhooks/paystack", {
      method: "POST",
      body,
      headers: signature === null ? {} : { "x-paystack-signature": signature },
    }),
  );

beforeEach(() => {
  vi.clearAllMocks();
  byId.mockResolvedValue({
    id: PAYMENT,
    userId: "0190a1b2-0000-7000-8000-0000000000aa",
    credits: 100,
    amountKobo: 1_000_000,
    currency: "NGN",
    status: "pending",
    createdAt: "2026-11-23 10:00:00+00",
  });
  markSucceeded.mockResolvedValue({ granted: true });
});

describe("POST /api/webhooks/paystack", () => {
  it("grants a correctly signed charge.success and is never cached (AC-13)", async () => {
    const res = await post(chargeSuccess, sign(chargeSuccess));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, outcome: "succeeded" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(markSucceeded).toHaveBeenCalledWith(
      PAYMENT,
      expect.objectContaining({ amountKobo: 1_000_000, currency: "NGN" }),
    );
  });

  it.each([
    ["a missing signature", null],
    ["a junk signature", "abc"],
    ["a signature made with another key", sign(chargeSuccess, "sk_test_other")],
  ])("answers 401 with %s and touches no payment (AC-13)", async (_, sig) => {
    const res = await post(chargeSuccess, sig);
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ code: "unauthorized" });
    expect(byId).not.toHaveBeenCalled();
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("checks the signature over the raw bytes, so a reformatted body is refused", async () => {
    const reformatted = JSON.stringify(JSON.parse(chargeSuccess), null, 2);
    const res = await post(reformatted, sign(chargeSuccess));
    expect(res.status).toBe(401);
    expect(markSucceeded).not.toHaveBeenCalled();
  });

  it("answers 500 when the database is down, so Paystack retries", async () => {
    byId.mockRejectedValue(new Error("connection refused"));
    await expect(post(chargeSuccess, sign(chargeSuccess))).rejects.toThrow(
      "connection refused",
    );
  });
});
