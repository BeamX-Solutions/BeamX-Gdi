/**
 * The report runner (spec 0005). The one place report AI calls happen: it runs a tool's
 * phases in order, saves each output, repairs one bad output per phase, records usage,
 * checks the spend cap, and marks the report ready (which charges the hold) or failed.
 *
 * Every side effect comes in through `deps`, so tests pass the AI SDK mock model and
 * in memory queries. Runs inside `after()`, so it never throws: any crash becomes a
 * failed attempt with kind `unknown`, and a report never stays `generating` because of it.
 */
import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  type LanguageModel,
  type LanguageModelUsage,
} from "ai";
import type {
  ReadyError,
  ReportError,
  ReportStatus,
  StatusError,
  WriteError,
} from "@/db/queries/reports";
import type { RunOwner } from "@/db/queries/runs";
import type { UsageInput } from "@/db/queries/usage";
import { costUsd } from "@/lib/ai-cost";
import { err, ok, type Result } from "@/lib/result";
import type { SpendCapError } from "@/lib/spend-cap";
import {
  toAnswers,
  type Answers,
  type ModelRole,
  type PhaseClient,
  type PhaseContext,
  type ReportPhase,
  type ToolModule,
  type UnknownTool,
} from "@/tools/registry";

/** No phase may ask for more output than this, whatever it declares. */
export const MAX_OUTPUT_TOKENS_CEILING = 32_000;

export type ReportErrorKind = ReportError["kind"];

/** The parts of a stored run the runner reads (a narrow view of `runs.get`). */
export type RunForReport = {
  readonly run: {
    readonly toolId: string;
    readonly toolVersion: string;
    readonly scores: unknown;
  };
  readonly answers: readonly {
    readonly questionId: string;
    readonly value: unknown;
  }[];
  readonly report: { readonly content: unknown } | null;
};

export type RunnerDeps = {
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  /** The run owner at write time, with the first name prompts may use (spec 0010). */
  readonly ownerOf: (
    runId: string,
  ) => Promise<Result<RunOwner, { readonly code: "not_found" }>>;
  readonly getRun: (
    userId: string,
    runId: string,
  ) => Promise<Result<RunForReport, { readonly code: "not_found" }>>;
  readonly reportStatus: (
    userId: string,
    runId: string,
  ) => Promise<Result<Pick<ReportStatus, "status" | "attempts">, StatusError>>;
  readonly savePhase: (
    runId: string,
    attempt: number,
    key: string,
    output: unknown,
  ) => Promise<Result<void, WriteError>>;
  /** Ends the call between phases (spec 0013, AC-6). */
  readonly savePartial: (
    runId: string,
    attempt: number,
  ) => Promise<Result<void, WriteError>>;
  readonly markReady: (
    runId: string,
    attempt: number,
    content: unknown,
    model: string,
  ) => Promise<Result<unknown, ReadyError>>;
  readonly markFailed: (
    runId: string,
    attempt: number,
    error: ReportError,
  ) => Promise<Result<unknown, WriteError>>;
  readonly recordUsage: (input: UsageInput) => Promise<unknown>;
  readonly checkSpendCap: (
    userId: string,
  ) => Promise<Result<void, SpendCapError>>;
  readonly model: (role: ModelRole) => {
    readonly id: string;
    readonly model: LanguageModel;
    readonly providerOptions?: Readonly<
      Record<string, Readonly<Record<string, string>>>
    >;
  };
  /** Milliseconds, for timings in logs. */
  readonly now: () => number;
  readonly log: (
    event: string,
    fields: Readonly<Record<string, string | number | boolean | null>>,
  ) => void;
};

export type RunInput = { readonly runId: string; readonly attempt: number };

/** What happened, for logs and tests. The report row is the real record. */
export type RunOutcome =
  | { readonly outcome: "ready" }
  /** One phase saved and more to go, for a tool with `phasesPerCall: 1` (spec 0013). */
  | { readonly outcome: "partial"; readonly saved: string }
  | { readonly outcome: "failed"; readonly kind: ReportErrorKind }
  /** A newer attempt owns the report, or the run is gone: nothing more is written. */
  | { readonly outcome: "stopped"; readonly reason: string };

/** Fixed, safe messages (never prompts, answers or provider text). */
const MESSAGES: Readonly<Record<ReportErrorKind, string>> = {
  timeout: "A report step took too long.",
  provider_overloaded: "The AI service was busy.",
  invalid_output: "The AI answer did not have the right shape.",
  spend_cap: "The daily AI limit was reached.",
  no_credit_hold: "The credits for this run are no longer held.",
  unknown: "Report generation failed.",
};

const STOPPED = (reason: string): RunOutcome => ({
  outcome: "stopped",
  reason,
});

// ---------------------------------------------------------------------------
// Error mapping
// ---------------------------------------------------------------------------

const OVERLOADED_STATUS = new Set([429, 503, 529]);

const isTimeout = (e: unknown, depth = 0): boolean => {
  if (depth > 5 || !(e instanceof Error)) return false;
  if (e.name === "TimeoutError" || e.name === "AbortError") return true;
  return isTimeout(e.cause, depth + 1);
};

/** Provider errors to report kinds (spec 0005, AC-9). Pure. */
export const providerErrorKind = (e: unknown): ReportErrorKind => {
  if (RetryError.isInstance(e)) {
    return e.reason === "abort" ? "timeout" : providerErrorKind(e.lastError);
  }
  if (isTimeout(e)) return "timeout";
  if (APICallError.isInstance(e)) {
    return e.statusCode !== undefined && OVERLOADED_STATUS.has(e.statusCode)
      ? "provider_overloaded"
      : "unknown";
  }
  return "unknown";
};

type Issue = {
  readonly path?: readonly PropertyKey[];
  readonly message: string;
};

const findIssues = (e: unknown, depth = 0): readonly Issue[] | null => {
  if (depth > 5 || typeof e !== "object" || e === null) return null;
  if ("issues" in e && Array.isArray(e.issues)) return e.issues as Issue[];
  return "cause" in e ? findIssues(e.cause, depth + 1) : null;
};

/** The validation problems of a bad output, in short lines for the repair call. */
export const describeOutputError = (e: NoObjectGeneratedError): string => {
  const issues = findIssues(e);
  if (!issues || issues.length === 0)
    return "- The answer was not valid JSON matching the required schema.";
  return issues
    .slice(0, 20)
    .map((i) => {
      const path = (i.path ?? []).map(String).join(".");
      return `- ${path || "(root)"}: ${i.message}`;
    })
    .join("\n");
};

// ---------------------------------------------------------------------------
// One phase
// ---------------------------------------------------------------------------

type RunContext = {
  readonly deps: RunnerDeps;
  readonly owner: string;
  readonly runId: string;
  readonly attempt: number;
  readonly answers: Answers;
  readonly scores: unknown;
  readonly client: PhaseClient;
};

const toUsageInput = (
  ctx: RunContext,
  phase: ReportPhase,
  modelId: string,
  attemptTry: number,
  usage: LanguageModelUsage,
): UsageInput => {
  const tokens = {
    inputTokens: usage.inputTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    cacheReadTokens: usage.inputTokenDetails.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails.cacheWriteTokens ?? 0,
  };
  const cost = costUsd(modelId, tokens);
  if (!cost.ok) ctx.deps.log("ai_cost_unknown_model", { model: modelId });
  return {
    callKey: `report:${ctx.runId}:${ctx.attempt}:${phase.key}:${attemptTry}`,
    userId: ctx.owner,
    runId: ctx.runId,
    purpose: "report",
    model: modelId,
    ...tokens,
    costUsd: cost.ok ? cost.value : "0",
  };
};

const repairPrompt = (prompt: string, problems: string): string =>
  [
    prompt,
    "",
    "Your previous answer did not match the required format. Problems found:",
    problems,
    "Return the complete answer again, matching the schema exactly.",
  ].join("\n");

/** Problems from a phase check, in the same short lines as schema problems. */
const describeCheckIssues = (issues: readonly string[]): string =>
  issues
    .slice(0, 20)
    .map((issue) => `- ${issue}`)
    .join("\n");

/**
 * Runs one phase: a call, and one repair call if the output fails its schema or its
 * `check` (spec 0010, AC-8). A second failure ends the attempt as `invalid_output`.
 */
const runPhase = async (
  ctx: RunContext,
  phase: ReportPhase,
  earlier: Readonly<Record<string, unknown>>,
): Promise<Result<unknown, ReportErrorKind>> => {
  const phaseCtx: PhaseContext = {
    answers: ctx.answers,
    scores: ctx.scores,
    earlier,
    client: ctx.client,
  };
  const { instructions, prompt } = phase.buildPrompt(phaseCtx);
  const resolved = ctx.deps.model(phase.modelRole);
  const maxOutputTokens = Math.min(
    phase.maxOutputTokens,
    MAX_OUTPUT_TOKENS_CEILING,
  );
  let problems: string | null = null;

  for (const attemptTry of [1, 2] as const) {
    try {
      const result = await generateText({
        model: resolved.model,
        instructions,
        prompt: problems === null ? prompt : repairPrompt(prompt, problems),
        output: Output.object({ schema: phase.output }),
        maxOutputTokens,
        abortSignal: AbortSignal.timeout(phase.timeoutMs),
        ...(resolved.providerOptions
          ? { providerOptions: resolved.providerOptions }
          : {}),
      });
      await ctx.deps.recordUsage(
        toUsageInput(ctx, phase, resolved.id, attemptTry, result.usage),
      );
      const issues = phase.check?.(result.output, phaseCtx) ?? [];
      if (issues.length === 0) return ok(result.output);
      if (attemptTry === 2) return err("invalid_output");
      problems = describeCheckIssues(issues);
      ctx.deps.log("report_phase_repair", {
        runId: ctx.runId,
        attempt: ctx.attempt,
        phaseKey: phase.key,
        reason: "check",
      });
    } catch (e) {
      if (!NoObjectGeneratedError.isInstance(e))
        return err(providerErrorKind(e));
      if (e.usage)
        await ctx.deps.recordUsage(
          toUsageInput(ctx, phase, resolved.id, attemptTry, e.usage),
        );
      if (attemptTry === 2) return err("invalid_output");
      problems = describeOutputError(e);
      ctx.deps.log("report_phase_repair", {
        runId: ctx.runId,
        attempt: ctx.attempt,
        phaseKey: phase.key,
        reason: "schema",
      });
    }
  }
  return err("invalid_output");
};

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

const isRecord = (v: unknown): v is Readonly<Record<string, unknown>> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const fail = async (
  deps: RunnerDeps,
  { runId, attempt }: RunInput,
  kind: ReportErrorKind,
): Promise<RunOutcome> => {
  const written = await deps.markFailed(runId, attempt, {
    kind,
    message: MESSAGES[kind],
  });
  if (!written.ok) return STOPPED("stale_attempt");
  deps.log("report_failed", { runId, attempt, kind });
  return { outcome: "failed", kind };
};

/** The attempt still owns the report: `generating` with this attempt number. */
const stillCurrent = async (
  deps: RunnerDeps,
  owner: string,
  { runId, attempt }: RunInput,
): Promise<boolean> => {
  const current = await deps.reportStatus(owner, runId);
  return (
    current.ok &&
    current.value.status === "generating" &&
    current.value.attempts === attempt
  );
};

const run = async (deps: RunnerDeps, input: RunInput): Promise<RunOutcome> => {
  const { runId, attempt } = input;

  // 1. Owner at write time (a guest may link an account mid run), then the run.
  const owner = await deps.ownerOf(runId);
  if (!owner.ok) return STOPPED("run_not_found");
  const { userId, firstName } = owner.value;
  const stored = await deps.getRun(userId, runId);
  if (!stored.ok) return STOPPED("run_not_found");
  const { run: storedRun, answers: rows, report } = stored.value;

  const tool = deps.getTool(storedRun.toolId);
  if (!tool.ok || tool.value.version !== storedRun.toolVersion) {
    // The route refused a non current version, so this is a race with a deploy.
    deps.log("report_version_mismatch", { runId, attempt });
    return fail(deps, input, "unknown");
  }
  const toolModule = tool.value;

  // 2. Visible answers and scores, parsed with the module's schemas.
  const answers = toAnswers(toolModule, rows);
  const scores = toolModule.scoresSchema.safeParse(storedRun.scores);
  if (!answers.ok || !scores.success) {
    deps.log("report_stored_data_invalid", { runId, attempt });
    return fail(deps, input, "unknown");
  }

  const ctx: RunContext = {
    deps,
    owner: userId,
    runId,
    attempt,
    answers: answers.value,
    scores: scores.data,
    client: { firstName },
  };
  const saved = isRecord(report?.content) ? report.content : {};
  const earlier: Record<string, unknown> = {};

  // 3 and 4. Each phase in order, skipping outputs already saved and still valid.
  for (const phase of toolModule.phases) {
    const existing = Object.hasOwn(saved, phase.key)
      ? phase.output.safeParse(saved[phase.key])
      : null;
    if (existing?.success) {
      earlier[phase.key] = existing.data;
      continue;
    }

    if (!(await stillCurrent(deps, userId, input)))
      return STOPPED("stale_attempt");
    const cap = await deps.checkSpendCap(userId);
    if (!cap.ok) return fail(deps, input, "spend_cap");

    const started = deps.now();
    const output = await runPhase(ctx, phase, earlier);
    if (!output.ok) return fail(deps, input, output.error);

    const written = await deps.savePhase(
      runId,
      attempt,
      phase.key,
      output.value,
    );
    if (!written.ok) return STOPPED("stale_attempt");
    earlier[phase.key] = output.value;
    deps.log("report_phase_done", {
      runId,
      attempt,
      phaseKey: phase.key,
      ms: deps.now() - started,
    });

    // One phase per call (spec 0013, AC-6): stop here while phases remain, so the next
    // call starts fresh inside its own 300 second budget.
    const remaining = toolModule.phases.some(
      (p) => !Object.hasOwn(earlier, p.key),
    );
    if (toolModule.phasesPerCall === 1 && remaining) {
      const paused = await deps.savePartial(runId, attempt);
      if (!paused.ok) return STOPPED("stale_attempt");
      deps.log("report_partial", { runId, attempt, phaseKey: phase.key });
      return { outcome: "partial", saved: phase.key };
    }
  }

  // 5. Merge, validate, and mark ready (which charges the hold once).
  const content = toolModule.contentSchema.safeParse(earlier);
  if (!content.success) return fail(deps, input, "invalid_output");
  const lastPhase = toolModule.phases.at(-1);
  const modelId = lastPhase ? deps.model(lastPhase.modelRole).id : "unknown";
  const ready = await deps.markReady(runId, attempt, content.data, modelId);
  if (!ready.ok) {
    if (ready.error.code === "no_credit_hold") {
      // Final: markReady already failed the report with this kind.
      deps.log("report_failed", { runId, attempt, kind: "no_credit_hold" });
      return { outcome: "failed", kind: "no_credit_hold" };
    }
    return STOPPED("stale_attempt");
  }
  deps.log("report_ready", { runId, attempt });
  return { outcome: "ready" };
};

/**
 * Runs the report for one claimed attempt (spec 0005, AC-8, AC-9, AC-12). Never
 * throws: an unexpected error marks the attempt failed with kind `unknown`.
 */
export const runReport = async (
  deps: RunnerDeps,
  input: RunInput,
): Promise<RunOutcome> => {
  try {
    return await run(deps, input);
  } catch (e) {
    deps.log("report_crashed", {
      runId: input.runId,
      attempt: input.attempt,
      error: e instanceof Error ? e.name : "unknown",
    });
    try {
      return await fail(deps, input, "unknown");
    } catch {
      return STOPPED("crashed");
    }
  }
};
