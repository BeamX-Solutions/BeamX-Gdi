/**
 * Beacon v1's stored advisory shape (spec 0010), frozen (spec 0011). v1 kept a rule
 * based advisory inside its scores and a rewritten one in its report; v2 dropped both.
 * Only the read side remains, so reports made with v1 still open.
 */
import { z } from "zod";

/** Every text field's limit (a paragraph with a lead may have empty text). */
export const TEXT_MAX = 2000;

const text = z.string().min(1).max(TEXT_MAX);
const tight = z.literal(true).optional();

const lineSchema = z.object({ lead: text.optional(), text });

export type Line = z.infer<typeof lineSchema>;

export const partSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("paragraph"),
      tight,
      lead: text.optional(),
      text: z.string().max(TEXT_MAX),
    })
    .refine((p) => p.lead !== undefined || p.text.length > 0, {
      message: "A paragraph without a lead needs text.",
      path: ["text"],
    }),
  z.object({ kind: z.literal("note"), tight, text }),
  z.object({ kind: z.literal("label"), tight, text }),
  z.object({ kind: z.literal("subheading"), tight, text }),
  z.object({
    kind: z.literal("bullets"),
    tight,
    items: z.array(lineSchema).min(1),
  }),
  z.object({
    kind: z.literal("numbered"),
    tight,
    items: z.array(lineSchema).min(1),
  }),
  z.object({ kind: z.literal("rule"), tight }),
  z.object({
    kind: z.literal("link"),
    tight,
    text,
    url: z
      .string()
      .max(TEXT_MAX)
      .refine((u) => u.startsWith("https://"), "Links must be https."),
  }),
]);

export type Part = z.infer<typeof partSchema>;

const sectionSchema = z.object({
  heading: text,
  parts: z.array(partSchema).min(1).max(30),
});

export type Section = z.infer<typeof sectionSchema>;

export const advisorySchema = z.object({
  sections: z.array(sectionSchema).min(1).max(12),
});

export type Advisory = z.infer<typeof advisorySchema>;

/** The booking line v1 reports showed under their link. */
export const BOOKING_TEXT = "Book a free 30-minute strategy call";
