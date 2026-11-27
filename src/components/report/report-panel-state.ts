/**
 * What the report panel shows (spec 0005, AC-11), as pure functions over the status
 * payload. The panel never shows a blank area: every state maps to a skeleton, an error
 * card, or the report.
 */
import type { ErrorKind } from "@/components/feedback/error-card";
import {
  errorCopy,
  reportErrorCopy,
  type ReportErrorViewKind,
} from "@/components/feedback/error-copy";
import type { ReportPayload } from "./report-payload";
import type { ReportBlock, SkeletonStep } from "./types";

/** Poll every 2s at first, then every 5s once the report has taken 30s. */
export const POLL_FAST_MS = 2_000;
export const POLL_SLOW_MS = 5_000;
export const POLL_SLOW_AFTER_MS = 30_000;

/** The one action on a card with no retry; the caller decides what starting again means. */
export const START_AGAIN_LABEL = "Start again";

/** What the client knows about the report right now. */
export type FetchState =
  | { readonly kind: "loading" }
  | { readonly kind: "loaded"; readonly payload: ReportPayload }
  /** The request never reached the server. */
  | { readonly kind: "offline" }
  /** The server answered with something the panel cannot use (404, 500, bad body). */
  | { readonly kind: "unavailable" };

type CardCopy = {
  readonly cardKind: ErrorKind;
  readonly title: string;
  readonly message: string;
};

/** Blocks a tool shows above the skeleton or error card before it is ready (spec 0011). */
type WithPreview = { readonly preview?: readonly ReportBlock[] };

export type PanelView =
  | ({
      readonly kind: "generating";
      readonly steps: readonly SkeletonStep[];
    } & WithPreview)
  /** An error card with Retry. */
  | ({ readonly kind: "retry" } & CardCopy & WithPreview)
  /** An error card with no retry, only Start again. */
  | ({ readonly kind: "final" } & CardCopy & WithPreview)
  | { readonly kind: "ready"; readonly blocks: readonly ReportBlock[] };

export const pollDelayMs = (elapsedMs: number): number =>
  elapsedMs < POLL_SLOW_AFTER_MS ? POLL_FAST_MS : POLL_SLOW_MS;

/** Keep polling while the report is on its way. A stale report waits for a Retry. */
export const shouldPoll = (payload: ReportPayload): boolean =>
  (payload.status === "pending" ||
    payload.status === "generating" ||
    payload.status === "partial") &&
  !payload.stale;

/**
 * When the panel should POST the report (spec 0007; spec 0013, AC-8): once for a pending
 * report, and once for each new partial state (keyed by how many phases are done), so
 * the next phase starts within one poll. Null means no POST. Pure.
 */
export const claimKey = (
  runId: string,
  payload: ReportPayload,
): string | null => {
  if (payload.status === "pending") return `${runId}:pending`;
  if (payload.status === "partial")
    return `${runId}:partial:${payload.phases.filter((p) => p.done).length}`;
  return null;
};

/** Done phases are ticked, the first open one is in progress, the rest wait. */
export const skeletonSteps = (
  phases: ReportPayload["phases"],
): readonly SkeletonStep[] => {
  const active = phases.findIndex((p) => !p.done);
  return phases.map((p, index) => ({
    label: p.label,
    state: p.done ? "done" : index === active ? "active" : "pending",
  }));
};

/** The spend cap keeps its gauge icon; every other report failure is an AI error. */
export const errorCardKind = (kind: ReportErrorViewKind): ErrorKind =>
  kind === "spend_cap" ? "spend_cap" : "ai_error";

const reportCard = (kind: ReportErrorViewKind): CardCopy => ({
  cardKind: errorCardKind(kind),
  ...reportErrorCopy[kind],
});

const readyView = (payload: ReportPayload): PanelView =>
  payload.view
    ? { kind: "ready", blocks: payload.view }
    : {
        kind: "final",
        ...reportCard(payload.error?.kind ?? "stored_data_invalid"),
      };

const notReadyView = (
  payload: ReportPayload,
): Exclude<PanelView, { readonly kind: "ready" }> => {
  // A stale report always offers Retry: the POST either reclaims it or, on the last
  // attempt, fails it and returns the credits (AC-15).
  if (payload.stale) {
    const kind = payload.error?.kind ?? "timeout";
    return { kind: "retry", ...reportCard(kind) };
  }
  if (payload.error) {
    const card = {
      cardKind: errorCardKind(payload.error.kind),
      title: payload.error.title,
      message: payload.error.message,
    };
    return payload.canRetry
      ? { kind: "retry", ...card }
      : { kind: "final", ...card };
  }
  return { kind: "generating", steps: skeletonSteps(payload.phases) };
};

const payloadView = (payload: ReportPayload): PanelView => {
  if (payload.status === "ready") return readyView(payload);
  const view = notReadyView(payload);
  return payload.preview && payload.preview.length > 0
    ? { ...view, preview: payload.preview }
    : view;
};

export const panelView = (state: FetchState): PanelView => {
  switch (state.kind) {
    case "loading":
      return { kind: "generating", steps: [] };
    case "loaded":
      return payloadView(state.payload);
    case "offline":
      return {
        kind: "retry",
        cardKind: "network",
        title: errorCopy.network.title,
        message: errorCopy.network.message,
      };
    case "unavailable":
      return {
        kind: "retry",
        cardKind: "ai_error",
        title: errorCopy.ai_error.title,
        message: errorCopy.ai_error.message,
      };
    default: {
      const unreachable: never = state;
      return unreachable;
    }
  }
};

/** Shown the moment Retry is pressed, before the POST answers. */
export const asRetrying = (state: FetchState): FetchState =>
  state.kind === "loaded"
    ? {
        kind: "loaded",
        payload: {
          ...state.payload,
          status: "generating",
          error: null,
          canRetry: false,
          stale: false,
        },
      }
    : { kind: "loading" };
