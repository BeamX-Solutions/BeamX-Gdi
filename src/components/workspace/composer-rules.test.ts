import { describe, expect, it } from "vitest";
import {
  canSend,
  counterText,
  enterShouldSend,
  showCounter,
} from "./composer-rules";

describe("composer rules (AC-7)", () => {
  it("send is off for empty or whitespace only text", () => {
    expect(canSend("", 4000)).toBe(false);
    expect(canSend("   \n ", 4000)).toBe(false);
    expect(canSend("hi", 4000)).toBe(true);
  });

  it("send is off over 4,000 characters, on at exactly 4,000", () => {
    expect(canSend("a".repeat(4000), 4000)).toBe(true);
    expect(canSend("a".repeat(4001), 4000)).toBe(false);
  });

  it("the counter appears past 3,600 and reads '3,712 / 4,000'", () => {
    expect(showCounter("a".repeat(3600), 4000)).toBe(false);
    expect(showCounter("a".repeat(3601), 4000)).toBe(true);
    expect(counterText("a".repeat(3712), 4000)).toBe("3,712 / 4,000");
  });

  const base = {
    key: "Enter",
    shiftKey: false,
    isComposing: false,
    coarsePointer: false,
  };
  it("Enter sends on desktop", () => {
    expect(enterShouldSend(base)).toBe(true);
  });
  it("Shift+Enter adds a line", () => {
    expect(enterShouldSend({ ...base, shiftKey: true })).toBe(false);
  });
  it("Enter adds a line on touch screens", () => {
    expect(enterShouldSend({ ...base, coarsePointer: true })).toBe(false);
  });
  it("Enter never sends while a word is being composed", () => {
    expect(enterShouldSend({ ...base, isComposing: true })).toBe(false);
  });
  it("other keys never send", () => {
    expect(enterShouldSend({ ...base, key: "a" })).toBe(false);
  });
});
