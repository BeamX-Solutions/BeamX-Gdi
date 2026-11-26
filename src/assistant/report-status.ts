/**
 * The report status payload (spec 0005, AC-10, AC-13). Pure: POST and GET both build
 * their body here, from the light `reports.status` row, the current tool module, and
 * (only when the report is ready and GET loaded the run) the parsed report view.
 */
import type { CreditSummary } from "@/billing/summary";
import {
  reportErrorCopy,
  type ReportErrorViewKind,
} from "@/components/feedback/error-copy";
import { MAX_ATTEMPTS } from "@/db/queries/report-limits";
import type { ReportStatus } from "@/db/queries/reports";
import { err, ok, type Result } from "@/lib/result";
import {
  toAnswers,
  type ReportBlock,
  type ToolModule,
  type ToolReader,
} from "@/tools/registry";

export type ReportStatusPayload = {
  readonly status: ReportStatus["status"];
  /** One step per phase of the current module; empty for an old version. */
  readonly phases: readonly {
    readonly label: string;
    readonly done: boolean;
  }[];
  readonly error: {
    readonly kind: ReportErrorViewKind;
    readonly title: string;
    readonly message: string;
  } | null;
  readonly canRetry: boolean;
  /** `generating` and not updated for `STALE_AFTER_MINUTES`. */
  readonly stale: boolean;
  /** The tool's report blocks, only when ready and readable. */
  readonly view?: readonly ReportBlock[];
  /**
   * Blocks to show while the report is not ready (spec 0011, AC-13): only for a current
   * module with `toPreview` whose stored scores parse.
   */
  readonly preview?: readonly ReportBlock[];
  /** The chip's credits on the status poll (spec 0007, AC-9); null with no account. */
  readonly summary?: CreditSummary | null;
};

export type StoredDataInvalid = { readonly code: "stored_data_invalid" };

/** The stored run parts a view needs (a narrow view of `runs.get`). */
export type RunForView = {
  readonly run: { readonly scores: unknown };
  readonly answers: readonly {
    readonly questionId: string;
    readonly value: unknown;
  }[];
  readonly report: { readonly content: unknown } | null;
};

const INVALID = err({ code: "stored_data_invalid" } as const);

/**
 * Parses a ready run with the reader for its version and draws its blocks (AC-13). Any
 * stored answer, score or content that fails its schema is `stored_data_invalid`.
 */
export const buildView = (
  reader: ToolReader,
  stored: RunForView,
): Result<readonly ReportBlock[], StoredDataInvalid> => {
  const answers = toAnswers(reader, stored.answers);
  const scores = reader.scoresSchema.safeParse(stored.run.scores);
  const content = reader.contentSchema.safeParse(stored.report?.content);
  if (!answers.ok || !scores.success || !content.success) return INVALID;
  try {
    return ok(
      reader.toView({
        scores: scores.data,
        content: content.data,
        answers: answers.value,
      }),
    );
  } catch {
    // toView is pure over parsed data; a throw means the data still did not fit.
    return INVALID;
  }
};

const withCopy = (kind: ReportErrorViewKind) => ({
  kind,
  ...reportErrorCopy[kind],
});

/** Which error the client sees, if any. Pure. */
const errorKind = (
  row: ReportStatus,
  versionCurrent: boolean,
  view: Result<readonly ReportBlock[], StoredDataInvalid> | undefined,
): ReportErrorViewKind | null => {
  if (row.status === "ready")
    return view && !view.ok ? "stored_data_invalid" : null;
  if (!versionCurrent) return "version_changed";
  if (row.status === "failed" && row.attempts >= MAX_ATTEMPTS)
    return "exhausted";
  if (row.status === "generating") return null;
  // Pending or failed with attempts left, but the hold is gone (a sweep released it):
  // a retry would be refused, so say the credits were returned.
  if (!row.hasHold) return "no_credit_hold";
  if (row.status === "failed") return row.error?.kind ?? "unknown";
  return null;
};

/**
 * The preview blocks while a report is not ready (spec 0011, AC-13). Scores that fail
 * the current schema, or a preview that throws, just leave it out.
 */
const previewOf = (
  row: ReportStatus,
  current: Pick<ToolModule, "scoresSchema" | "toPreview"> | null,
): { readonly preview?: readonly ReportBlock[] } => {
  if (row.status === "ready" || !current?.toPreview) return {};
  const scores = current.scoresSchema.safeParse(row.scores);
  if (!scores.success) return {};
  try {
    return { preview: current.toPreview(scores.data) };
  } catch {
    return {};
  }
};

/**
 * Builds the status payload (AC-10). `current` is the registry's module for the run's
 * tool, or null when the tool is gone. `view` is passed only when the report is ready
 * and the run was loaded (GET); POST leaves it out and the client reads it with GET.
 *
 * A retry is offered only when it would be accepted: attempts left, the hold still
 * active, and the version current, for a failed report or a stale one.
 */
export const buildStatus = (
  row: ReportStatus,
  current: Pick<
    ToolModule,
    "version" | "phases" | "scoresSchema" | "toPreview"
  > | null,
  view?: Result<readonly ReportBlock[], StoredDataInvalid>,
): ReportStatusPayload => {
  const versionCurrent =
    current !== null && current.version === row.toolVersion;
  const phases = versionCurrent
    ? current.phases.map((p) => ({
        label: p.label,
        done: row.phaseKeys.includes(p.key),
      }))
    : [];
  const kind = errorKind(row, versionCurrent, view);
  const retryable =
    (row.status === "failed" || row.stale) &&
    row.attempts < MAX_ATTEMPTS &&
    row.hasHold &&
    versionCurrent;
  return {
    status: row.status,
    phases,
    error: kind === null ? null : withCopy(kind),
    canRetry: retryable,
    stale: row.stale,
    ...(row.status === "ready" && view?.ok ? { view: view.value } : {}),
    ...previewOf(row, versionCurrent ? current : null),
  };
};
