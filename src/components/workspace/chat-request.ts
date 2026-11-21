/**
 * Pure helpers for the chat client's transport (spec 0007): the request body (only the
 * new message; the server loads history) and the friendly card for a failed request.
 */
import { errorCopy } from "@/components/feedback/error-copy";
import type { ErrorKind } from "@/components/feedback/error-card";

/** The body `POST /api/chat` takes: the chat id and only the newest message. */
export const chatRequestBody = (
  conversationId: string,
  messages: readonly unknown[],
) => ({ conversationId, message: messages.at(-1) });

export type ChatFailure =
  "sign_in" | "bot" | "not_found" | "invalid" | "network" | "unknown";

/**
 * Which failure an error from the transport is. A non ok response's error message is
 * the route's JSON body (`{ "code": … }`); a fetch that never got a response is network.
 */
export const failureOf = (error: Error): ChatFailure => {
  if (error.name === "TypeError") return "network";
  try {
    const body: unknown = JSON.parse(error.message);
    const code =
      typeof body === "object" && body !== null && "code" in body
        ? body.code
        : null;
    switch (code) {
      case "bot":
        return "bot";
      case "not_found":
        return "not_found";
      case "invalid_request":
      case "invalid_message":
        return "invalid";
      case "unauthenticated":
        return "sign_in";
      default:
        return "unknown";
    }
  } catch {
    return "unknown";
  }
};

export type FailureCopy = {
  readonly kind: ErrorKind;
  readonly title: string;
  readonly message: string;
  readonly actionLabel: string;
};

export const failureCopy: Readonly<Record<ChatFailure, FailureCopy>> = {
  sign_in: {
    kind: "network",
    title: "We could not start your chat",
    message: "Check your connection, then send your message again.",
    actionLabel: "Got it",
  },
  bot: {
    kind: "ai_error",
    title: "We could not check your browser",
    message: "Reload the page and try again.",
    actionLabel: "Got it",
  },
  not_found: {
    kind: "ai_error",
    title: "This chat is not available",
    message: "Start a new chat to keep going.",
    actionLabel: "New chat",
  },
  invalid: {
    kind: "ai_error",
    title: "We could not send that",
    message: "Please try sending your message again.",
    actionLabel: "Got it",
  },
  network: { kind: "network", ...errorCopy.network },
  unknown: { kind: "ai_error", ...errorCopy.ai_error },
};
