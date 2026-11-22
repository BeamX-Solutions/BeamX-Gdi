import type { ReportError } from "@/db/queries/reports";
import type { ErrorKind } from "./error-card";

type ErrorCopy = {
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
};

/**
 * Default wording and action label per kind. The caller can use its own wording (the card
 * takes plain props); these keep the tone the same everywhere.
 */
export const errorCopy: Readonly<Record<ErrorKind, ErrorCopy>> = {
  ai_error: {
    title: "That did not work",
    message: "Something went wrong on our side. Your answers are safe.",
    actionLabel: "Retry",
  },
  network: {
    title: "You look offline",
    message: "We could not reach BeamX. Check your connection and try again.",
    actionLabel: "Retry",
  },
  limit_reached: {
    title: "You have used your free runs",
    message: "Make a free account to keep going and keep your reports.",
    actionLabel: "Sign up to keep going",
  },
  spend_cap: {
    title: "We are busy right now",
    message: "BeamX has hit its daily limit. Please come back a little later.",
    actionLabel: "Got it",
  },
};

/**
 * Report error kinds the client can see (spec 0005): the stored kinds, plus three made
 * at read time (`version_changed`, `stored_data_invalid`, and `exhausted` for a failed
 * report with no attempts left). The stored message is never shown raw.
 */
export type ReportErrorViewKind =
  ReportError["kind"] | "version_changed" | "stored_data_invalid" | "exhausted";

type ReportErrorCopy = { readonly title: string; readonly message: string };

const tryAgain: ReportErrorCopy = {
  title: errorCopy.ai_error.title,
  message: errorCopy.ai_error.message,
};

export const reportErrorCopy: Readonly<
  Record<ReportErrorViewKind, ReportErrorCopy>
> = {
  timeout: tryAgain,
  provider_overloaded: tryAgain,
  invalid_output: tryAgain,
  unknown: tryAgain,
  spend_cap: {
    title: errorCopy.spend_cap.title,
    message: errorCopy.spend_cap.message,
  },
  no_credit_hold: {
    title: "Your credits were returned",
    message: "The credits for this run were returned. Start again to try.",
  },
  version_changed: {
    title: "This tool was updated",
    message: "Start again with your answers.",
  },
  stored_data_invalid: {
    title: "We could not open this report",
    message: "Something in this report could not be read.",
  },
  exhausted: {
    title: "We could not make this report",
    message: "Your credits were returned.",
  },
};

/** The `data-error` kinds the chat can show (spec 0006, "Message parts"). */
export type ChatErrorKind =
  | "ai_error"
  | "refusal"
  | "complete_retry"
  | "busy"
  | "limit_text"
  | "limit_run"
  | "spend_cap"
  | "slow_down"
  | "chat_daily"
  | "chats_daily"
  | "runs_daily"
  | "answered";

/**
 * Chat error card copy (spec 0006, AC-7, AC-14; spec 0007, AC-11). The action label is
 * the one button: Retry sends the turn again, `complete_retry` runs completion again,
 * and `busy` sends the message that was not taken.
 */
export const chatErrorCopy: Readonly<Record<ChatErrorKind, ErrorCopy>> = {
  ai_error: errorCopy.ai_error,
  refusal: {
    title: "I can't help with that one",
    message: "Try asking in a different way.",
    actionLabel: "Try again",
  },
  complete_retry: {
    title: "Something changed while saving",
    message: "Tap to try again. Your answers are safe.",
    actionLabel: "Try again",
  },
  busy: {
    title: "One moment",
    message: "I'm still on your last message.",
    actionLabel: "Send again",
  },
  limit_text: {
    title: "That message is too long",
    message: "Please make it shorter, or send it in a few parts.",
    actionLabel: "Got it",
  },
  limit_run: {
    title: "This run has reached its message limit",
    message: "You can still tap the cards to answer, or start a new chat.",
    actionLabel: "Got it",
  },
  spend_cap: errorCopy.spend_cap,
  // Abuse limits (spec 0008, "Friendly notices").
  slow_down: {
    title: "You're sending messages fast",
    message: "Wait a few seconds, then send again.",
    actionLabel: "Got it",
  },
  chat_daily: {
    title: "You've reached today's chat limit",
    message: "Come back tomorrow to keep chatting, or start a tool run.",
    actionLabel: "Got it",
  },
  chats_daily: {
    title: "You've started a lot of chats today",
    message: "Carry on in one of your chats, or come back tomorrow.",
    actionLabel: "Got it",
  },
  runs_daily: {
    title: "You've used today's free runs",
    message: "Come back tomorrow to start another.",
    actionLabel: "Got it",
  },
  answered: {
    title: "Already answered",
    message: "Loading the reply to that message.",
    actionLabel: "Reload",
  },
};
