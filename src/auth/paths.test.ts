import { describe, expect, it } from "vitest";
import { BOT_PROTECTED_AUTH_PATHS, isBotCheckedAuthPath } from "./paths";

describe("BotID paths (spec 0009, AC-15)", () => {
  it("checks every auth POST the spec lists", () => {
    for (const path of [
      "/sign-in/email",
      "/email-otp/send-verification-otp",
      "/sign-in/email-otp",
      "/email-otp/request-password-reset",
      "/email-otp/reset-password",
    ])
      expect(isBotCheckedAuthPath(path)).toBe(true);
  });

  it("leaves session reads and sign out alone", () => {
    expect(isBotCheckedAuthPath("/get-session")).toBe(false);
    expect(isBotCheckedAuthPath("/sign-out")).toBe(false);
  });

  it("protects the full paths on the client, account routes included", () => {
    expect(BOT_PROTECTED_AUTH_PATHS).toEqual(
      expect.arrayContaining([
        "/api/auth/sign-in/anonymous",
        "/api/auth/sign-in/email",
        "/api/auth/email-otp/reset-password",
        "/api/account/email-check",
        "/api/account/set-password",
        "/api/account/delete",
      ]),
    );
  });
});
