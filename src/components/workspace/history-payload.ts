/**
 * The `/api/chats` response as the rail reads it (feature #14). The response is a
 * boundary, so the rail parses it before drawing. Pure.
 */
import { z } from "zod";

export const historyPayloadSchema = z.object({
  items: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      href: z.string(),
      reports: z.string().nullable(),
    }),
  ),
  nextCursor: z.string().nullable(),
});

export type HistoryPayload = z.infer<typeof historyPayloadSchema>;

/** A first page replaces the list; a next page appends, skipping ids already shown. */
export const mergeHistory = (
  current: HistoryPayload["items"],
  page: HistoryPayload["items"],
  append: boolean,
): HistoryPayload["items"] => {
  if (!append) return page;
  const seen = new Set(current.map((i) => i.id));
  return [...current, ...page.filter((i) => !seen.has(i.id))];
};
