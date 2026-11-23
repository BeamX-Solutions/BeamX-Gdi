import { describe, expect, it } from "vitest";
import { APIError } from "better-auth/api";
import { authFailure } from "./api-error";

describe("authFailure (spec 0009)", () => {
  it("maps a Better Auth error to its status and code", () => {
    const e = new APIError("BAD_REQUEST", {
      code: "PASSWORD_COMPROMISED",
      message: "x",
    });
    expect(authFailure(e)).toEqual({
      status: 400,
      code: "PASSWORD_COMPROMISED",
    });
  });

  it("falls back to AUTH_ERROR when the error has no code", () => {
    expect(authFailure(new APIError("UNAUTHORIZED"))).toEqual({
      status: 401,
      code: "AUTH_ERROR",
    });
  });

  it("is null for anything else, which stays a real error", () => {
    expect(authFailure(new Error("db down"))).toBeNull();
  });
});
