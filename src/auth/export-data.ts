/**
 * "Download my data" (spec 0017, AC-7): any session, guest or account, gets everything
 * BeamX holds about it as one JSON file, at most 3 times an hour. Deps come in as
 * arguments so the rules have unit tests; the route wires the real ones. Logs ids and
 * counts only, never the content.
 */
import type { ExportRows } from "@/db/queries/export";
import {
  exportFileName,
  toExport,
  type DataExport,
} from "@/db/queries/export-shape";
import { limitKeys } from "@/lib/limits";
import type { logEvent } from "@/lib/log";

export const EXPORTS_PER_HOUR = 3;

/** The UTC hour bucket, `2026-11-28T14`. Pure. */
export const exportHour = (now: Date): string => now.toISOString().slice(0, 13);

export type ExportDeps = {
  /** Adds one to the hour's counter: the new count, or null when Redis failed. */
  readonly take: (key: string) => Promise<number | null>;
  readonly giveBack: (key: string) => Promise<void>;
  readonly read: (userId: string) => Promise<ExportRows>;
  readonly now: () => Date;
  readonly log: typeof logEvent;
};

export type ExportReply =
  | {
      readonly kind: "file";
      readonly fileName: string;
      readonly data: DataExport;
    }
  | {
      readonly kind: "error";
      readonly status: 401 | 429;
      readonly code: "unauthenticated" | "rate_limited";
    };

export const exportData = async (
  deps: ExportDeps,
  userId: string | null,
): Promise<ExportReply> => {
  if (userId === null)
    return { kind: "error", status: 401, code: "unauthenticated" };
  const now = deps.now();
  const key = limitKeys.dataExport(userId, exportHour(now));
  const count = await deps.take(key);
  // A failed counter lets the export through, like every other guard.
  if (count !== null && count > EXPORTS_PER_HOUR) {
    await deps.giveBack(key);
    deps.log("data_export_limited", { userId });
    return { kind: "error", status: 429, code: "rate_limited" };
  }
  try {
    const data = toExport(await deps.read(userId), now);
    deps.log("data_exported", {
      userId,
      conversations: data.conversations.length,
      runs: data.runs.length,
    });
    return {
      kind: "file",
      fileName: exportFileName(data.exportedAt.slice(0, 10)),
      data,
    };
  } catch (e) {
    // A failed read is not a used export.
    if (count !== null) await deps.giveBack(key);
    throw e;
  }
};
