import { describe, expect, it } from "vitest";
import { prefillOrigins } from "./prefill-origin";

// Spec 0012, AC-7.

describe("prefillOrigins", () => {
  it("labels each item when the card mixes the profile and the chat", () => {
    expect(
      prefillOrigins([{ source: "profile" }, { source: "chat" }, {}]),
    ).toEqual(["From your profile", "From our chat", "From our chat"]);
  });

  it("shows no item labels when every item has one source", () => {
    expect(
      prefillOrigins([{ source: "profile" }, { source: "profile" }]),
    ).toEqual([null, null]);
    expect(prefillOrigins([{}, { source: "chat" }])).toEqual([null, null]);
  });
});
