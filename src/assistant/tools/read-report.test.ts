import { describe, expect, it } from "vitest";
import { FAKE_STELLAR_ANALYSIS } from "@/lib/fake-model";
import { err } from "@/lib/result";
import { getReader, getTool } from "@/tools/registry";
import { readReportResult, type ReportRead } from "./read-report";

// Spec 0014, AC-1 and AC-2.

const stellar = (() => {
  const found = getTool("stellar");
  if (!found.ok) throw new Error("stellar is not registered");
  return found.value;
})();

const answers = Object.fromEntries(
  stellar.questions.map((q) => [
    q.id,
    q.kind === "single"
      ? (q.options[0]?.value ?? "")
      : q.kind === "multi"
        ? [q.options[0]?.value ?? ""]
        : q.kind === "scale"
          ? q.min
          : "Fresh bread for offices.",
  ]),
);

const read = (status: string): ReportRead => {
  const scored = stellar.score(answers);
  return {
    run: {
      toolId: "stellar",
      toolVersion: stellar.version,
      completedAt: "2026-11-24 10:00:00.123456+00",
      scores: scored.ok ? scored.value : null,
    },
    answers: Object.entries(answers).map(([questionId, value]) => ({
      questionId,
      value,
    })),
    report: { status, content: { analysis: FAKE_STELLAR_ANALYSIS } },
  };
};

describe("readReportResult", () => {
  it("returns a ready report as text with the tool and the day", () => {
    const result = readReportResult(
      read("ready"),
      getReader("stellar", stellar.version),
      "Stellar",
    );
    expect(result).toMatchObject({
      ok: true,
      toolName: "Stellar",
      finishedOn: "24 Nov 2026",
      truncated: false,
    });
    if (result.ok) {
      expect(result.text).toContain("You have not priced your product yet.");
      expect(result.text).not.toContain("<");
    }
  });

  it("is not ready while the report is generating, or with no reader", () => {
    expect(
      readReportResult(
        read("generating"),
        getReader("stellar", stellar.version),
        "Stellar",
      ),
    ).toEqual({ ok: false, error: "not_ready" });
    expect(
      readReportResult(
        read("ready"),
        err({ code: "unsupported_version", id: "stellar", version: "0" }),
        "Stellar",
      ),
    ).toEqual({ ok: false, error: "not_ready" });
  });
});
