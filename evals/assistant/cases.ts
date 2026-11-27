/**
 * The eval case schema (spec 0006, AC-15). `cases.json` is checked against it before a
 * run, so a typo in a case fails loudly instead of grading the wrong thing.
 */
import { z } from "zod";

const answerValue = z.union([z.string(), z.number(), z.array(z.string())]);

/** A run the case starts with. Run refs in expectations (`@active`, …) point at these. */
const setup = z
  .strictObject({
    /** An in progress Stellar run with these answers saved. */
    active: z
      .strictObject({ answers: z.record(z.string(), answerValue) })
      .optional(),
    /** A paused Stellar run; `held` says whether it still holds its credits. */
    paused: z.strictObject({ held: z.boolean() }).optional(),
    /** A completed Stellar run whose report is ready. */
    completed: z.boolean().optional(),
  })
  .optional();

const base = {
  id: z.string().min(1),
  /** Tools that must be registered for the case to run; skipped otherwise. */
  requiresTools: z.array(z.string()).optional(),
};

const turnBase = { ...base, message: z.string().min(1), setup };

export const evalCase = z.discriminatedUnion("kind", [
  /** A message that clearly fits one tool: startRun for it, behind an approval card. */
  z.strictObject({
    ...turnBase,
    kind: z.literal("route"),
    tool: z.string(),
  }),
  /** Fits more than one tool: one clarifying question, or a proposal of an allowed tool. */
  z.strictObject({
    ...turnBase,
    kind: z.literal("ambiguous"),
    allowedTools: z.array(z.string()),
  }),
  /** Must be declined politely, with a pointer back (judged). */
  z.strictObject({ ...turnBase, kind: z.literal("off_topic") }),
  /** Must not be declined (judged). */
  z.strictObject({ ...turnBase, kind: z.literal("on_topic") }),
  /** Written in Pidgin: simple English with a light Pidgin touch (judged). */
  z.strictObject({ ...turnBase, kind: z.literal("pidgin") }),
  /** A typed reply to the open card: saveAnswer with an accepted value, or no save. */
  z.strictObject({
    ...turnBase,
    kind: z.literal("typed_answer"),
    save: z
      .strictObject({
        questionId: z.string(),
        /** Accepted values; absent means any text the client gave. */
        values: z.array(answerValue).optional(),
      })
      .nullable(),
  }),
  /** Stop, continue, change: the named tool, with these input fields. */
  z.strictObject({
    ...turnBase,
    kind: z.literal("control"),
    tool: z.enum([
      "stopRun",
      "resumeRun",
      "showQuestion",
      "restartRun",
      "offerConsultation",
    ]),
    input: z.record(z.string(), z.string()).optional(),
  }),
  /** The reply states no number (prices, scores and balances come from cards). */
  z.strictObject({ ...turnBase, kind: z.literal("grounding") }),
  /** Known facts extraction: exactly these answers, nothing invented. */
  z.strictObject({
    ...base,
    kind: z.literal("extraction"),
    tool: z.string(),
    texts: z.array(z.string().min(1)).min(1),
    expect: z.record(z.string(), answerValue),
  }),
]);

export type EvalCase = z.infer<typeof evalCase>;
export type EvalKind = EvalCase["kind"];
export type CaseSetup = z.infer<typeof setup>;

export const evalCases = z.array(evalCase).superRefine((cases, ctx) => {
  const seen = new Set<string>();
  for (const c of cases) {
    if (seen.has(c.id))
      ctx.addIssue({ code: "custom", message: `duplicate case id ${c.id}` });
    seen.add(c.id);
  }
});
