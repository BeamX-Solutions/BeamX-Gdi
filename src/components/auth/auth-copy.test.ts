import { describe, expect, it } from "vitest";
import {
  authErrorMessage,
  checkEmail,
  checkPassword,
  checkSignUp,
  isFullCode,
  needsNewCode,
} from "./auth-copy";

// Spec 0009, AC-2, AC-3, AC-5: the auth dialog's checks and messages.

describe("checkSignUp (AC-2)", () => {
  it("passes a complete form", () => {
    expect(
      checkSignUp({ name: "Ada", email: "ada@x.ng", password: "12345678" }),
    ).toEqual({});
  });

  it("names each problem field", () => {
    expect(
      checkSignUp({ name: "  ", email: "ada.x.ng", password: "short" }),
    ).toEqual({
      name: "Enter your first name.",
      email: "Enter a valid email address.",
      password: "Use at least 8 characters.",
    });
  });

  it("limits the name to 50 and the password to 8 to 128 characters", () => {
    expect(
      checkSignUp({
        name: "a".repeat(51),
        email: "a@b.co",
        password: "p".repeat(129),
      }),
    ).toEqual({
      name: "Use at most 50 characters.",
      password: "Use at most 128 characters.",
    });
    expect(checkPassword("p".repeat(128))).toBeUndefined();
  });

  it("trims the email before checking it", () => {
    expect(checkEmail("  ada@x.ng ")).toBeUndefined();
  });
});

describe("isFullCode (AC-3)", () => {
  it("is true only for six digits", () => {
    expect(isFullCode("123456")).toBe(true);
    expect(isFullCode("12345")).toBe(false);
    expect(isFullCode("12345a")).toBe(false);
  });
});

describe("authErrorMessage", () => {
  it("has a friendly message for each code the dialog meets", () => {
    expect(authErrorMessage("INVALID_EMAIL_OR_PASSWORD")).toBe(
      "Email or password is wrong.",
    );
    expect(authErrorMessage("OTP_EXPIRED")).toContain("Send a new code");
    expect(authErrorMessage("PASSWORD_COMPROMISED")).toContain("data breach");
    expect(authErrorMessage("PASSWORD_CHECK_FAILED")).toContain("Try again");
    expect(authErrorMessage("EMAIL_SEND_FAILED")).toBe(
      "We couldn't send the email, try again.",
    );
  });

  it("never shows a raw or blank code", () => {
    expect(authErrorMessage("SOMETHING_NEW")).toBe(
      "Something went wrong. Try again.",
    );
    expect(authErrorMessage(undefined)).toBe(
      "Something went wrong. Try again.",
    );
  });

  it("asks for a new code after an expired code or too many tries", () => {
    expect(needsNewCode("OTP_EXPIRED")).toBe(true);
    expect(needsNewCode("TOO_MANY_ATTEMPTS")).toBe(true);
    expect(needsNewCode("INVALID_OTP")).toBe(false);
  });
});
