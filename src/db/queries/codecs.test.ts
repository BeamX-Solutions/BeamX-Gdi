import { describe, expect, it } from "vitest";
import { newId } from "../id";
import type { message } from "../schema";
import {
  decodeCursor,
  decodeListCursor,
  dedupeById,
  encodeCursor,
  encodeListCursor,
  isTimestamp,
  isUuid,
  toPage,
} from "./codecs";

const b64 = (s: string) => Buffer.from(s).toString("base64url");

describe("isUuid", () => {
  it("accepts our v7 ids and other RFC versions", () => {
    expect(isUuid(newId())).toBe(true);
    expect(isUuid("550e8400-e29b-41d4-a716-446655440000")).toBe(true);
  });

  it("rejects junk a URL segment could carry", () => {
    for (const bad of [
      "",
      "abc",
      "123",
      "550e8400e29b41d4a716446655440000",
      "550e8400-e29b-41d4-a716-44665544000g",
      "' OR 1=1 --",
    ])
      expect(isUuid(bad)).toBe(false);
  });
});

describe("message cursor", () => {
  it("round trips a seq", () => {
    expect(decodeCursor(encodeCursor(1))).toBe(1);
    expect(decodeCursor(encodeCursor(9_007_199_254_740_991))).toBe(
      9_007_199_254_740_991,
    );
  });

  it("rejects anything that is not a positive safe integer", () => {
    for (const raw of [
      "0",
      "-1",
      "1.5",
      "1e3",
      "0x10",
      " 1",
      "",
      "abc",
      "9007199254740993",
    ])
      expect(decodeCursor(b64(raw))).toBeNull();
    expect(decodeCursor("%%%")).toBeNull();
  });
});

describe("isTimestamp", () => {
  it("accepts Postgres text output and ISO forms", () => {
    for (const ok of [
      "2026-11-18 06:08:07.123456+00",
      "2026-11-18 06:08:07+01",
      "2026-11-18T06:08:07.1Z",
      "2026-11-18T06:08:07+05:30",
      "2024-02-29 00:00:00+00",
    ])
      expect(isTimestamp(ok)).toBe(true);
  });

  it("rejects malformed and impossible dates", () => {
    for (const bad of [
      "",
      "yesterday",
      "2026-11-18",
      "2026-13-01 00:00:00+00",
      "2026-02-30 00:00:00+00",
      "2025-02-29 00:00:00+00",
      "2026-11-18 24:00:00+00",
      "2026-11-18 06:08:07",
      "2026-11-18 06:08:07.1234567+00",
    ])
      expect(isTimestamp(bad)).toBe(false);
  });
});

describe("conversation list cursor", () => {
  it("round trips a row's keyset", () => {
    const row = { lastMessageAt: "2026-11-18 06:08:07.123456+00", id: newId() };
    expect(decodeListCursor(encodeListCursor(row))).toEqual([
      row.lastMessageAt,
      row.id,
    ]);
  });

  it("returns null for anything Postgres would refuse", () => {
    const id = newId();
    for (const value of [
      ["2026-11-18 06:08:07+00"],
      ["not a time", id],
      ["2026-02-31 00:00:00+00", id],
      ["2026-11-18 06:08:07+00", "not-a-uuid"],
      ["2026-11-18 06:08:07+00", id, "extra"],
      { lastMessageAt: "2026-11-18 06:08:07+00", id },
      null,
    ])
      expect(decodeListCursor(b64(JSON.stringify(value)))).toBeNull();
    expect(decodeListCursor(b64("{not json"))).toBeNull();
    expect(decodeListCursor("")).toBeNull();
  });
});

type MessageRow = typeof message.$inferSelect;
const row = (seq: number): { message: MessageRow } => ({
  message: {
    id: newId(),
    seq,
    conversationId: "c",
    role: "user",
    parts: [],
    metadata: null,
    createdAt: "t",
    updatedAt: "t",
  },
});

describe("toPage", () => {
  it("flips a newest first page and points the cursor at the oldest row", () => {
    const page = toPage([row(5), row(4), row(3)], 2);
    expect(page.messages.map((m) => m.seq)).toEqual([4, 5]);
    expect(page.nextCursor && decodeCursor(page.nextCursor)).toBe(4);
  });

  it("has no cursor when the extra row is missing", () => {
    expect(toPage([row(2), row(1)], 2).nextCursor).toBeNull();
    expect(toPage([], 2)).toEqual({ messages: [], nextCursor: null });
  });
});

describe("dedupeById", () => {
  it("keeps the last content at the first position", () => {
    const out = dedupeById([
      { id: "a", v: 1 },
      { id: "b", v: 1 },
      { id: "a", v: 2 },
    ]);
    expect(out).toEqual([
      { id: "a", v: 2 },
      { id: "b", v: 1 },
    ]);
  });

  it("leaves a list without repeats unchanged", () => {
    const items = [{ id: "a" }, { id: "b" }];
    expect(dedupeById(items)).toEqual(items);
  });
});
