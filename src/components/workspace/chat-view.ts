/**
 * What the chat thread shows (spec 0007, "Client"), as pure functions over the UI
 * messages: saved ones from `/c/[id]` and the ones `useChat` streams. Every part is
 * parsed before it is drawn; anything unknown or malformed is left out, never thrown.
 *
 * Rules:
 * - Cards (question, prefill, confirm, stop, error) are live only in the last message.
 *   An older one that was never answered is left out: the conversation moved on.
 * - An answered question shows as the answer bubble, editable only for the latest
 *   answer to that question while its run has no report yet.
 * - Approvals arrive as their own user message (`tool-approval-response`, spec 0006),
 *   so a confirm card's state comes from the taps and tool results after it.
 */
import { z } from "zod";
import {
  answerData,
  errorData,
  prefillData,
  prefillResponseData,
  questionData,
  reportData,
  type AnswerData,
  type ErrorData,
  type PrefillData,
  type QuestionData,
  type ReportData,
} from "@/assistant/part-schemas";
import { creditSummarySchema, type CreditSummary } from "@/billing/summary";
import type { QuestionView } from "@/components/answer-cards/types";

/** A message as the view reads it: any parts, checked one by one. */
export type ViewMessage = {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: readonly unknown[];
};

export type ApprovalState = "pending" | "approved" | "declined" | "expired";

/** The money tools that ask for approval with a price (spec 0006). */
export type PricedTool = "startRun" | "resumeRun" | "restartRun";

export type ThreadItem =
  | {
      readonly kind: "text";
      readonly id: string;
      readonly role: "user" | "assistant";
      readonly markdown: string;
      readonly streaming: boolean;
    }
  | {
      readonly kind: "question";
      readonly id: string;
      readonly data: QuestionData;
    }
  | {
      readonly kind: "answer";
      readonly id: string;
      readonly view: QuestionView;
      readonly question: QuestionData;
      readonly value: AnswerData["value"];
      readonly editable: boolean;
    }
  | {
      readonly kind: "prefill";
      readonly id: string;
      readonly data: PrefillData;
    }
  | {
      readonly kind: "prefill-response";
      readonly id: string;
      readonly accepted: number;
      readonly editPrompt: string | null;
    }
  | { readonly kind: "report"; readonly id: string; readonly data: ReportData }
  | {
      readonly kind: "error";
      readonly id: string;
      readonly data: ErrorData;
    }
  | {
      readonly kind: "confirm";
      readonly id: string;
      readonly tool: PricedTool;
      readonly approvalId: string;
      readonly toolId: string | null;
      readonly price: number;
      readonly available: number | null;
      readonly state: ApprovalState;
    }
  | {
      readonly kind: "stop";
      readonly id: string;
      readonly approvalId: string;
      readonly heldAmount: number;
      readonly state: ApprovalState;
    }
  | {
      readonly kind: "short";
      readonly id: string;
      readonly price: number;
      readonly available: number;
      readonly shortfall: number;
    };

// ---------------------------------------------------------------------------
// Part shapes
// ---------------------------------------------------------------------------

const textPart = z.object({ type: z.literal("text"), text: z.string() });

const dataPart = <T extends z.ZodType>(name: string, data: T) =>
  z.object({ type: z.literal(`data-${name}`), data });

const questionPart = dataPart("question", questionData);
const answerPart = dataPart("answer", answerData);
const prefillPart = dataPart("prefill", prefillData);
const prefillResponsePart = dataPart("prefill-response", prefillResponseData);
const reportPart = dataPart("report", reportData);
const errorPart = dataPart("error", errorData);

const approvalResponsePart = z.object({
  type: z.literal("tool-approval-response"),
  approvalId: z.string(),
  approved: z.boolean(),
});

const toolPart = z.object({
  type: z.string().startsWith("tool-"),
  toolCallId: z.string(),
  state: z.string(),
  input: z.unknown().optional(),
  output: z.unknown().optional(),
  approval: z.object({ id: z.string() }).optional(),
});

type ToolPart = z.infer<typeof toolPart>;

const pricedInput = z.object({
  toolId: z.string().optional(),
  shownPrice: z.int().nonnegative(),
  availableBalance: z.int().optional(),
});

const stopInput = z.object({ heldAmount: z.int().nonnegative() });

const insufficientOutput = z.object({
  ok: z.literal(false),
  error: z.literal("insufficient_credits"),
  price: z.int(),
  available: z.int(),
  shortfall: z.int(),
});

const summaryOutput = z.object({ summary: creditSummarySchema });

const TERMINAL = new Set(["output-available", "output-error", "output-denied"]);

const parse = <T>(schema: z.ZodType<T>, value: unknown): T | null => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : null;
};

const toolName = (p: ToolPart) => p.type.slice("tool-".length);

const isPriced = (name: string): name is PricedTool =>
  name === "startRun" || name === "resumeRun" || name === "restartRun";

const key = (runId: string, questionId: string) => `${runId}:${questionId}`;

// ---------------------------------------------------------------------------
// Facts gathered across the whole thread
// ---------------------------------------------------------------------------

type Facts = {
  /** The latest card shown for each run and question. */
  readonly views: ReadonlyMap<string, QuestionData>;
  /** The id of the last answer part for each run and question. */
  readonly lastAnswer: ReadonlyMap<string, string>;
  /** Runs that reached a report. */
  readonly reported: ReadonlySet<string>;
  /** Approval taps by approval id. */
  readonly taps: ReadonlyMap<string, boolean>;
  /** Tool calls that reached an end state, with the state. */
  readonly ended: ReadonlyMap<string, string>;
};

const partsOf = (m: ViewMessage) =>
  m.parts.map((part, index) => ({ part, id: `${m.id}:${index}` }));

const gather = (messages: readonly ViewMessage[]): Facts => {
  const views = new Map<string, QuestionData>();
  const lastAnswer = new Map<string, string>();
  const reported = new Set<string>();
  const taps = new Map<string, boolean>();
  const ended = new Map<string, string>();
  for (const m of messages)
    for (const { part, id } of partsOf(m)) {
      const question = parse(questionPart, part);
      if (question)
        views.set(
          key(question.data.runId, question.data.questionId),
          question.data,
        );
      const answer = m.role === "user" ? parse(answerPart, part) : null;
      if (answer)
        lastAnswer.set(key(answer.data.runId, answer.data.questionId), id);
      const report = parse(reportPart, part);
      if (report) reported.add(report.data.runId);
      const tap = m.role === "user" ? parse(approvalResponsePart, part) : null;
      if (tap) taps.set(tap.approvalId, tap.approved);
      const tool = parse(toolPart, part);
      if (tool && TERMINAL.has(tool.state))
        ended.set(tool.toolCallId, tool.state);
    }
  return { views, lastAnswer, reported, taps, ended };
};

const approvalState = (
  facts: Facts,
  approvalId: string,
  toolCallId: string,
  live: boolean,
): ApprovalState => {
  const tap = facts.taps.get(approvalId);
  if (tap !== undefined) return tap ? "approved" : "declined";
  const end = facts.ended.get(toolCallId);
  if (end === "output-denied") return "declined";
  if (end !== undefined) return "approved";
  return live ? "pending" : "expired";
};

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

const toolItems = (
  facts: Facts,
  part: ToolPart,
  id: string,
  live: boolean,
): readonly ThreadItem[] => {
  const name = toolName(part);
  if (part.state === "approval-requested" && part.approval) {
    const state = approvalState(facts, part.approval.id, part.toolCallId, live);
    if (state === "expired") return [];
    if (name === "stopRun") {
      const input = parse(stopInput, part.input);
      return [
        {
          kind: "stop",
          id,
          approvalId: part.approval.id,
          heldAmount: input?.heldAmount ?? 0,
          state,
        },
      ];
    }
    if (!isPriced(name)) return [];
    const input = parse(pricedInput, part.input);
    return input === null
      ? []
      : [
          {
            kind: "confirm",
            id,
            tool: name,
            approvalId: part.approval.id,
            toolId: input.toolId ?? null,
            price: input.shownPrice,
            available: input.availableBalance ?? null,
            state,
          },
        ];
  }
  if (part.state === "output-available") {
    const short = parse(insufficientOutput, part.output);
    return short === null
      ? []
      : [
          {
            kind: "short",
            id,
            price: short.price,
            available: short.available,
            shortfall: short.shortfall,
          },
        ];
  }
  return [];
};

const messageItems = (
  facts: Facts,
  m: ViewMessage,
  live: boolean,
  streaming: boolean,
): readonly ThreadItem[] => {
  const items: ThreadItem[] = [];
  const role = m.role === "user" ? "user" : "assistant";
  for (const { part, id } of partsOf(m)) {
    const text = parse(textPart, part);
    if (text) {
      // Consecutive text parts read as one message.
      const last = items.at(-1);
      if (last?.kind === "text")
        items[items.length - 1] = {
          ...last,
          markdown: `${last.markdown}\n\n${text.text}`,
        };
      else
        items.push({ kind: "text", id, role, markdown: text.text, streaming });
      continue;
    }
    if (m.role === "user") {
      const answer = parse(answerPart, part);
      if (answer) {
        const k = key(answer.data.runId, answer.data.questionId);
        const question = facts.views.get(k);
        if (question)
          items.push({
            kind: "answer",
            id,
            view: question.view,
            question,
            value: answer.data.value,
            editable:
              facts.lastAnswer.get(k) === id &&
              !facts.reported.has(answer.data.runId),
          });
        continue;
      }
      const response = parse(prefillResponsePart, part);
      if (response) {
        const prompt =
          response.data.edit === null
            ? null
            : (facts.views.get(key(response.data.runId, response.data.edit))
                ?.view.prompt ?? null);
        items.push({
          kind: "prefill-response",
          id,
          accepted: response.data.accept.length,
          editPrompt: prompt,
        });
      }
      continue;
    }
    const question = parse(questionPart, part);
    if (question) {
      if (live) items.push({ kind: "question", id, data: question.data });
      continue;
    }
    const prefill = parse(prefillPart, part);
    if (prefill) {
      if (live) items.push({ kind: "prefill", id, data: prefill.data });
      continue;
    }
    const report = parse(reportPart, part);
    if (report) {
      items.push({ kind: "report", id, data: report.data });
      continue;
    }
    const error = parse(errorPart, part);
    if (error) {
      if (live) items.push({ kind: "error", id, data: error.data });
      continue;
    }
    const tool = parse(toolPart, part);
    if (tool) items.push(...toolItems(facts, tool, id, live));
  }
  // A streaming reply with no text yet still gets its (empty, busy) bubble.
  if (streaming && !items.some((i) => i.kind === "text"))
    items.unshift({
      kind: "text",
      id: `${m.id}:streaming`,
      role,
      markdown: "",
      streaming,
    });
  return items;
};

/**
 * The thread, in order. `streamingId` is the assistant message still streaming, if any.
 * Pure.
 */
export const threadItems = (
  messages: readonly ViewMessage[],
  streamingId: string | null,
): readonly ThreadItem[] => {
  const facts = gather(messages);
  const lastId = messages.at(-1)?.id;
  return messages.flatMap((m) =>
    m.role === "system"
      ? []
      : messageItems(facts, m, m.id === lastId, m.id === streamingId),
  );
};

/** The report the panel shows: the newest report card in the thread. Pure. */
export const latestReport = (items: readonly ThreadItem[]): ReportData | null =>
  items.flatMap((i) => (i.kind === "report" ? [i.data] : [])).at(-1) ?? null;

/**
 * The newest credit summary a money tool returned (spec 0007, AC-9), keyed by its tool
 * call, so the chip can tell a new one from one it has already shown. Pure.
 */
export const latestToolSummary = (
  messages: readonly ViewMessage[],
): { readonly key: string; readonly summary: CreditSummary } | null => {
  const found = messages.flatMap((m) =>
    m.parts.flatMap((part) => {
      const tool = parse(toolPart, part);
      if (tool?.state !== "output-available") return [];
      const out = parse(summaryOutput, tool.output);
      return out === null
        ? []
        : [{ key: tool.toolCallId, summary: out.summary }];
    }),
  );
  return found.at(-1) ?? null;
};

/** The last user message with typed text, for Retry after an AI error. Pure. */
export const lastTypedMessageId = (
  messages: readonly ViewMessage[],
): string | null =>
  [...messages]
    .reverse()
    .find(
      (m) =>
        m.role === "user" && m.parts.some((p) => parse(textPart, p) !== null),
    )?.id ?? null;

/**
 * The messages without the one a thread item came from (item ids are
 * `<messageId>:<partIndex>`), and without the user message right before it. "Got it" on a limit notice uses it: the notice was never
 * saved, so dropping it on the client is the whole dismissal (spec 0007, AC-8).
 */
export const withoutMessageOf = <
  M extends { readonly id: string; readonly role?: string },
>(
  messages: readonly M[],
  itemId: string,
): M[] => {
  const at = messages.findIndex((m) => itemId.startsWith(`${m.id}:`));
  if (at === -1) return [...messages];
  // The user message the notice refused was never saved either. Dropping it too makes
  // the reply before it the last message again, so its open card is live (AC-8).
  const from = messages[at - 1]?.role === "user" ? at - 1 : at;
  return [...messages.slice(0, from), ...messages.slice(at + 1)];
};

/** Notices the server sends instead of taking the message: shown, never saved. */
const refusalKinds: ReadonlySet<ErrorData["kind"]> = new Set([
  "busy",
  "limit_text",
  "limit_run",
  "spend_cap",
]);

/**
 * The user message a finished reply shows the server took (saved, then answered), or
 * null when the reply is only a busy or limit notice, or never started (no parts). An
 * AI error mid reply still counts: the message was saved before the AI ran. Pure.
 */
export const takenUserMessageId = (
  messages: readonly ViewMessage[],
  reply: ViewMessage,
): string | null => {
  if (reply.parts.length === 0) return null;
  const refusal = reply.parts.every((p) => {
    const e = parse(errorPart, p);
    return e !== null && refusalKinds.has(e.data.kind);
  });
  if (refusal) return null;
  const at = messages.findIndex((m) => m.id === reply.id);
  const before = at === -1 ? messages : messages.slice(0, at);
  return before.findLast((m) => m.role === "user")?.id ?? null;
};

/** What "Send again" on a busy notice does: the thread to show, then what to send. */
export type BusyRetry<M> = {
  /** The thread without the notice, ready for the running reply to stream into. */
  readonly messages: M[];
  /** The refused user message, to send once the running reply is done; null if it was taken. */
  readonly resend: M | null;
};

/**
 * "Send again" on a busy notice (spec 0007, AC-2). Another turn holds the chat, so
 * the client reattaches to that turn's reply instead of asking again (no second AI
 * call, no duplicate reply). The notice always goes. The user message before it:
 * - already taken by the server (`taken`, e.g. Retry after a dropped stream resent
 *   it): the running reply is its answer, so it stays and nothing is resent;
 * - never taken: it comes off the thread and is sent again after the running reply.
 * Pure.
 */
export const busyRetryPlan = <
  M extends { readonly id: string; readonly role?: string },
>(
  messages: readonly M[],
  itemId: string,
  taken: ReadonlySet<string>,
): BusyRetry<M> => {
  const at = messages.findIndex((m) => itemId.startsWith(`${m.id}:`));
  if (at === -1) return { messages: [...messages], resend: null };
  const refused = messages[at - 1];
  const resend =
    refused !== undefined && refused.role === "user" && !taken.has(refused.id)
      ? refused
      : null;
  const from = resend === null ? at : at - 1;
  return {
    messages: [...messages.slice(0, from), ...messages.slice(at + 1)],
    resend,
  };
};

/**
 * The typed text of the user message a notice refused (the message right before the
 * notice's message), so "Got it" can put it back in the composer; null for a card tap.
 * Pure.
 */
export const refusedText = (
  messages: readonly ViewMessage[],
  itemId: string,
): string | null => {
  const at = messages.findIndex((m) => itemId.startsWith(`${m.id}:`));
  const refused = at > 0 ? messages[at - 1] : undefined;
  if (refused === undefined || refused.role !== "user") return null;
  const text = refused.parts
    .map((p) => parse(textPart, p)?.text ?? "")
    .join("");
  return text === "" ? null : text;
};

/** True when a reply is the `answered` notice: the thread should be loaded again. Pure. */
export const isAnsweredNotice = (reply: ViewMessage): boolean =>
  reply.parts.some((p) => parse(errorPart, p)?.data.kind === "answered");
