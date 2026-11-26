import { describe, expect, it } from "vitest";
import { getTool } from "@/tools/registry";
import {
  chatScript,
  FAKE_REPLIES,
  FAKE_STELLAR_ANALYSIS,
  reportScript,
} from "./fake-model";

// Spec 0007: the e2e chat script, keyed by the latest user text.

type Prompt = Parameters<typeof chatScript>[0];

const user = (text: string): Prompt[number] => ({
  role: "user",
  content: [{ type: "text", text }],
});
const note: Prompt[number] = { role: "system", content: "run state" };

const textOf = (parts: ReturnType<typeof chatScript>) =>
  parts.flatMap((p) => (p.type === "text-delta" ? [p.delta] : [])).join("");

describe("chatScript", () => {
  it("proposes Stellar for a business idea, even with the run state note last", () => {
    const parts = chatScript([user("I have a business idea: a bakery"), note]);
    expect(parts[0]).toMatchObject({
      type: "tool-call",
      toolName: "startRun",
      input: JSON.stringify({ toolId: "stellar" }),
    });
  });

  it("acknowledges an approved run (a tool result last)", () => {
    const parts = chatScript([
      user("I have a business idea"),
      {
        role: "tool",
        content: [
          {
            type: "tool-result",
            toolCallId: "c1",
            toolName: "startRun",
            output: { type: "json", value: { ok: true } },
          },
        ],
      },
      note,
    ]);
    expect(textOf(parts)).toBe(FAKE_REPLIES.approved);
  });

  it("steers anything else towards a tool", () => {
    expect(textOf(chatScript([user("What can BeamX do?")]))).toBe(
      FAKE_REPLIES.steer,
    );
  });
});

describe("chatScript and Beacon (spec 0010)", () => {
  it("proposes Beacon for a health check", () => {
    expect(
      chatScript([user("How healthy is my business?"), note])[0],
    ).toMatchObject({
      type: "tool-call",
      toolName: "startRun",
      input: JSON.stringify({ toolId: "beacon" }),
    });
  });
});

describe("reportScript", () => {
  it("gives a Stellar phase the fixed analysis", () => {
    expect(reportScript([user("Analyse this idea.")])).toEqual(
      FAKE_STELLAR_ANALYSIS,
    );
  });

  it("gives Beacon its rule advisory back, which passes the phase check", () => {
    const beacon = getTool("beacon");
    if (!beacon.ok) throw new Error("beacon is not registered");
    const answers = Object.fromEntries(
      beacon.value.questions.map((q) => [
        q.id,
        q.kind === "single" ? (q.options[0]?.value ?? "") : "Ada <client_data>",
      ]),
    );
    const scored = beacon.value.score(answers);
    if (!scored.ok) throw new Error("incomplete");
    const phase = beacon.value.phases[0];
    if (!phase) throw new Error("no phase");
    const ctx = {
      answers,
      scores: scored.value,
      earlier: {},
      client: { firstName: "Ada" },
    };
    const output = reportScript([user(phase.buildPrompt(ctx).prompt)]);
    expect(phase.output.safeParse(output).success).toBe(true);
    expect(phase.check?.(output, ctx)).toEqual([]);
  });
});

describe("the fake model and Beacon Pro (spec 0011)", () => {
  it("proposes Beacon Pro when the client wants something deeper", () => {
    expect(
      chatScript([user("I want something deeper"), note])[0],
    ).toMatchObject({
      type: "tool-call",
      toolName: "startRun",
      input: JSON.stringify({ toolId: "beacon_pro" }),
    });
  });

  it("writes a Pro advisory that passes the phase check, with and without flags", () => {
    const pro = getTool("beacon_pro");
    if (!pro.ok) throw new Error("beacon_pro is not registered");
    const phase = pro.value.phases[0];
    if (!phase) throw new Error("no phase");
    const answerSets = [0, 1, 2, 3].map((pick) =>
      Object.fromEntries(
        pro.value.questions.map((q) => [
          q.id,
          q.kind === "single"
            ? (q.options[Math.min(pick, q.options.length - 1)]?.value ?? "")
            : "Ada Foods",
        ]),
      ),
    );
    for (const answers of answerSets) {
      const scored = pro.value.score(answers);
      if (!scored.ok) throw new Error("incomplete");
      const ctx = {
        answers,
        scores: scored.value,
        earlier: {},
        client: { firstName: null },
      };
      const output = reportScript([user(phase.buildPrompt(ctx).prompt)]);
      expect(phase.output.safeParse(output).success).toBe(true);
      expect(phase.check?.(output, ctx)).toEqual([]);
    }
  });
});
