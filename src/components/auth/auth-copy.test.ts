import { describe, expect, it } from "vitest";
import {
  noticeOffersSignUp,
  savePromptKey,
  showSavePrompt,
  authErrorMessage,
  checkEmail,
  checkPassword,
  checkSignUp,
  FORFEIT_NOTE,
  isFullCode,
  needsNewCode,
  DELETE_LOSSES,
  DELETED_TOAST,
  deleteErrorMessage,
} from "./auth-copy";

// Spec 0009, AC-2, AC-3, AC-5, AC-7: the auth dialog's checks and messages.

describe("FORFEIT_NOTE (AC-7)", () => {
  it("says chats and reports move, and only free credits may not", () => {
    expect(FORFEIT_NOTE).toContain("chats and reports come with you");
    expect(FORFEIT_NOTE).toContain("already has credits");
  });
});

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

describe("sign up prompts (spec 0009, AC-1)", () => {
  it("offers Sign up on the guest limit notices, to guests only", () => {
    for (const kind of ["runs_daily", "chat_daily", "chats_daily"]) {
      expect(noticeOffersSignUp(kind, true)).toBe(true);
      expect(noticeOffersSignUp(kind, false)).toBe(false);
    }
    expect(noticeOffersSignUp("spend_cap", true)).toBe(false);
    expect(noticeOffersSignUp("slow_down", true)).toBe(false);
  });

  it("shows the save prompt to a guest with a ready report, until dismissed", () => {
    expect(
      showSavePrompt({ guest: true, reportReady: true, dismissed: false }),
    ).toBe(true);
    expect(
      showSavePrompt({ guest: false, reportReady: true, dismissed: false }),
    ).toBe(false);
    expect(
      showSavePrompt({ guest: true, reportReady: false, dismissed: false }),
    ).toBe(false);
    expect(
      showSavePrompt({ guest: true, reportReady: true, dismissed: true }),
    ).toBe(false);
  });

  it("keys the dismissed state per chat", () => {
    expect(savePromptKey("a")).not.toBe(savePromptKey("b"));
  });
});

describe("delete account copy (AC-13)", () => {
  it("names chats, reports and unspent credits as lost", () => {
    const text = DELETE_LOSSES.join(" ").toLowerCase();
    expect(text).toContain("chats");
    expect(text).toContain("reports");
    expect(text).toContain("unspent credits");
  });

  it("confirms the delete with the spec's toast", () => {
    expect(DELETED_TOAST).toBe("Your account was deleted.");
  });

  it("explains a mismatched email and falls back to the auth messages", () => {
    expect(deleteErrorMessage("email_mismatch")).toContain("doesn't match");
    expect(deleteErrorMessage("rate_limited")).toBe(
      "Too many tries, wait a minute.",
    );
    expect(deleteErrorMessage(undefined)).toBe(
      "Something went wrong. Try again.",
    );
  });
});
