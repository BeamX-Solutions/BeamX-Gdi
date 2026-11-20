/**
 * What the assistant's AI tools share within one turn (spec 0006, "Tools"): the
 * dependencies, the owner resolved at turn start (moved once if a guest link lands
 * mid turn), and a record of what the tools did, which the turn reads after the stream
 * to pick the card it appends (AC-8).
 */
import type { HoldError } from "@/db/queries/credits";
import type { Result } from "@/lib/result";
import type { ToolModule, UnknownTool } from "@/tools/registry";
import type { LogFn, StepDeps } from "../card-steps";
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
    source: "client" | "chat",
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
  readonly log: LogFn;
};

/** What a tool did this turn, read after the stream (spec 0006, "AI turn"). */
export type ToolEvent =
  | {
      readonly kind: "started";
      readonly runId: string;
      readonly toolId: string;
    }
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
    };

/** The turn's owner. A write that meets a guest link moves it (spec 0006, "Owner"). */
export type OwnerBox = { current: string };

export type ToolEnv = {
  readonly deps: AssistantToolDeps;
  readonly conversationId: string;
  readonly owner: OwnerBox;
  readonly record: (event: ToolEvent) => void;
};
