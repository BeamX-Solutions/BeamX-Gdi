import { describe, expect, it } from "vitest";
import { errorCopy } from "./error-copy";

describe("errorCopy (AC-12)", () => {
  it("maps each kind to its one action label", () => {
    expect(errorCopy.ai_error.actionLabel).toBe("Retry");
    expect(errorCopy.network.actionLabel).toBe("Retry");
    expect(errorCopy.limit_reached.actionLabel).toBe("Sign up to keep going");
    expect(errorCopy.spend_cap.actionLabel).toBe("Got it");
  });

  it("has a title and message for every kind", () => {
    for (const copy of Object.values(errorCopy)) {
      expect(copy.title.length).toBeGreaterThan(0);
      expect(copy.message.length).toBeGreaterThan(0);
    }
  });
});
