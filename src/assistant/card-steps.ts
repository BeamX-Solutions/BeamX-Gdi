/**
 * Steps both turn paths share (spec 0006): running a write as the turn's owner, and
 * completing a run. The card path (`turn.ts`) and the AI turn (`ai-turn.ts`) call them
 * with their own dependencies.
 */
import type { CompleteError } from "@/db/queries/runs";
import type { Result } from "@/lib/result";
import {
  scoreRun,
  type RunFact,
  type StoredAnswer,
  type ToolModule,
} from "@/tools/registry";
import {
  afterSave,
  answersFromRows,
  CARD_REPLIES,
  questionPart,
} from "./card-flow";
import type { ServerPart } from "./parts";

export type NotFound = { readonly code: "not_found" };

/** The run fields the turn reads (a `tool_run` row satisfies it). */
export type TurnRun = {
  readonly id: string;
  readonly toolId: string;
  readonly toolVersion: string;
  readonly status: string;
};

export type LogFn = (
  event: string,
  fields: Readonly<Record<string, string | number | boolean | null>>,
) => void;

/** What the shared steps need. */
export type StepDeps = {
  readonly ownerOf: (
    conversationId: string,
  ) => Promise<Result<string, NotFound>>;
  readonly getRun: (
    ownerId: string,
    runId: string,
  ) => Promise<
    Result<
      { readonly run: TurnRun; readonly answers: readonly StoredAnswer[] },
      NotFound
    >
  >;
  readonly complete: (
    ownerId: string,
    runId: string,
    scores: unknown,
    answerCount: number,
    lastAnswerAt: string | null,
    /** The run's profile facts, written in the completion batch (spec 0012). */
    facts?: readonly RunFact[],
  ) => Promise<Result<unknown, CompleteError>>;
  readonly log: LogFn;
};

// ---------------------------------------------------------------------------
// Owner retry
// ---------------------------------------------------------------------------

const RETRY_CODES = new Set(["not_found", "not_found_or_not_in_progress"]);

export type Owner = { readonly current: string };

/**
 * Runs a write as the owner resolved at turn start. If it comes back `not_found`, the
 * owner is read again; if a guest link moved the chat, the write is retried once as the
 * new owner (spec 0006, "Owner").
 */
export const asOwner = async <T, E extends { readonly code: string }>(
  deps: Pick<StepDeps, "ownerOf">,
  conversationId: string,
  owner: Owner,
  write: (ownerId: string) => Promise<Result<T, E>>,
): Promise<{ readonly owner: Owner; readonly result: Result<T, E> }> => {
  const first = await write(owner.current);
  if (first.ok || !RETRY_CODES.has(first.error.code))
    return { owner, result: first };
  const reread = await deps.ownerOf(conversationId);
  if (!reread.ok || reread.value === owner.current)
    return { owner, result: first };
  const moved: Owner = { current: reread.value };
  return { owner: moved, result: await write(moved.current) };
};

// ---------------------------------------------------------------------------
// Completion
// ---------------------------------------------------------------------------

const COMPLETE_RETRY = (runId: string): ServerPart => ({
  type: "data-error",
  data: { kind: "complete_retry", retry: true, runId },
});

/**
 * Completion (AC-7): score from the stored answers and complete, once more on
 * `answers_changed`, then the view report card. A second failure shows the
 * `complete_retry` card, whose button sends `data-retry`.
 */
export const completeRun = async (
  deps: StepDeps,
  conversationId: string,
  owner: Owner,
  live: { readonly run: TurnRun; readonly tool: ToolModule },
  attemptsLeft = 2,
): Promise<readonly ServerPart[]> => {
  const runId = live.run.id;
  const read = await deps.getRun(owner.current, runId);
  if (!read.ok) return [{ type: "text", text: CARD_REPLIES.noActiveRun }];

  const report: ServerPart = {
    type: "data-report",
    data: { runId, toolId: live.tool.id, toolName: live.tool.name },
  };
  if (read.value.run.status === "completed") return [report];

  const scored = scoreRun(live.tool, read.value.answers);
  if (!scored.ok) {
    // A missing answer (another tab hid or cleared one): ask it instead.
    if (scored.error.code === "incomplete") {
      const answers = answersFromRows(live.tool, read.value.answers);
      const next = afterSave(live.tool, answers);
      if (next.kind === "card")
        return [questionPart(live.tool, runId, answers, next.question)];
    }
    deps.log("assistant_complete_failed", { runId, reason: scored.error.code });
    return [COMPLETE_RETRY(runId)];
  }

  const { result } = await asOwner(deps, conversationId, owner, (id) =>
    deps.complete(
      id,
      runId,
      scored.value.scores,
      scored.value.answerCount,
      scored.value.lastAnswerAt,
      scored.value.facts,
    ),
  );
  if (result.ok) return [report];
  switch (result.error.code) {
    case "answers_changed":
      return attemptsLeft > 1
        ? completeRun(deps, conversationId, owner, live, attemptsLeft - 1)
        : [COMPLETE_RETRY(runId)];
    case "not_found":
    case "not_in_progress":
      return [{ type: "text", text: CARD_REPLIES.noActiveRun }];
    default: {
      const unreachable: never = result.error;
      return unreachable;
    }
  }
};
