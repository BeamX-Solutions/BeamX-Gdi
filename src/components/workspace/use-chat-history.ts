"use client";

import { useCallback, useEffect, useState } from "react";
import {
  historyPayloadSchema,
  mergeHistory,
  type HistoryPayload,
} from "./history-payload";

const load = async (
  cursor: string | null,
  signal?: AbortSignal,
): Promise<HistoryPayload | null> => {
  try {
    const url =
      cursor === null
        ? "/api/chats"
        : `/api/chats?cursor=${encodeURIComponent(cursor)}`;
    const response = await fetch(url, { cache: "no-store", signal });
    if (!response.ok) return null;
    const parsed = historyPayloadSchema.safeParse(await response.json());
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
};

/**
 * The history rail's chats (feature #14). Reads the first page on mount and again each
 * time `refreshKey` changes (a finished turn: a new chat or a new report); `loadMore`
 * appends the next page. A failed read keeps what is shown.
 */
export function useChatHistory(refreshKey: string) {
  const [items, setItems] = useState<HistoryPayload["items"]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void load(null, controller.signal).then((page) => {
      if (controller.signal.aborted) return;
      setLoaded(true);
      if (page === null) return;
      setItems((current) => mergeHistory(current, page.items, false));
      setNextCursor(page.nextCursor);
    });
    return () => controller.abort();
  }, [refreshKey]);

  const loadMore = useCallback(async () => {
    if (nextCursor === null) return;
    const page = await load(nextCursor);
    if (page === null) return;
    setItems((current) => mergeHistory(current, page.items, true));
    setNextCursor(page.nextCursor);
  }, [nextCursor]);

  return { items, loaded, hasMore: nextCursor !== null, loadMore } as const;
}
