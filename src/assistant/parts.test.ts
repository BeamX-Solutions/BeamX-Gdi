import { describe, expect, it } from "vitest";
import {
  classifyMessage,
  foldToolCalls,
  MAX_TYPED_CHARS,
  pendingApprovals,
  toModelMessages,
  toModelView,
  type SavedMessage,
} from "./parts";

const MSG = "0190a000-0000-7000-8000-0000000000aa";
const RUN = "0190a000-0000-7000-8000-000000000001";

const user = (parts: unknown[]) => ({ id: MSG, role: "user", parts });

describe("classifyMessage (AC-1)", () => {
  it("routes a lone card part to the card path", () => {
    const answer = classifyMessage(
      user([
        {
          type: "data-answer",
          data: { runId: RUN, questionId: "q", value: "a" },
        },
      ]),
    );
    expect(answer.ok && answer.value.turn.kind).toBe("answer");

    const prefill = classifyMessage(
      user([
        {
          type: "data-prefill-response",
          data: { runId: RUN, accept: ["q"], edit: null },
        },
      ]),
    );
    expect(prefill.ok && prefill.value.turn.kind).toBe("prefill_response");

    const retry = classifyMessage(
      user([{ type: "data-retry", data: { runId: RUN, action: "complete" } }]),
    );
    expect(retry.ok && retry.value.turn.kind).toBe("retry");
  });

  it("routes approval responses to an approval continuation", () => {
    const result = classifyMessage(
      user([
        { type: "tool-approval-response", approvalId: "a1", approved: true },
      ]),
    );
    expect(result.ok && result.value.turn).toEqual({
      kind: "approval",
      responses: [
        { type: "tool-approval-response", approvalId: "a1", approved: true },
      ],
    });
  });

  it("routes typed text to the AI turn", () => {
    const result = classifyMessage(
      user([{ type: "text", text: "  I have a business idea " }]),
    );
    expect(result.ok && result.value.turn).toEqual({
      kind: "text",
      text: "I have a business idea",
    });
  });

  it("refuses bad shapes, blank text, and card parts mixed with text", () => {
    const invalid = { ok: false, error: { code: "invalid_message" } };
    expect(
      classifyMessage({ id: "not-a-uuid", role: "user", parts: [] }),
    ).toEqual(invalid);
    expect(classifyMessage(user([]))).toEqual(invalid);
    expect(classifyMessage(user([{ type: "text", text: "   " }]))).toEqual(
      invalid,
    );
    expect(
      classifyMessage({
        ...user([{ type: "text", text: "hi" }]),
        role: "assistant",
      }),
    ).toEqual(invalid);
    expect(
      classifyMessage(
        user([
          { type: "text", text: "hi" },
          { type: "data-retry", data: { runId: RUN, action: "complete" } },
        ]),
      ),
    ).toEqual(invalid);
    expect(
      classifyMessage(
        user([
          {
            type: "data-answer",
            data: { runId: "x", questionId: "q", value: 1 },
          },
        ]),
      ),
    ).toEqual(invalid);
  });
});

describe("toModelView (history for the model)", () => {
  const history: SavedMessage[] = [
    { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] },
    {
      id: "m2",
      role: "assistant",
      parts: [
        { type: "text", text: "Hello" },
        {
          type: "data-question",
          data: {
            runId: RUN,
            questionId: "who",
            view: {
              kind: "single",
              id: "who",
              prompt: "Who is your customer?",
              options: [{ value: "shops", label: "Small shop owners" }],
            },
            progress: { question: { index: 1, total: 3 } },
          },
        },
      ],
    },
    {
      id: "m3",
      role: "user",
      parts: [
        {
          type: "data-answer",
          data: { runId: RUN, questionId: "who", value: "shops" },
        },
      ],
    },
    {
      id: "m4",
      role: "assistant",
      parts: [
        {
          type: "data-report",
          data: { runId: RUN, toolId: "t", toolName: "T" },
        },
      ],
    },
    { id: "m5", role: "system", parts: [{ type: "text", text: "secret" }] },
  ];

  it("turns a card answer into one short line and hides other data parts", () => {
    expect(toModelView(history)).toEqual([
      { id: "m1", role: "user", parts: [{ type: "text", text: "Hi" }] },
      { id: "m2", role: "assistant", parts: [{ type: "text", text: "Hello" }] },
      {
        id: "m3",
        role: "user",
        parts: [
          {
            type: "text",
            text: 'Answered "Who is your customer?": Small shop owners',
          },
        ],
      },
    ]);
  });

  it("cuts typed text to 4,000 characters", () => {
    const long: SavedMessage = {
      id: "x",
      role: "user",
      parts: [{ type: "text", text: "a".repeat(MAX_TYPED_CHARS + 50) }],
    };
    const [view] = toModelView([long]);
    const part = view?.parts[0];
    expect(part?.type === "text" && part.text.length).toBe(MAX_TYPED_CHARS);
  });

  it("converts to model messages", async () => {
    const messages = await toModelMessages(history);
    expect(messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("approvals across messages (spec 0006, approval mechanics)", () => {
  const requested = {
    type: "tool-startRun",
    toolCallId: "c1",
    state: "approval-requested",
    input: { toolId: "stellar", shownPrice: 30 },
    approval: { id: "ap1" },
  };
  const tap = (approved: boolean) => ({
    type: "tool-approval-response" as const,
    approvalId: "ap1",
    approved,
  });
  const history = (extra: SavedMessage[] = []): SavedMessage[] => [
    { id: "u1", role: "user", parts: [{ type: "text", text: "idea" }] },
    { id: "a1", role: "assistant", parts: [requested] },
    { id: "u2", role: "user", parts: [tap(true)] },
    ...extra,
  ];

  it("folds a tap into its call and drops the tap only message", () => {
    expect(foldToolCalls(history())).toEqual([
      history()[0],
      {
        id: "a1",
        role: "assistant",
        parts: [
          {
            ...requested,
            state: "approval-responded",
            approval: { id: "ap1", approved: true },
          },
        ],
      },
    ]);
  });

  it("moves a later saved output into the first part of the call", () => {
    const output = {
      type: "tool-startRun",
      toolCallId: "c1",
      state: "output-available",
      input: requested.input,
      output: { ok: true, runId: RUN },
    };
    const folded = foldToolCalls(
      history([
        {
          id: "a2",
          role: "assistant",
          parts: [output, { type: "text", text: "Let's go." }],
        },
      ]),
    );
    expect(folded.map((m) => m.id)).toEqual(["u1", "a1", "a2"]);
    expect(folded[1]?.parts).toEqual([
      { ...output, approval: { id: "ap1", approved: true } },
    ]);
    expect(folded[2]?.parts).toEqual([{ type: "text", text: "Let's go." }]);
  });

  it("converts to a model history the AI SDK can continue", async () => {
    const model = await toModelMessages(history());
    expect(model.at(-1)).toMatchObject({
      role: "tool",
      content: [
        { type: "tool-approval-response", approvalId: "ap1", approved: true },
      ],
    });
  });

  it("keeps only taps that answer a call still waiting", () => {
    expect(pendingApprovals(history(), [tap(true)])).toEqual([tap(true)]);
    expect(
      pendingApprovals(history(), [{ ...tap(true), approvalId: "other" }]),
    ).toEqual([]);
    const answered = history([
      {
        id: "a2",
        role: "assistant",
        parts: [
          {
            ...requested,
            state: "output-available",
            output: { ok: true },
          },
        ],
      },
    ]);
    expect(pendingApprovals(answered, [tap(true)])).toEqual([]);
  });
});
