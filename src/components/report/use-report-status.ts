"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { reportPayloadSchema } from "./report-payload";
import {
  asRetrying,
  pollDelayMs,
  shouldPoll,
  type FetchState,
} from "./report-panel-state";

const reportUrl = (runId: string) =>
  `/api/runs/${encodeURIComponent(runId)}/report`;

/** One request to the report route, turned into a `FetchState`. Never throws. */
const request = async (
  runId: string,
  method: "GET" | "POST",
  signal?: AbortSignal,
): Promise<FetchState> => {
  try {
    const response = await fetch(reportUrl(runId), {
      method,
      signal,
      cache: "no-store",
    });
    // 409 carries the status payload too (version changed, attempts exhausted, no hold).
    if (!response.ok && response.status !== 409) return { kind: "unavailable" };
    const parsed = reportPayloadSchema.safeParse(await response.json());
    return parsed.success
      ? { kind: "loaded", payload: parsed.data }
      : { kind: "unavailable" };
  } catch {
    return { kind: "offline" };
  }
};

/**
 * Polls a run's report status (spec 0005, AC-11): every 2s, then every 5s after 30s,
 * stopping once the report is ready, failed, or stale. `retry` POSTs the report again
 * and restarts the poll at the fast pace. A null `runId` polls nothing.
 *
 * A `pending` report has never been claimed, so the first poll that sees one POSTs it
 * once (spec 0007: the view report card starts the report). The claim is idempotent
 * (spec 0005), so a remount that POSTs again is harmless.
 */
export function useReportStatus(runId: string | null) {
  const [state, setState] = useState<FetchState>({ kind: "loading" });
  const [cycle, setCycle] = useState(0);
  const [tracked, setTracked] = useState(runId);
  // A new run starts from the loading state, never the last run's report.
  if (tracked !== runId) {
    setTracked(runId);
    setState({ kind: "loading" });
  }
  // Runs this mount already POSTed, so a pending poll claims each one once.
  const claimed = useRef(new Set<string>());

  useEffect(() => {
    if (runId === null) return;
    const controller = new AbortController();
    const startedAt = Date.now();
    const timers: ReturnType<typeof setTimeout>[] = [];

    const poll = async (): Promise<void> => {
      const next = await request(runId, "GET", controller.signal);
      if (controller.signal.aborted) return;
      setState(next);
      if (next.kind !== "loaded") return;
      if (next.payload.status === "pending" && !claimed.current.has(runId)) {
        claimed.current.add(runId);
        await request(runId, "POST", controller.signal);
        if (!controller.signal.aborted) void poll();
        return;
      }
      if (shouldPoll(next.payload)) {
        timers.push(
          setTimeout(() => void poll(), pollDelayMs(Date.now() - startedAt)),
        );
      }
    };

    void poll();
    return () => {
      controller.abort();
      timers.forEach(clearTimeout);
    };
  }, [runId, cycle]);

  const retry = useCallback(async () => {
    if (runId === null) return;
    setState(asRetrying);
    // The POST result is not needed: the restarted poll reads the new status, and an
    // offline POST shows up there as an offline poll.
    await request(runId, "POST");
    setCycle((c) => c + 1);
  }, [runId]);

  return { state, retry } as const;
}
