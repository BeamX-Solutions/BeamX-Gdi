import { describe, expect, it } from "vitest";
import {
  lastTypedMessageId,
  latestReport,
  latestToolSummary,
  threadItems,
  withoutMessageOf,
  busyRetryPlan,
  takenUserMessageId,
  type ViewMessage,
} from "./chat-view";

const RUN = "0190a000-0000-7000-8000-000000000001";

const view = {
  kind: "single",
  id: "stage",
  prompt: "What stage are you at?",
  options: [
    { value: "idea", label: "Just an idea" },
    { value: "selling", label: "Already selling" },
  ],
} as const;

const question = (questionId = "stage") => ({
  type: "data-question",
  data: {
    runId: RUN,
    questionId,
    view: { ...view, id: questionId },
    progress: { question: { index: 1, total: 11 } },
  },
});

const answer = (value: string, questionId = "stage") => ({
  type: "data-answer",
  data: { runId: RUN, questionId, value },
});

const user = (id: string, ...parts: unknown[]): ViewMessage => ({
  id,
  role: "user",
  parts,
});
const assistant = (id: string, ...parts: unknown[]): ViewMessage => ({
  id,
  role: "assistant",
  parts,
});
const text = (t: string) => ({ type: "text", text: t });

const confirmPart = (state = "approval-requested") => ({
  type: "tool-startRun",
  toolCallId: "call-1",
  state,
  input: { toolId: "stellar", shownPrice: 30, availableBalance: 30 },
  approval: { id: "ap-1" },
});

const kinds = (messages: readonly ViewMessage[]) =>
  threadItems(messages, null).map((i) => i.kind);

describe("threadItems: text", () => {
  it("joins a message's text parts and keeps roles", () => {
    const items = threadItems(
      [user("u1", text("Hi")), assistant("a1", text("Hello"), text("There"))],
      null,
    );
    expect(items).toEqual([
      expect.objectContaining({ kind: "text", role: "user", markdown: "Hi" }),
      expect.objectContaining({
        kind: "text",
        role: "assistant",
        markdown: "Hello\n\nThere",
        streaming: false,
      }),
    ]);
  });

  it("gives a streaming reply with no text yet an empty busy bubble", () => {
    const items = threadItems([user("u1", text("Hi")), assistant("a1")], "a1");
    expect(items.at(-1)).toMatchObject({
      kind: "text",
      markdown: "",
      streaming: true,
    });
  });

  it("drops system messages and unknown or malformed parts", () => {
    expect(
      kinds([
        { id: "s", role: "system", parts: [text("secret")] },
        assistant("a1", { type: "data-question", data: { runId: "x" } }, 42, {
          type: "step-start",
        }),
      ]),
    ).toEqual([]);
  });
});

describe("threadItems: cards (AC-3, AC-4)", () => {
  it("shows a question card only while it is in the last message", () => {
    expect(kinds([assistant("a1", question())])).toEqual(["question"]);
    expect(
      kinds([assistant("a1", question()), user("u1", text("why?"))]),
    ).toEqual(["text"]);
  });

  it("collapses an answer into a bubble, editable only for the latest answer before the report", () => {
    const messages = [
      assistant("a1", question()),
      user("u1", answer("idea")),
      assistant("a2", question()),
      user("u2", answer("selling")),
    ];
    const answers = threadItems(messages, null).filter(
      (i) => i.kind === "answer",
    );
    expect(answers.map((a) => a.kind === "answer" && a.editable)).toEqual([
      false,
      true,
    ]);

    const reported = threadItems(
      [
        ...messages,
        assistant("a3", {
          type: "data-report",
          data: { runId: RUN, toolId: "stellar", toolName: "Stellar" },
        }),
      ],
      null,
    );
    expect(
      reported.filter((i) => i.kind === "answer" && i.editable),
    ).toHaveLength(0);
    expect(latestReport(reported)).toEqual({
      runId: RUN,
      toolId: "stellar",
      toolName: "Stellar",
    });
  });

  it("an answer to a question never shown is left out", () => {
    expect(kinds([user("u1", answer("idea", "unknown"))])).toEqual([]);
  });

  it("shows the prefill response as a short bubble with the edited prompt", () => {
    const items = threadItems(
      [
        assistant("a0", question("stage")),
        user("u0", text("hi")),
        assistant("a1", {
          type: "data-prefill",
          data: { runId: RUN, title: "From our chat", items: [] },
        }),
        user("u1", {
          type: "data-prefill-response",
          data: { runId: RUN, accept: ["a", "b"], edit: "stage" },
        }),
      ],
      null,
    );
    expect(items.at(-1)).toMatchObject({
      kind: "prefill-response",
      accepted: 2,
      editPrompt: "What stage are you at?",
    });
  });

  it("shows an error card only in the last message", () => {
    const error = { type: "data-error", data: { kind: "busy", retry: false } };
    expect(kinds([assistant("a1", error)])).toEqual(["error"]);
    expect(kinds([assistant("a1", error), user("u1", text("ok"))])).toEqual([
      "text",
    ]);
  });
});

describe("threadItems: money cards (AC-3, AC-10)", () => {
  it("a waiting confirm card carries the price and the balance", () => {
    expect(threadItems([assistant("a1", confirmPart())], null)).toEqual([
      expect.objectContaining({
        kind: "confirm",
        tool: "startRun",
        approvalId: "ap-1",
        toolId: "stellar",
        price: 30,
        available: 30,
        state: "pending",
      }),
    ]);
  });

  it("an approval tap or a later tool result settles the card", () => {
    const tapped = (approved: boolean) =>
      threadItems(
        [
          assistant("a1", confirmPart()),
          user("u1", {
            type: "tool-approval-response",
            approvalId: "ap-1",
            approved,
          }),
        ],
        null,
      )[0];
    expect(tapped(true)).toMatchObject({ state: "approved" });
    expect(tapped(false)).toMatchObject({ state: "declined" });

    const denied = threadItems(
      [
        assistant("a1", confirmPart()),
        assistant("a2", {
          type: "tool-startRun",
          toolCallId: "call-1",
          state: "output-denied",
        }),
      ],
      null,
    )[0];
    expect(denied).toMatchObject({ state: "declined" });
  });

  it("an unanswered card the chat moved past is left out", () => {
    expect(
      kinds([assistant("a1", confirmPart()), user("u1", text("hmm"))]),
    ).toEqual(["text"]);
  });

  it("a stop card carries the held amount", () => {
    const items = threadItems(
      [
        assistant("a1", {
          type: "tool-stopRun",
          toolCallId: "c2",
          state: "approval-requested",
          input: { runId: RUN, heldAmount: 30 },
          approval: { id: "ap-2" },
        }),
      ],
      null,
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: "stop",
        heldAmount: 30,
        state: "pending",
      }),
    ]);
  });

  it("an insufficient credits result shows the short balance card", () => {
    const items = threadItems(
      [
        assistant("a1", {
          type: "tool-startRun",
          toolCallId: "call-1",
          state: "output-available",
          output: {
            ok: false,
            error: "insufficient_credits",
            price: 30,
            available: 0,
            shortfall: 30,
          },
        }),
      ],
      null,
    );
    expect(items).toEqual([
      expect.objectContaining({
        kind: "short",
        price: 30,
        available: 0,
        shortfall: 30,
      }),
    ]);
  });
});

describe("latestToolSummary (AC-9)", () => {
  it("returns the newest summary a tool result carried", () => {
    const result = (id: string, available: number) => ({
      type: "tool-startRun",
      toolCallId: id,
      state: "output-available",
      output: { ok: true, summary: { available, held: 30 } },
    });
    expect(
      latestToolSummary([
        assistant("a1", result("c1", 30)),
        assistant("a2", text("hi"), result("c2", 0)),
      ]),
    ).toEqual({ key: "c2", summary: { available: 0, held: 30 } });
    expect(latestToolSummary([assistant("a1", text("x"))])).toBeNull();
  });
});

describe("lastTypedMessageId", () => {
  it("skips card taps", () => {
    expect(
      lastTypedMessageId([
        user("u1", text("idea")),
        assistant("a1", question()),
        user("u2", answer("idea")),
      ]),
    ).toBe("u1");
  });
});

describe("withoutMessageOf (spec 0007, AC-8)", () => {
  it("drops only the message the item came from", () => {
    const ms = [{ id: "a" }, { id: "b" }, { id: "ab" }];
    expect(withoutMessageOf(ms, "b:0")).toEqual([{ id: "a" }, { id: "ab" }]);
    expect(withoutMessageOf(ms, "a:2")).toEqual([{ id: "b" }, { id: "ab" }]);
  });

  it("drops the refused user message with the notice, so the open card is live again", () => {
    const reply: ViewMessage = {
      id: "r",
      role: "assistant",
      parts: [{ type: "text", text: "Sure." }, question()],
    };
    const ms: ViewMessage[] = [
      reply,
      { id: "u", role: "user", parts: [{ type: "text", text: "41st" }] },
      {
        id: "n",
        role: "assistant",
        parts: [
          { type: "data-error", data: { kind: "limit_run", retry: false } },
        ],
      },
    ];
    // While the notice shows, it is the last message and the card is not live.
    expect(threadItems(ms, null).some((i) => i.kind === "question")).toBe(
      false,
    );
    const after = withoutMessageOf(ms, "n:0");
    expect(after.map((m) => m.id)).toEqual(["r"]);
    expect(threadItems(after, null).some((i) => i.kind === "question")).toBe(
      true,
    );
  });
});

const notice = (id: string, kind: string): ViewMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "data-error", data: { kind, retry: false } }],
});
const typed = (id: string, t: string): ViewMessage => ({
  id,
  role: "user",
  parts: [{ type: "text", text: t }],
});
const said = (id: string, t: string): ViewMessage => ({
  id,
  role: "assistant",
  parts: [{ type: "text", text: t }],
});

describe("takenUserMessageId (spec 0007, AC-2)", () => {
  it("is the user message a real reply answers", () => {
    const ms = [typed("u1", "hi"), said("a1", "Hello")];
    expect(takenUserMessageId(ms, said("a1", "Hello"))).toBe("u1");
  });

  it("is the last user message when the reply is not in the list yet", () => {
    expect(takenUserMessageId([typed("u1", "hi")], said("a1", "x"))).toBe("u1");
  });

  it("is null for a busy or limit notice: the server never took the message", () => {
    const ms = [typed("u1", "hi"), notice("n", "busy")];
    expect(takenUserMessageId(ms, notice("n", "busy"))).toBeNull();
    expect(takenUserMessageId(ms, notice("n", "limit_run"))).toBeNull();
  });

  it("counts an AI error reply (the message was saved before the AI ran)", () => {
    const ms = [typed("u1", "hi"), notice("e", "ai_error")];
    expect(takenUserMessageId(ms, notice("e", "ai_error"))).toBe("u1");
  });

  it("is null for a reply that never started", () => {
    const empty: ViewMessage = { id: "x", role: "assistant", parts: [] };
    expect(takenUserMessageId([typed("u1", "hi")], empty)).toBeNull();
  });
});

describe("busyRetryPlan (spec 0007, AC-2)", () => {
  it("a new message refused as busy: drop it and the notice, resend it after", () => {
    const ms = [
      typed("u1", "idea"),
      said("a1", "Tell me more"),
      typed("u2", "more"),
      notice("n", "busy"),
    ];
    const plan = busyRetryPlan(ms, "n:0", new Set(["u1"]));
    expect(plan.messages.map((m) => m.id)).toEqual(["u1", "a1"]);
    expect(plan.resend?.id).toBe("u2");
  });

  it("a taken message resent (Retry after a dropped stream): keep it, resend nothing", () => {
    const ms = [typed("u1", "idea"), notice("n", "busy")];
    const plan = busyRetryPlan(ms, "n:0", new Set(["u1"]));
    expect(plan.messages.map((m) => m.id)).toEqual(["u1"]);
    expect(plan.resend).toBeNull();
  });

  it("never resends a message the running turn is answering, so no duplicate reply", () => {
    // Send again twice in a row on the same taken message: still nothing resent.
    const ms = [typed("u1", "idea"), notice("n1", "busy")];
    const first = busyRetryPlan(ms, "n1:0", new Set(["u1"]));
    const again = busyRetryPlan(
      [...first.messages, notice("n2", "busy")],
      "n2:0",
      new Set(["u1"]),
    );
    expect(again.resend).toBeNull();
    expect(again.messages.map((m) => m.id)).toEqual(["u1"]);
  });

  it("an unknown item leaves the thread as it is", () => {
    const ms = [typed("u1", "idea")];
    expect(busyRetryPlan(ms, "zz:0", new Set())).toEqual({
      messages: ms,
      resend: null,
    });
  });
});
