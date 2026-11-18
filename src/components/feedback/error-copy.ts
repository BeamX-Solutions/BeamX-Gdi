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
