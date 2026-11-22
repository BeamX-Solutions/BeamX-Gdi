/**
 * What the assistant's AI tools share within one turn (spec 0006, "Tools"): the
 * dependencies, the owner resolved at turn start (moved once if a guest link lands
 * mid turn), and a record of what the tools did, which the turn reads after the stream
 * to pick the card it appends (AC-8).
 */
import type {
  HoldError,
  RunQuote,
  StartFromHoldError,
} from "@/db/queries/credits";
import type { AbandonError, ResumeError } from "@/db/queries/runs";
import type { CreditSummary } from "@/billing/summary";
import type { RunLimitError, RunTicket } from "@/lib/limits";
import type { Result } from "@/lib/result";
import type { SpendCapError } from "@/lib/spend-cap";
import type { ToolModule, UnknownTool } from "@/tools/registry";
import type { LogFn, NotFound, StepDeps } from "../card-steps";
import type { AnswerSource } from "../parts";
import type { ActiveRead } from "../turn";

export type AssistantToolDeps = Pick<StepDeps, "ownerOf"> & {
  /** Every registered tool, in registry order (the `startRun` enum and description). */
  readonly tools: readonly ToolModule[];
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  readonly getActive: (
    ownerId: string,
    conversationId: string,
  ) => Promise<ActiveRead>;
  readonly saveAnswer: (
    ownerId: string,
    runId: string,
    questionId: string,
    value: unknown,
    source: AnswerSource,
  ) => Promise<
    Result<unknown, { readonly code: "not_found_or_not_in_progress" }>
  >;
  /** `credits.ensureAccount` with the starter grant bound. */
  readonly ensureAccount: (ownerId: string) => Promise<unknown>;
  /** `credits.startRunWithHold`, reduced to what the tool reads. */
  readonly startRunWithHold: (
    ownerId: string,
    conversationId: string,
    toolId: string,
    toolVersion: string,
    price: number,
  ) => Promise<Result<{ readonly runId: string }, HoldError>>;
  /** `credits.getSummary` as the chip's numbers, or null with no account (spec 0007). */
  readonly getSummary: (ownerId: string) => Promise<CreditSummary | null>;
  /** `credits.runQuote`: a run and its active hold, read before a money card. */
  readonly runQuote: (
    ownerId: string,
    runId: string,
  ) => Promise<Result<RunQuote, NotFound>>;
  /** `runs.resume` for a run that still has an active hold (free). */
  readonly resumeRun: (
    ownerId: string,
    runId: string,
  ) => Promise<Result<{ readonly runId: string }, ResumeError>>;
  /** `credits.resumeRunWithHold` for a run whose hold was released. */
  readonly resumeRunWithHold: (
    ownerId: string,
    runId: string,
    price: number,
  ) => Promise<Result<{ readonly runId: string }, HoldError>>;
  /** `credits.startFromWithHold`: a new run prefilled from a completed one, plus its hold. */
  readonly startFromWithHold: (
    ownerId: string,
    previousRunId: string,
    toolVersion: string,
    price: number,
  ) => Promise<Result<{ readonly runId: string }, StartFromHoldError>>;
  /** `runs.abandon` (releases any hold in the same batch). */
  readonly abandonRun: (
    ownerId: string,
    runId: string,
  ) => Promise<Result<unknown, AbandonError>>;
  /** The guest guards at Approve (spec 0008, AC-2, AC-4). Each allows on a Redis error. */
  readonly limits: {
    readonly guestSpendCap: () => Promise<Result<void, SpendCapError>>;
    readonly takeRun: (
      userId: string,
      ip: string | null,
    ) => Promise<Result<RunTicket, RunLimitError>>;
    readonly giveBackRun: (ticket: RunTicket) => Promise<void>;
  };
  readonly log: LogFn;
};

/**
 * Where a started run's answers come from, which picks the card after the stream:
 * known facts from the chat (a new run), copies already saved (a restart), or the old
 * run's answers to offer on the prefill card (a restart after a version change, AC-5b).
 */
export type StartedFrom =
  | { readonly kind: "new" }
  | { readonly kind: "copy" }
  | { readonly kind: "offer"; readonly previousRunId: string };

/** What a tool did this turn, read after the stream (spec 0006, "AI turn"). */
export type ToolEvent =
  | {
      readonly kind: "started";
      readonly runId: string;
      readonly toolId: string;
      readonly from: StartedFrom;
    }
  | { readonly kind: "resumed"; readonly runId: string }
  | { readonly kind: "stopped"; readonly runId: string }
  | {
      readonly kind: "saved";
      readonly runId: string;
      readonly questionId: string;
      readonly complete: boolean;
    }
  | {
      readonly kind: "show";
      readonly runId: string;
      readonly questionId: string;
    }
  /** A guest's run was refused by a limit: the turn appends its card (spec 0008). */
  | { readonly kind: "refused"; readonly reason: "runs_daily" | "spend_cap" };

/** The turn's owner. A write that meets a guest link moves it (spec 0006, "Owner"). */
export type OwnerBox = { current: string };

export type ToolEnv = {
  readonly deps: AssistantToolDeps;
  readonly conversationId: string;
  readonly owner: OwnerBox;
  /** A guest (anonymous session), read once by the chat route (spec 0008). */
  readonly isGuest: boolean;
  /** The client IP for the IP run limit, or null when unknown. */
  readonly ip: string | null;
  readonly record: (event: ToolEvent) => void;
  /** What the tools did so far this turn, oldest first. */
  readonly recorded: () => readonly ToolEvent[];
};
