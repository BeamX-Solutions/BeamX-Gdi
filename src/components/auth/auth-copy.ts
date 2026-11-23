/**
 * The auth dialog's words and checks (spec 0009). Pure, so every message and rule has a
 * Vitest case and the components stay thin.
 */

export const NAME_MAX = 50;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
/** Seconds before "Send a new code" is offered again (AC-3). */
export const RESEND_WAIT_S = 60;

export const SIGNED_IN_TOAST = "You're signed in. Your work is saved.";

/** Shown on sign in to a guest with unspent credits (AC-7, spec 0004 AC-12). */
export const FORFEIT_NOTE =
  "Your chats and reports come with you. Free guest credits don't carry over if your account already has credits.";

export type SignUpFields = {
  readonly name: string;
  readonly email: string;
  readonly password: string;
};

export type FieldErrors = Partial<Record<keyof SignUpFields, string>>;

// A deliberately loose check: the server validates properly; this only catches typos
// like a missing "@" before a round trip.
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const checkEmail = (email: string): string | undefined =>
  EMAIL_SHAPE.test(email.trim()) ? undefined : "Enter a valid email address.";

export const checkPassword = (password: string): string | undefined => {
  if (password.length < PASSWORD_MIN)
    return `Use at least ${PASSWORD_MIN} characters.`;
  if (password.length > PASSWORD_MAX)
    return `Use at most ${PASSWORD_MAX} characters.`;
  return undefined;
};

/** The sign up form's field errors; empty when it can be sent (AC-2). */
export const checkSignUp = (fields: SignUpFields): FieldErrors => {
  const name = fields.name.trim();
  const errors: FieldErrors = {
    name:
      name.length === 0
        ? "Enter your first name."
        : name.length > NAME_MAX
          ? `Use at most ${NAME_MAX} characters.`
          : undefined,
    email: checkEmail(fields.email),
    password: checkPassword(fields.password),
  };
  return Object.fromEntries(
    Object.entries(errors).filter(([, v]) => v !== undefined),
  ) as FieldErrors;
};

/** True when the code entry holds a full 6 digit code. */
export const isFullCode = (code: string): boolean => /^\d{6}$/.test(code);

/**
 * The message for a failure code from Better Auth or our account routes. An unknown
 * code gets a general message, never a blank or a raw code.
 */
export const authErrorMessage = (code: string | undefined): string => {
  switch (code) {
    case "INVALID_OTP":
      return "That code isn't right. Check it and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Send a new code.";
    case "TOO_MANY_ATTEMPTS":
      return "Too many wrong tries. Send a new code.";
    case "PASSWORD_COMPROMISED":
      return "That password has appeared in a data breach. Choose a different one.";
    case "PASSWORD_TOO_SHORT":
      return `Use at least ${PASSWORD_MIN} characters.`;
    case "PASSWORD_TOO_LONG":
      return `Use at most ${PASSWORD_MAX} characters.`;
    case "INVALID_EMAIL_OR_PASSWORD":
      return "Email or password is wrong.";
    case "PASSWORD_CHECK_FAILED":
      return "We couldn't check that password just now. Try again.";
    case "EMAIL_SEND_FAILED":
      return "We couldn't send the email, try again.";
    case "invalid_email":
      return "Enter a valid email address.";
    case "TOO_MANY_REQUESTS":
    case "rate_limited":
      return "Too many tries, wait a minute.";
    case undefined:
    default:
      return "Something went wrong. Try again.";
  }
};

/** A code the dialog should answer by asking for a new code (AC-3). */
export const needsNewCode = (code: string | undefined): boolean =>
  code === "OTP_EXPIRED" || code === "TOO_MANY_ATTEMPTS";

/** The prompts that open the dialog on sign up (AC-1). */
export const SIGN_UP_LABEL = "Sign up";
export const SAVE_PROMPT_TITLE = "Save your report";
export const SAVE_PROMPT_TEXT =
  "Sign up free to keep this chat and report and come back to them anytime.";
export const SAVE_PROMPT_DISMISS = "Not now";

/**
 * The guest notices that carry a Sign up action: spec 0008's limits (AC-1), and spec
 * 0004's guest out of free messages notice, whose copy points to an account too.
 */
const SIGN_UP_NOTICES: ReadonlySet<string> = new Set([
  "runs_daily",
  "chat_daily",
  "chats_daily",
  "chat_credits_guest",
]);

/** True when a notice of `kind` offers Sign up: only to guests (AC-1). */
export const noticeOffersSignUp = (kind: string, guest: boolean): boolean =>
  guest && SIGN_UP_NOTICES.has(kind);

/**
 * The save prompt shows to a guest once a report in the chat is ready, until they
 * dismiss it for this chat (AC-1, "Value sourcing").
 */
export const showSavePrompt = (state: {
  readonly guest: boolean;
  readonly reportReady: boolean;
  readonly dismissed: boolean;
}): boolean => state.guest && state.reportReady && !state.dismissed;

/** The `sessionStorage` key that remembers a dismissed save prompt, per chat. */
export const savePromptKey = (conversationId: string): string =>
  `beamx:save-prompt-dismissed:${conversationId}`;
