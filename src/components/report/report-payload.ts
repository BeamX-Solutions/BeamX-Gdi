/**
 * The report status payload as the client reads it (spec 0005, AC-10). The response of
 * `/api/runs/[runId]/report` is a boundary, so the panel parses it with this schema
 * before drawing anything. A 409 body carries an extra `code`, which is stripped.
 */
import { z } from "zod";
import {
  reportErrorCopy,
  type ReportErrorViewKind,
} from "@/components/feedback/error-copy";
import type { ReportBlock } from "./types";

const verdict = z.enum(["good", "caution", "risk"]);

const reportBlockSchema: z.ZodType<ReportBlock> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("score_header"),
    title: z.string(),
    score: z.number(),
    max: z.number(),
    verdict,
    summary: z.string(),
  }),
  z.object({
    kind: z.literal("category_bars"),
    title: z.string(),
    items: z.array(
      z.object({
        label: z.string(),
        score: z.number(),
        max: z.number(),
        verdict: verdict.optional(),
      }),
    ),
  }),
  z.object({
    kind: z.literal("advice_list"),
    title: z.string(),
    items: z.array(
      z.object({
        title: z.string(),
        detail: z.string().optional(),
        priority: z.enum(["high", "medium", "low"]),
      }),
    ),
  }),
  z.object({
    kind: z.literal("text"),
    title: z.string(),
    paragraphs: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("bullets"),
    title: z.string(),
    items: z.array(z.string()),
  }),
  z.object({
    kind: z.literal("timeline"),
    title: z.string(),
    steps: z.array(z.object({ label: z.string(), items: z.array(z.string()) })),
  }),
  z.object({
    kind: z.literal("resources"),
    title: z.string(),
    items: z.array(
      z.object({
        title: z.string(),
        description: z.string(),
        url: z.string().nullable(),
      }),
    ),
  }),
]);

const errorViewKind = z.custom<ReportErrorViewKind>(
  (value) => typeof value === "string" && Object.hasOwn(reportErrorCopy, value),
);

export const reportPayloadSchema = z.object({
  status: z.enum(["pending", "generating", "ready", "failed"]),
  phases: z.array(z.object({ label: z.string(), done: z.boolean() })),
  error: z
    .object({ kind: errorViewKind, title: z.string(), message: z.string() })
    .nullable(),
  canRetry: z.boolean(),
  stale: z.boolean(),
  view: z.array(reportBlockSchema).optional(),
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
