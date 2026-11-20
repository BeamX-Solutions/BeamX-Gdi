import { describe, expect, it } from "vitest";
import { sampleTool } from "@/tools/test-tools/sample";
import {
  afterSave,
  answersFromRows,
  CARD_NOTES,
  decideAnswer,
  decidePrefill,
  latestPrefill,
  latestShownQuestion,
  openQuestion,
  questionPart,
} from "./card-flow";
import type { PrefillData, SavedMessage } from "./parts";

const RUN = "0190a000-0000-7000-8000-000000000001";
const OTHER = "0190a000-0000-7000-8000-000000000002";

const shown = (runId: string, questionId: string): SavedMessage => {
  const question = sampleTool.questions.find((q) => q.id === questionId);
  return {
    id: `m-${runId}-${questionId}`,
    role: "assistant",
    parts: [
      {
        type: "data-question",
        data: {
          runId,
          questionId,
          view: { ...question, when: undefined, refine: undefined },
          progress: { question: { index: 1, total: 4 } },
        },
      },
    ],
  };
};

describe("answersFromRows", () => {
  it("keeps values that parse and drops the rest", () => {
    expect(
      answersFromRows(sampleTool, [
        { questionId: "stage", value: "idea" },
        { questionId: "confidence", value: 9 },
        { questionId: "ghost", value: "x" },
      ]),
    ).toEqual({ stage: "idea" });
  });
});

describe("openQuestion (AC-6b)", () => {
  it("is the latest shown question while it is visible", () => {
    const answers = { stage: "idea", channels: ["market"] };
    expect(openQuestion(sampleTool, answers, "stage")?.id).toBe("stage");
  });

  it("falls back to the next question when the shown one is hidden", () => {
    // monthly_sales is hidden once stage is "idea".
    expect(
      openQuestion(sampleTool, { stage: "idea" }, "monthly_sales")?.id,
    ).toBe("channels");
  });

  it("is the next question when nothing was shown, and null when all are answered", () => {
    expect(openQuestion(sampleTool, {}, null)?.id).toBe("stage");
    expect(
      openQuestion(
        sampleTool,
        { stage: "idea", channels: ["market"], confidence: 3, team_size: 2 },
        null,
      ),
    ).toBeNull();
  });
});

describe("latestShownQuestion and latestPrefill", () => {
  it("find the newest part for the run only", () => {
    const history = [
      shown(RUN, "stage"),
      shown(RUN, "channels"),
      shown(OTHER, "confidence"),
    ];
    expect(latestShownQuestion(history, RUN)).toBe("channels");
    expect(latestShownQuestion(history, "nope")).toBeNull();

    const card: PrefillData = {
      runId: RUN,
      title: "From our chat",
      items: [
        { questionId: "stage", prompt: "Where?", value: "idea", label: "Idea" },
      ],
    };
    const withPrefill: SavedMessage[] = [
      ...history,
      {
        id: "p",
        role: "assistant",
        parts: [{ type: "data-prefill", data: card }],
      },
    ];
    expect(latestPrefill(withPrefill, RUN)).toEqual(card);
    expect(latestPrefill(withPrefill, OTHER)).toBeNull();
  });

  it("skip malformed parts", () => {
    const bad: SavedMessage = {
      id: "x",
      role: "assistant",
      parts: [{ type: "data-question", data: { runId: RUN } }, null, "text"],
    };
    expect(latestShownQuestion([bad], RUN)).toBeNull();
  });
});

describe("questionPart", () => {
  it("carries the card view without tool only fields, plus progress and note", () => {
    const question = sampleTool.questions.find((q) => q.id === "team_size")!;
    const part = questionPart(
      sampleTool,
      RUN,
      { stage: "idea" },
      question,
      "Try again",
    );
    expect(part).toEqual({
      type: "data-question",
      data: {
        runId: RUN,
        questionId: "team_size",
        view: {
          kind: "text",
          id: "team_size",
          prompt: "How many people work with you?",
          input: "number",
          minValue: 0,
          maxValue: 500,
        },
        progress: { question: { index: 4, total: 4 } },
        note: "Try again",
      },
    });
  });
});

describe("decideAnswer (AC-6)", () => {
  it("saves a valid answer to a visible question", () => {
    expect(
      decideAnswer(sampleTool, {}, { questionId: "stage", value: "selling" }),
    ).toEqual({ kind: "save", questionId: "stage", value: "selling" });
  });

  it("allows answering an earlier visible question again", () => {
    expect(
      decideAnswer(
        sampleTool,
        { stage: "idea", channels: ["market"] },
        { questionId: "stage", value: "selling" },
      ).kind,
    ).toBe("save");
  });

  it("rejects a hidden or unknown question", () => {
    expect(
      decideAnswer(
        sampleTool,
        { stage: "idea" },
        {
          questionId: "monthly_sales",
          value: 10,
        },
      ),
    ).toEqual({ kind: "reject", note: CARD_NOTES.hidden });
    expect(
      decideAnswer(sampleTool, {}, { questionId: "ghost", value: "x" }),
    ).toEqual({ kind: "reject", note: CARD_NOTES.hidden });
  });

  it("rejects an invalid value with the reason", () => {
    expect(
      decideAnswer(sampleTool, {}, { questionId: "team_size", value: 13 }),
    ).toEqual({ kind: "reject", note: "We do not take 13." });
    expect(
      decideAnswer(sampleTool, {}, { questionId: "stage", value: "nope" }),
    ).toEqual({ kind: "reject", note: "Pick one of the options." });
  });
});

describe("afterSave (AC-6, AC-7)", () => {
  it("asks a question an edit revealed", () => {
    const answers = {
      stage: "selling",
      channels: ["market"],
      confidence: 3,
      team_size: 2,
    };
    const next = afterSave(sampleTool, answers);
    expect(next.kind === "card" && next.question.id).toBe("monthly_sales");
  });

  it("ignores the answer of a question an edit hid, and completes", () => {
    const answers = {
      stage: "idea",
      monthly_sales: 10,
      channels: ["market"],
      confidence: 3,
      team_size: 2,
    };
    expect(afterSave(sampleTool, answers)).toEqual({ kind: "complete" });
  });
});

describe("decidePrefill (AC-5)", () => {
  const card: PrefillData = {
    runId: RUN,
    title: "From our chat",
    items: [
      { questionId: "stage", prompt: "Where?", value: "selling", label: "S" },
      {
        questionId: "monthly_sales",
        prompt: "Sales?",
        value: 5000,
        label: "5k",
      },
      { questionId: "team_size", prompt: "Team?", value: 13, label: "13" },
    ],
  };

  it("saves accepted items that parse and are visible over the accepted set", () => {
    expect(
      decidePrefill(sampleTool, {}, card, {
        accept: ["stage", "monthly_sales", "team_size"],
        edit: null,
      }),
    ).toEqual({
      saves: [
        { questionId: "stage", value: "selling" },
        { questionId: "monthly_sales", value: 5000 },
      ],
      edit: null,
    });
  });

  it("drops items that are no longer visible or already answered", () => {
    expect(
      decidePrefill(sampleTool, { stage: "idea" }, card, {
        accept: ["stage", "monthly_sales"],
        edit: null,
      }).saves,
    ).toEqual([]);
  });

  it("ignores ids that were not on the card, and a missing card", () => {
    expect(
      decidePrefill(sampleTool, {}, card, {
        accept: ["confidence"],
        edit: null,
      }).saves,
    ).toEqual([]);
    expect(
      decidePrefill(sampleTool, {}, null, { accept: ["stage"], edit: null })
        .saves,
    ).toEqual([]);
  });

  it("returns the edited question only when it is visible", () => {
    expect(
      decidePrefill(sampleTool, {}, card, { accept: [], edit: "stage" }).edit,
    ).toBe("stage");
    expect(
      decidePrefill(sampleTool, {}, card, { accept: [], edit: "monthly_sales" })
        .edit,
    ).toBeNull();
  });
});
