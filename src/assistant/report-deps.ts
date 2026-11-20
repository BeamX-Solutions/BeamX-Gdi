/**
 * Server only. The real dependencies of the report runner: the query layer, the
 * registry, the spend cap hook, the model provider, and the logger.
 */
import * as reports from "@/db/queries/reports";
import * as runs from "@/db/queries/runs";
import * as usage from "@/db/queries/usage";
import { logEvent } from "@/lib/log";
import { checkSpendCap } from "@/lib/spend-cap";
import { getTool } from "@/tools/registry";
import { resolveModel } from "./model-provider";
import type { RunnerDeps } from "./report-runner";

export const reportDeps: RunnerDeps = {
  getTool,
  ownerOf: runs.ownerOf,
  getRun: runs.get,
  reportStatus: reports.status,
  savePhase: reports.savePhase,
  markReady: reports.markReady,
  markFailed: reports.markFailed,
  recordUsage: usage.record,
  checkSpendCap,
  model: resolveModel,
  now: () => Date.now(),
  log: logEvent,
};
