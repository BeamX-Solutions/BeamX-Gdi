import { describe, expect, it } from "vitest";
import { chatRequestBody, failureOf } from "./chat-request";

// Spec 0007, AC-2, AC-11: the client sends only the new message, and every failed
// request maps to a friendly card.

describe("chatRequestBody", () => {
  it("sends the chat id and only the newest message", () => {
    expect(chatRequestBody("c1", [{ id: "a" }, { id: "b" }])).toEqual({
      conversationId: "c1",
      message: { id: "b" },
    });
  });
});

describe("failureOf", () => {
  const httpError = (body: unknown) => new Error(JSON.stringify(body));

  it.each([
    [{ code: "bot" }, "bot"],
    [{ code: "not_found" }, "not_found"],
    [{ code: "invalid_request" }, "invalid"],
    [{ code: "invalid_message" }, "invalid"],
    [{ code: "unauthenticated" }, "sign_in"],
    [{ code: "something_new" }, "unknown"],
  ] as const)("maps %j to %s", (body, failure) => {
    expect(failureOf(httpError(body))).toBe(failure);
  });

  it("treats a fetch that never got a response as network", () => {
    expect(failureOf(new TypeError("Failed to fetch"))).toBe("network");
  });

  it("treats a non JSON error as unknown", () => {
    expect(failureOf(new Error("<html>500</html>"))).toBe("unknown");
  });
});
