/**
 * The Zod schemas of the custom chat message parts (spec 0006, "Message parts"), with
 * nothing heavier than Zod and types, so the chat client can parse parts too. The server
 * side helpers (history conversion, approvals) live in `parts.ts`, which re-exports
 * these.
 */
import { z } from "zod";
import type { QuestionProgress, QuestionView } from "@/tools/_contract";

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
  // Chat limit notices (spec 0007, AC-8): shown, never saved.
  "limit_text",
  "limit_run",
  // The daily AI spend cap for guests (spec 0008, AC-2): a notice at chat (never
  // saved), or a card after a refused Approve (saved with the reply).
  "spend_cap",
  // Abuse limits (spec 0008): burst, daily chat and new chats are notices (never
  // saved); the daily runs card follows a refused Approve (saved with the reply).
  "slow_down",
  "chat_daily",
  "chats_daily",
  "runs_daily",
  // A resent message that already has a saved reply: the client reloads the thread.
  "answered",
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
