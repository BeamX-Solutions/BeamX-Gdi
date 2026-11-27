import { describe, expect, it } from "vitest";
import { historyPayloadSchema, mergeHistory } from "./history-payload";

// Feature #14.

const item = (id: string) => ({
  id,
  title: id,
  href: `/c/${id}`,
  reports: null,
});

describe("history payload", () => {
  it("parses the route's body", () => {
    expect(
      historyPayloadSchema.safeParse({
        items: [{ ...item("a"), reports: "Beacon report" }],
        nextCursor: "x",
      }).success,
    ).toBe(true);
    expect(historyPayloadSchema.safeParse({ items: "nope" }).success).toBe(
      false,
    );
  });

  it("replaces on a first page and appends a next page without repeats", () => {
    expect(mergeHistory([item("a")], [item("b")], false)).toEqual([item("b")]);
    expect(mergeHistory([item("a")], [item("a"), item("b")], true)).toEqual([
      item("a"),
      item("b"),
    ]);
  });
});
