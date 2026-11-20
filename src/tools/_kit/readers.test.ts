import { describe, expect, it } from "vitest";
import { sampleTool } from "../test-tools/sample";
import { scoreRun, toAnswers, type StoredAnswer } from "./readers";

const row = (
  questionId: string,
  value: unknown,
  updatedAt = "2026-11-20 10:00:00+00",
): StoredAnswer => ({ questionId, value, updatedAt });

const complete: readonly StoredAnswer[] = [
  row("stage", "idea", "2026-11-20 10:00:00+00"),
  row("channels", ["market"], "2026-11-20 10:00:01.5+00"),
  row("confidence", 4, "2026-11-20 10:00:01.123456+00"),
  row("team_size", 2, "2026-11-20 10:00:01+00"),
];

describe("toAnswers", () => {
  it("parses stored values and keeps the visible ones", () => {
    const result = toAnswers(sampleTool, [
      ...complete,
      row("monthly_sales", 900),
    ]);
    expect(result).toEqual({
      ok: true,
      value: {
        stage: "idea",
        channels: ["market"],
        confidence: 4,
        team_size: 2,
      },
    });
  });

  it("returns stored_data_invalid for a value that no longer parses", () => {
    expect(toAnswers(sampleTool, [row("confidence", 9)])).toMatchObject({
      ok: false,
      error: { code: "stored_data_invalid", questionId: "confidence" },
    });
  });

  it("returns stored_data_invalid for an unknown question id", () => {
    expect(toAnswers(sampleTool, [row("gone", "x")])).toMatchObject({
      ok: false,
      error: { code: "stored_data_invalid", questionId: "gone" },
    });
  });
});

describe("scoreRun (AC-16)", () => {
  it("scores visible answers, but counts every stored row", () => {
    // monthly_sales is hidden (stage is idea): ignored by scoring, still counted.
    const rows = [
      ...complete,
      row("monthly_sales", 900, "2026-11-20 10:00:02+00"),
    ];
    expect(scoreRun(sampleTool, rows)).toEqual({
      ok: true,
      value: {
        scores: { points: 4 },
        answerCount: 5,
        lastAnswerAt: "2026-11-20 10:00:02+00",
      },
    });
  });

  it("takes the latest raw updated_at string, fractions included", () => {
    const result = scoreRun(sampleTool, complete);
    expect(result.ok && result.value.lastAnswerAt).toBe(
      "2026-11-20 10:00:01.5+00",
    );
  });

  it("returns incomplete with the missing visible ids", () => {
    expect(scoreRun(sampleTool, [row("stage", "selling")])).toEqual({
      ok: false,
      error: {
        code: "incomplete",
        missing: ["monthly_sales", "channels", "confidence", "team_size"],
      },
    });
  });

  it("returns stored_data_invalid for a corrupt stored value", () => {
    expect(
      scoreRun(sampleTool, [...complete.slice(1), row("stage", 42)]),
    ).toMatchObject({ ok: false, error: { code: "stored_data_invalid" } });
  });
});
