/**
 * The report status payload as the client reads it (spec 0005, AC-10). The response of
 * `/api/runs/[runId]/report` is a boundary, so the panel parses it with this schema
 * before drawing anything. A 409 body carries an extra `code`, which is stripped.
 */
import { z } from "zod";
import { creditSummarySchema } from "@/billing/summary";
import {
  reportErrorCopy,
  type ReportErrorViewKind,
} from "@/components/feedback/error-copy";
import type { ReportBlock, RichPart } from "./types";

const verdict = z.enum(["good", "caution", "risk"]);

const tight = z.literal(true).optional();
const richLine = z.object({ lead: z.string().optional(), text: z.string() });

/** A rich section part (spec 0010): plain text fields only. */
const richPartSchema: z.ZodType<RichPart> = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("paragraph"),
    tight,
    lead: z.string().optional(),
    text: z.string(),
  }),
  z.object({ kind: z.literal("note"), tight, text: z.string() }),
  z.object({ kind: z.literal("label"), tight, text: z.string() }),
  z.object({ kind: z.literal("subheading"), tight, text: z.string() }),
  z.object({ kind: z.literal("bullets"), tight, items: z.array(richLine) }),
  z.object({ kind: z.literal("numbered"), tight, items: z.array(richLine) }),
  z.object({ kind: z.literal("rule"), tight }),
]);

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
    kind: z.literal("rich_section"),
    title: z.string(),
    parts: z.array(richPartSchema),
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
  status: z.enum(["pending", "generating", "ready", "failed", "partial"]),
  phases: z.array(z.object({ label: z.string(), done: z.boolean() })),
  error: z
    .object({ kind: errorViewKind, title: z.string(), message: z.string() })
    .nullable(),
  canRetry: z.boolean(),
  stale: z.boolean(),
  view: z.array(reportBlockSchema).optional(),
  /** Blocks shown while the report is not ready yet (spec 0011). */
  preview: z.array(reportBlockSchema).optional(),
  /** The header chip's credits, on the GET (spec 0007, AC-9); null with no account. */
  summary: creditSummarySchema.nullable().optional(),
});

export type ReportPayload = z.infer<typeof reportPayloadSchema>;
