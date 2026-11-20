/**
 * The report routes' logic (spec 0005, AC-7, AC-10, AC-13, AC-15), behind thin route
 * handlers in `src/app/api/runs/[runId]/report/route.ts`. The handler resolves the
 * session and passes `after()` in as `schedule`; everything else comes through `deps`,
 * so integration tests run it against a real branch with the mock model.
 *
 * Never throws for an expected case: every outcome is a status code and a JSON body.
 */
import type {
  ClaimError,
  ReportError,
  ReportStatus,
  StatusError,
} from "@/db/queries/reports";
import type { Result } from "@/lib/result";
import type {
  ToolModule,
  ToolReader,
  UnknownTool,
  UnsupportedVersion,
} from "@/tools/registry";
import { runReport, type RunnerDeps } from "./report-runner";
import {
  buildStatus,
  buildView,
  type ReportStatusPayload,
  type RunForView,
} from "./report-status";

export type ReportApiDeps = {
  readonly status: (
    userId: string,
    runId: string,
  ) => Promise<Result<ReportStatus, StatusError>>;
  readonly claim: (
    userId: string,
    runId: string,
  ) => Promise<Result<{ readonly attempts: number }, ClaimError>>;
  readonly failStale: (
    userId: string,
    runId: string,
  ) => Promise<{ readonly failed: boolean }>;
  readonly getRun: (
    userId: string,
    runId: string,
  ) => Promise<Result<RunForView, { readonly code: "not_found" }>>;
  readonly getTool: (id: string) => Result<ToolModule, UnknownTool>;
  readonly getReader: (
    id: string,
    version: string,
  ) => Result<ToolReader, UnknownTool | UnsupportedVersion>;
  readonly runner: RunnerDeps;
  readonly log: RunnerDeps["log"];
};

export type ConflictCode =
  "version_changed" | "attempts_exhausted" | "no_credit_hold";

export type ApiResponse =
  | { readonly status: 200 | 202; readonly body: ReportStatusPayload }
  | {
      readonly status: 409;
      readonly body: ReportStatusPayload & { readonly code: ConflictCode };
    }
  | { readonly status: 404; readonly body: { readonly code: "not_found" } };

export type ReportRequest = { readonly userId: string; readonly runId: string };

/** Runs work after the response is sent (`after()` in the route). */
export type Schedule = (task: () => Promise<unknown>) => void;

const NOT_FOUND: ApiResponse = { status: 404, body: { code: "not_found" } };

const STALE_TIMEOUT: ReportError = {
  kind: "timeout",
  message: "The last attempt stopped responding.",
};

const currentModule = (deps: ReportApiDeps, toolId: string) => {
  const tool = deps.getTool(toolId);
  return tool.ok ? tool.value : null;
};

const conflict = (
  code: ConflictCode,
  row: ReportStatus,
  current: ToolModule | null,
): ApiResponse => ({
  status: 409,
  body: { ...buildStatus(row, current), code },
});

/**
 * POST: start (or retry) the report (AC-7, AC-15). Two round trips at most on the
 * common path: the status read (404 and the version check), then the claim. Only a
 * successful claim schedules the runner, and the claim is a compare and set, so two
 * concurrent POSTs never make two sets of AI calls for one attempt.
 */
export const postReport = async (
  deps: ReportApiDeps,
  { userId, runId }: ReportRequest,
  schedule: Schedule,
): Promise<ApiResponse> => {
  const read = await deps.status(userId, runId);
  if (!read.ok) return NOT_FOUND;
  const row = read.value;
  const current = currentModule(deps, row.toolId);

  if (row.status === "ready")
    return { status: 200, body: buildStatus(row, current) };
  // A run started on an older version is never claimed: no attempt used, hold untouched.
  if (current === null || current.version !== row.toolVersion)
    return conflict("version_changed", row, current);

  const claimed = await deps.claim(userId, runId);
  if (claimed.ok) {
    const attempt = claimed.value.attempts;
    deps.log("report_claimed", { runId, attempt });
    schedule(() => runReport(deps.runner, { runId, attempt }));
    const generating: ReportStatus = {
      ...row,
      status: "generating",
      attempts: attempt,
      error: null,
      stale: false,
    };
    return { status: 202, body: buildStatus(generating, current) };
  }

  switch (claimed.error.code) {
    case "not_found":
      return NOT_FOUND;
    case "already_ready":
      return {
        status: 200,
        body: buildStatus({ ...row, status: "ready", error: null }, current),
      };
    case "already_generating":
      return { status: 202, body: buildStatus(row, current) };
    case "no_credit_hold":
      return conflict("no_credit_hold", row, current);
    case "attempts_exhausted": {
      if (row.status !== "generating")
        return conflict("attempts_exhausted", row, current);
      // The last attempt is still running: nothing to do but keep polling.
      if (!row.stale) return { status: 202, body: buildStatus(row, current) };
      // The last attempt went stale and can never be reclaimed: fail it and release
      // the hold in one statement, so the credits are never stuck.
      const stale = await deps.failStale(userId, runId);
      const failed: ReportStatus = stale.failed
        ? {
            ...row,
            status: "failed",
            error: STALE_TIMEOUT,
            hasHold: false,
            stale: false,
          }
        : row;
      return conflict("attempts_exhausted", failed, current);
    }
    default: {
      const unreachable: never = claimed.error;
      return unreachable;
    }
  }
};

/**
 * GET: the status poll (AC-10, AC-13). The light status row on every poll; the full
 * run only once the report is ready, read with the reader for its stored version.
 */
export const getReport = async (
  deps: ReportApiDeps,
  { userId, runId }: ReportRequest,
): Promise<ApiResponse> => {
  const read = await deps.status(userId, runId);
  if (!read.ok) return NOT_FOUND;
  const row = read.value;
  const current = currentModule(deps, row.toolId);
  if (row.status !== "ready")
    return { status: 200, body: buildStatus(row, current) };

  const reader = deps.getReader(row.toolId, row.toolVersion);
  if (!reader.ok) {
    deps.log("report_stored_data_invalid", {
      runId,
      reason: reader.error.code,
    });
    return {
      status: 200,
      body: buildStatus(row, current, {
        ok: false,
        error: { code: "stored_data_invalid" },
      }),
    };
  }
  const stored = await deps.getRun(userId, runId);
  if (!stored.ok) return NOT_FOUND;
  const view = buildView(reader.value, stored.value);
  if (!view.ok) deps.log("report_stored_data_invalid", { runId });
  return { status: 200, body: buildStatus(row, current, view) };
};
