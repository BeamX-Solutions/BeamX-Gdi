import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  process.env.SKIP_ENV_VALIDATION = "1";
});

const { clientIp } = await import("./client-ip");

const h = (init: Record<string, string>) => new Headers(init);

describe("clientIp (spec 0008)", () => {
  it("takes the first address in x-forwarded-for", () => {
    expect(clientIp(h({ "x-forwarded-for": " 102.89.1.2 , 10.0.0.1" }))).toBe(
      "102.89.1.2",
    );
  });

  it("falls back to x-real-ip", () => {
    expect(clientIp(h({ "x-real-ip": "102.89.1.3" }))).toBe("102.89.1.3");
  });

  it("is null when neither header has an address (IP limits are skipped)", () => {
    expect(clientIp(h({}))).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": " , " }))).toBeNull();
  });
});
