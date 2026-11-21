/**
 * Server only. The real dependencies of the report runner and the report routes: the
 * query layer, the registry, the spend cap hook, the model provider, and the logger.
 */
import { toCreditSummary } from "@/billing/summary";
import * as credits from "@/db/queries/credits";
import * as reports from "@/db/queries/reports";
import * as runs from "@/db/queries/runs";
import * as usage from "@/db/queries/usage";
import { logEvent } from "@/lib/log";
import { checkSpendCap } from "@/lib/spend-cap";
import { getReader, getTool } from "@/tools/registry";
import { resolveModel } from "./model-provider";
import type { ReportApiDeps } from "./report-api";
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

/** The real dependencies of the report routes. */
export const reportApiDeps: ReportApiDeps = {
  status: reports.status,
  claim: reports.claim,
  failStale: reports.failStale,
  getRun: runs.get,
  getTool,
  getReader,
  summary: async (userId) => toCreditSummary(await credits.getSummary(userId)),
  runner: reportDeps,
  log: logEvent,
};
