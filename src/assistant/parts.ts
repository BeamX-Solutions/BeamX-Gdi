/**
 * The custom chat message parts (spec 0006, "Message parts") as Zod schemas, validated
 * on read and write, plus the converter from saved UI messages to model messages.
 *
 * The client sends `data-answer`, `data-prefill-response` and `data-retry` only from
 * cards. Their `runId` is never trusted: every query is scoped to the session user.
 */
import { convertToModelMessages, type ModelMessage, type UIMessage } from "ai";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import {
  formatAnswer,
  type QuestionProgress,
  type QuestionView,
} from "@/tools/registry";

/** Typed text longer than this is cut before it reaches the model (spec 0006). */
export const MAX_TYPED_CHARS = 4_000;

// ---------------------------------------------------------------------------
// Shared value schemas
// ---------------------------------------------------------------------------

const answerValue = z.union([
  z.string(),
  z.number(),
  z.array(z.string()).readonly(),
]);

const option = z.object({ value: z.string(), label: z.string() });

const viewBase = {
  id: z.string(),
  prompt: z.string(),
  help: z.string().optional(),
};

export const questionViewSchema: z.ZodType<QuestionView> = z.discriminatedUnion(
  "kind",
  [
    z.object({
      kind: z.literal("single"),
      ...viewBase,
      options: z.array(option).readonly(),
    }),
    z.object({
      kind: z.literal("multi"),
      ...viewBase,
      options: z.array(option).readonly(),
      min: z.number().int(),
      max: z.number().int(),
    }),
    z.object({
      kind: z.literal("scale"),
      ...viewBase,
      min: z.number().int(),
      max: z.number().int(),
      minLabel: z.string(),
      maxLabel: z.string(),
    }),
    z.object({
      kind: z.literal("text"),
      ...viewBase,
      input: z.enum(["text", "number", "money"]),
      placeholder: z.string().optional(),
      maxLength: z.number().int().optional(),
      minValue: z.number().optional(),
      maxValue: z.number().optional(),
    }),
  ],
);

const count = z.object({
  index: z.number().int().positive(),
  total: z.number().int().positive(),
});

export const progressSchema: z.ZodType<QuestionProgress> = z.object({
  area: count.extend({ name: z.string() }).optional(),
  question: count,
});

// ---------------------------------------------------------------------------
// Part data (the `data` of each `data-*` part)
// ---------------------------------------------------------------------------

export const questionData = z.object({
  runId: z.uuid(),
  questionId: z.string(),
  view: questionViewSchema,
  progress: progressSchema,
  /** Why the card was shown again (an invalid answer, a run that moved on). */
  note: z.string().optional(),
});

export const answerData = z.object({
  runId: z.uuid(),
  questionId: z.string().min(1).max(100),
  value: answerValue,
});

export const prefillData = z.object({
  runId: z.uuid(),
  /** "From our chat", or "From your last run" after a version change (AC-5b). */
  title: z.string(),
  items: z
    .array(
      z.object({
        questionId: z.string(),
        prompt: z.string(),
        value: answerValue,
        label: z.string(),
        /** Kept when accepted (AC-5b, "From your last run"); `chat` when absent. */
        source: z.enum(["client", "chat", "profile", "file"]).optional(),
      }),
    )
    .readonly(),
});

export const prefillResponseData = z.object({
  runId: z.uuid(),
  accept: z.array(z.string().min(1).max(100)).max(100).readonly(),
  edit: z.string().min(1).max(100).nullable(),
});

export const reportData = z.object({
  runId: z.uuid(),
  toolId: z.string(),
  toolName: z.string(),
});

export const errorKinds = [
  "ai_error",
  "refusal",
  "complete_retry",
  "busy",
] as const;
export type ErrorKind = (typeof errorKinds)[number];

export const errorData = z.object({
  kind: z.enum(errorKinds),
  retry: z.boolean(),
  /** Set for `complete_retry`, so the error card's button can send `data-retry`. */
  runId: z.uuid().optional(),
});

export const retryData = z.object({
  runId: z.uuid(),
  action: z.literal("complete"),
});

export type QuestionData = z.infer<typeof questionData>;
export type AnswerData = z.infer<typeof answerData>;
export type PrefillData = z.infer<typeof prefillData>;
/** Where a saved answer came from (`tool_run_answer.source`). */
export type AnswerSource = "client" | "chat" | "profile" | "file";
export type PrefillResponseData = z.infer<typeof prefillResponseData>;
export type ReportData = z.infer<typeof reportData>;
export type ErrorData = z.infer<typeof errorData>;
export type RetryData = z.infer<typeof retryData>;

/** The data part types of a BeamX chat message, for `UIMessage<…, ChatDataParts>`. */
export type ChatDataParts = {
  readonly question: QuestionData;
  readonly answer: AnswerData;
  readonly prefill: PrefillData;
  readonly "prefill-response": PrefillResponseData;
  readonly report: ReportData;
  readonly error: ErrorData;
  readonly retry: RetryData;
};

/** The schemas by part name, in the shape `useChat`'s `dataPartSchemas` takes. */
export const chatDataPartSchemas = {
  question: questionData,
  answer: answerData,
  prefill: prefillData,
  "prefill-response": prefillResponseData,
  report: reportData,
  error: errorData,
  retry: retryData,
} as const;

// ---------------------------------------------------------------------------
// Parts the server writes into the assistant message
// ---------------------------------------------------------------------------

/** One part the deterministic path or the AI turn adds to the assistant message. */
export type ServerPart =
  | { readonly type: "data-question"; readonly data: QuestionData }
  | { readonly type: "data-prefill"; readonly data: PrefillData }
  | { readonly type: "data-report"; readonly data: ReportData }
  | { readonly type: "data-error"; readonly data: ErrorData }
  | { readonly type: "text"; readonly text: string };

// ---------------------------------------------------------------------------
// The incoming user message
// ---------------------------------------------------------------------------

const textPart = z.object({
  type: z.literal("text"),
  text: z.string(),
});

/** An approval tap, in the AI SDK `tool-approval-response` shape. */
const approvalPart = z.object({
  type: z.literal("tool-approval-response"),
  approvalId: z.string().min(1).max(200),
  approved: z.boolean(),
  reason: z.string().max(500).optional(),
});

const userPart = z.discriminatedUnion("type", [
  textPart,
  z.object({ type: z.literal("data-answer"), data: answerData }),
  z.object({
    type: z.literal("data-prefill-response"),
    data: prefillResponseData,
  }),
  z.object({ type: z.literal("data-retry"), data: retryData }),
  approvalPart,
]);

export const userMessageSchema = z.object({
  id: z.uuid(),
  role: z.literal("user"),
  parts: z.array(userPart).min(1).max(20).readonly(),
});

export type UserMessage = z.infer<typeof userMessageSchema>;
export type ApprovalResponse = z.infer<typeof approvalPart>;

/** What a user message asks for, which picks the path through `handleTurn` (AC-1). */
export type TurnKind =
  | { readonly kind: "answer"; readonly data: AnswerData }
  | { readonly kind: "prefill_response"; readonly data: PrefillResponseData }
  | { readonly kind: "retry"; readonly data: RetryData }
  | {
      readonly kind: "approval";
      readonly responses: readonly ApprovalResponse[];
    }
  | { readonly kind: "text"; readonly text: string };

export type InvalidMessage = { readonly code: "invalid_message" };

/**
 * Validates the incoming message and picks its path. A message whose only part is a
 * card part is deterministic; one carrying only approval responses resumes the pending
 * tool call; anything with typed text is an AI turn. Card parts mixed with other parts
 * are refused (cards send exactly one part).
 */
export const classifyMessage = (
  message: unknown,
): Result<{ message: UserMessage; turn: TurnKind }, InvalidMessage> => {
  const parsed = userMessageSchema.safeParse(message);
  if (!parsed.success) return err({ code: "invalid_message" });
  const { parts } = parsed.data;
  const only = parts.length === 1 ? parts[0] : undefined;
  const done = (turn: TurnKind) => ok({ message: parsed.data, turn });

  if (only?.type === "data-answer")
    return done({ kind: "answer", data: only.data });
  if (only?.type === "data-prefill-response")
    return done({ kind: "prefill_response", data: only.data });
  if (only?.type === "data-retry")
    return done({ kind: "retry", data: only.data });

  const approvals = parts.filter(
    (p): p is ApprovalResponse => p.type === "tool-approval-response",
  );
  if (approvals.length === parts.length)
    return done({ kind: "approval", responses: approvals });

  if (parts.some((p) => p.type.startsWith("data-")))
    return err({ code: "invalid_message" });
  const text = parts
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n")
    .trim();
  if (text.length === 0) return err({ code: "invalid_message" });
  return done({ kind: "text", text });
};

// ---------------------------------------------------------------------------
// History for the model
// ---------------------------------------------------------------------------

/** A saved message as the converter needs it (a `message` row's role and parts). */
export type SavedMessage = {
  readonly id: string;
  readonly role: "system" | "user" | "assistant";
  readonly parts: unknown;
};

type LoosePart = { readonly type: string } & Record<string, unknown>;

const looseParts = (parts: unknown): readonly LoosePart[] =>
  Array.isArray(parts)
    ? parts.filter(
        (p): p is LoosePart =>
          typeof p === "object" &&
          p !== null &&
          typeof (p as { type?: unknown }).type === "string",
      )
    : [];

const viewKey = (runId: string, questionId: string) => `${runId}:${questionId}`;

/** Every card the history showed, by run and question, so answers can be labelled. */
const shownViews = (
  messages: readonly SavedMessage[],
): ReadonlyMap<string, QuestionView> =>
  new Map(
    messages.flatMap((m) =>
      looseParts(m.parts).flatMap((p) => {
        if (p.type !== "data-question") return [];
        const data = questionData.safeParse(p.data);
        return data.success
          ? [[viewKey(data.data.runId, data.data.questionId), data.data.view]]
          : [];
      }),
    ),
  );

/** `Answered "Who is your customer?": small shop owners`, or null when unreadable. */
const answerText = (
  views: ReadonlyMap<string, QuestionView>,
  data: unknown,
): string | null => {
  const answer = answerData.safeParse(data);
  if (!answer.success) return null;
  const view = views.get(viewKey(answer.data.runId, answer.data.questionId));
  if (!view) return null;
  return `Answered "${view.prompt}": ${formatAnswer(view, answer.data.value)}`;
};

const cut = (text: string) =>
  text.length > MAX_TYPED_CHARS ? text.slice(0, MAX_TYPED_CHARS) : text;

/**
 * The client's typed text in these messages, oldest first, each cut to 4,000 characters
 * (known facts extraction, spec 0006 AC-5). Card answers and every other part are left
 * out. Pure.
 */
export const clientTexts = (
  messages: readonly SavedMessage[],
): readonly string[] =>
  messages
    .filter((m) => m.role === "user")
    .flatMap((m) => looseParts(m.parts))
    .flatMap((p) =>
      p.type === "text" && typeof p.text === "string" && p.text.trim() !== ""
        ? [cut(p.text)]
        : [],
    );

// ---------------------------------------------------------------------------
// Tool calls across messages (approvals)
// ---------------------------------------------------------------------------

const TERMINAL_STATES = new Set([
  "output-available",
  "output-error",
  "output-denied",
]);

type ToolPart = LoosePart & {
  readonly toolCallId: string;
  readonly state?: unknown;
  readonly approval?: unknown;
};

const isToolPart = (p: LoosePart): p is ToolPart =>
  p.type.startsWith("tool-") &&
  p.type !== "tool-approval-response" &&
  typeof p.toolCallId === "string";

const approvalIdOf = (p: ToolPart): string | null => {
  const approval = p.approval as { id?: unknown } | undefined;
  return typeof approval?.id === "string" ? approval.id : null;
};

/** Every approval tap in the history, by approval id (the latest tap wins). */
const approvalResponses = (
  messages: readonly SavedMessage[],
): ReadonlyMap<string, ApprovalResponse> =>
  new Map(
    messages
      .filter((m) => m.role === "user")
      .flatMap((m) => looseParts(m.parts))
      .flatMap((p) => {
        const parsed = approvalPart.safeParse(p);
        return parsed.success ? [[parsed.data.approvalId, parsed.data]] : [];
      }),
  );

/**
 * The history with each tool call in one place (spec 0006, "Approval mechanics"). An
 * approval tap arrives as its own user message and the tool's output is saved in a
 * later assistant message, so both are folded into the first part of that call: a tap
 * turns `approval-requested` into `approval-responded`, and a later terminal state
 * replaces the part. Later copies of the call and the tap parts are dropped, and a
 * message left with no parts disappears. Pure.
 */
export const foldToolCalls = (
  messages: readonly SavedMessage[],
): readonly SavedMessage[] => {
  const responses = approvalResponses(messages);
  const terminal = new Map(
    messages
      .flatMap((m) => looseParts(m.parts))
      .filter(isToolPart)
      .filter((p) => TERMINAL_STATES.has(String(p.state)))
      .map((p) => [p.toolCallId, p] as const),
  );
  const fold = (p: ToolPart): ToolPart => {
    const id = approvalIdOf(p);
    const response = id === null ? undefined : responses.get(id);
    const approval =
      p.approval === undefined
        ? undefined
        : {
            ...(p.approval as object),
            ...(response === undefined
              ? {}
              : {
                  approved: response.approved,
                  ...(response.reason === undefined
                    ? {}
                    : { reason: response.reason }),
                }),
          };
    const done = terminal.get(p.toolCallId);
    if (done)
      return {
        ...p,
        ...done,
        ...(approval === undefined && done.approval === undefined
          ? {}
          : { approval: { ...approval, ...(done.approval as object) } }),
      };
    if (p.state !== "approval-requested" || !response) return p;
    return { ...p, state: "approval-responded", approval };
  };

  // Walked in order, so the first part of each call is the one kept.
  const seen = new Set<string>();
  return messages.flatMap((m) => {
    if (!Array.isArray(m.parts)) return [m];
    const parts = looseParts(m.parts).flatMap((p): LoosePart[] => {
      if (p.type === "tool-approval-response") return [];
      if (!isToolPart(p)) return [p];
      if (seen.has(p.toolCallId)) return [];
      seen.add(p.toolCallId);
      return [fold(p)];
    });
    return parts.length === 0 ? [] : [{ ...m, parts }];
  });
};

/**
 * The approval taps in `responses` that answer a call still waiting for approval in
 * the history (unknown or already answered ids are left out).
 */
export const pendingApprovals = (
  messages: readonly SavedMessage[],
  responses: readonly ApprovalResponse[],
): readonly ApprovalResponse[] => {
  const waiting = new Set(
    messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => looseParts(m.parts))
      .filter(isToolPart)
      .flatMap((p) => {
        if (p.state !== "approval-requested") return [];
        const id = approvalIdOf(p);
        return id === null ? [] : [id];
      }),
  );
  const answered = new Set(
    messages
      .flatMap((m) => looseParts(m.parts))
      .filter(isToolPart)
      .filter((p) => TERMINAL_STATES.has(String(p.state)))
      .flatMap((p) => {
        const id = approvalIdOf(p);
        return id === null ? [] : [id];
      }),
  );
  return responses.filter(
    (r) => waiting.has(r.approvalId) && !answered.has(r.approvalId),
  );
};

/**
 * The tool calls the `responses` approve or decline, by tool call id, with their tool
 * name and input from the history. The continuation stream starts with the call's
 * output, so the turn writes the call's input first and the saved message stands on
 * its own (spec 0007 saves each turn's reply as a new message).
 */
export const respondedCalls = (
  messages: readonly SavedMessage[],
  responses: readonly ApprovalResponse[],
): ReadonlyMap<
  string,
  { readonly toolName: string; readonly input: unknown }
> => {
  const ids = new Set(responses.map((r) => r.approvalId));
  return new Map(
    messages
      .filter((m) => m.role === "assistant")
      .flatMap((m) => looseParts(m.parts))
      .filter(isToolPart)
      .flatMap((p) => {
        const id = approvalIdOf(p);
        return id !== null && ids.has(id)
          ? [
              [
                p.toolCallId,
                { toolName: p.type.slice("tool-".length), input: p.input },
              ] as const,
            ]
          : [];
      }),
  );
};

/**
 * The parts the model may see. Typed text (cut to 4,000 characters) and tool parts stay,
 * with approvals folded into their calls; a card answer becomes one short text line;
 * every other data part, and anything unknown, stays out of the model's view. Pure.
 */
export const toModelView = (
  saved: readonly SavedMessage[],
): readonly UIMessage[] => {
  const views = shownViews(saved);
  const messages = foldToolCalls(saved);
  return messages.flatMap((m): UIMessage[] => {
    if (m.role === "system") return [];
    const parts = looseParts(m.parts).flatMap((p): UIMessage["parts"] => {
      if (p.type === "text" && typeof p.text === "string")
        return [
          { type: "text", text: m.role === "user" ? cut(p.text) : p.text },
        ];
      if (p.type === "data-answer") {
        const text = answerText(views, p.data);
        return text === null ? [] : [{ type: "text", text }];
      }
      // Reasoning goes back with its tool call: Anthropic needs the thinking that led
      // to a tool call when the call continues after an approval.
      if (
        m.role === "assistant" &&
        (isToolPart(p) ||
          (p.type === "reasoning" && typeof p.text === "string"))
      )
        return [p as unknown as UIMessage["parts"][number]];
      return [];
    });
    return parts.length === 0 ? [] : [{ id: m.id, role: m.role, parts }];
  });
};

/** The saved history as model messages (AC-13 history), with incomplete tool calls dropped. */
export const toModelMessages = (
  messages: readonly SavedMessage[],
): Promise<ModelMessage[]> =>
  convertToModelMessages([...toModelView(messages)], {
    ignoreIncompleteToolCalls: true,
  });
