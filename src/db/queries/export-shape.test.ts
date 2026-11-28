import { describe, expect, it } from "vitest";
import type { ExportRows } from "./export";
import { EXPORT_FORMAT, exportFileName, toExport } from "./export-shape";

const empty: ExportRows = {
  user: [],
  conversations: [],
  messages: [],
  runs: [],
  answers: [],
  reports: [],
  profile: [],
  creditAccount: [],
  ledger: [],
  holds: [],
  payments: [],
  consultations: [],
  policies: [],
};

const at = new Date("2026-11-28T10:00:00.000Z");

describe("toExport (spec 0017, AC-7)", () => {
  it("nests messages under their chat and answers and the report under their run", () => {
    const out = toExport(
      {
        ...empty,
        user: [
          {
            email: "ada@example.com",
            name: "Ada",
            createdAt: new Date("2026-11-01T00:00:00.000Z"),
            isAnonymous: false,
          },
        ],
        conversations: [
          { id: "c1", title: "Idea", createdAt: "t0", lastMessageAt: "t1" },
          { id: "c2", title: null, createdAt: "t2", lastMessageAt: "t2" },
        ],
        messages: [
          {
            id: "m1",
            conversationId: "c1",
            role: "user",
            parts: [{ type: "text", text: "hi" }],
            createdAt: "t0",
          },
          {
            id: "m2",
            conversationId: "c1",
            role: "assistant",
            parts: [],
            createdAt: "t1",
          },
        ],
        runs: [
          {
            id: "r1",
            conversationId: "c1",
            toolId: "stellar",
            toolVersion: "1",
            status: "completed",
            scores: { total: 70 },
            createdAt: "t0",
            completedAt: "t1",
          },
        ],
        answers: [
          {
            runId: "r1",
            questionId: "q1",
            value: "Yes",
            source: "chat",
            updatedAt: "t0",
          },
        ],
        reports: [
          {
            runId: "r1",
            status: "ready",
            content: { blocks: [] },
            generatedAt: "t1",
          },
        ],
      } as ExportRows,
      at,
    );
    expect(out.format).toBe(EXPORT_FORMAT);
    expect(out.exportedAt).toBe("2026-11-28T10:00:00.000Z");
    expect(out.user).toEqual({
      email: "ada@example.com",
      name: "Ada",
      guest: false,
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    expect(out.conversations[0]?.messages.map((m) => m.id)).toEqual([
      "m1",
      "m2",
    ]);
    expect(out.conversations[1]?.messages).toEqual([]);
    expect(out.runs[0]?.answers).toEqual([
      { questionId: "q1", value: "Yes", source: "chat", updatedAt: "t0" },
    ]);
    expect(out.runs[0]?.report).toEqual({
      status: "ready",
      content: { blocks: [] },
      generatedAt: "t1",
    });
  });

  it("hides a guest's placeholder email and name", () => {
    const out = toExport(
      {
        ...empty,
        user: [
          {
            email: "temp-123@anon.local",
            name: "Anonymous",
            createdAt: at,
            isAnonymous: true,
          },
        ],
      },
      at,
    );
    expect(out.user).toMatchObject({ email: null, name: null, guest: true });
  });

  it("shows payments in naira with no card or Paystack data", () => {
    const out = toExport(
      {
        ...empty,
        payments: [
          {
            credits: 100,
            amountKobo: 1_000_000,
            currency: "NGN",
            status: "succeeded",
            createdAt: "t0",
            paidAt: "t1",
          },
        ],
      } as ExportRows,
      at,
    );
    expect(out.payments).toEqual([
      {
        credits: 100,
        amount: 10_000,
        currency: "NGN",
        status: "succeeded",
        createdAt: "t0",
        paidAt: "t1",
      },
    ]);
  });

  it("fills empty sections for a user with nothing yet", () => {
    const out = toExport(empty, at);
    expect(out.user).toBeNull();
    expect(out.businessProfile).toBeNull();
    expect(out.credits).toEqual({
      balance: 0,
      held: 0,
      lastActivityAt: null,
      ledger: [],
      holds: [],
    });
    expect(out.policyAcceptances).toEqual([]);
  });

  it("names the file by day", () => {
    expect(exportFileName("2026-11-28")).toBe("beamx-data-2026-11-28.json");
  });
});
