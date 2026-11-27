/**
 * `offerConsultation` (spec 0016, AC-1, AC-2): shows the free strategy call card. Free,
 * no approval. It returns the chat's open call (creating an offered one when there is
 * none) and the Calendly link; the card prefills name and email from the session, so
 * no contact detail passes through the model.
 */
import { tool } from "ai";
import { z } from "zod";
import type { ToolEnv } from "./env";

/** How long BeamX's free strategy call is, so the reply can say it from a result. */
export const CONSULTATION_MINUTES = 30;

export const offerConsultationInput = z.strictObject({});

export const offerConsultationOutput = z.union([
  z.object({
    ok: z.literal(true),
    consultationId: z.string(),
    status: z.enum(["offered", "booked", "canceled"]),
    startTime: z.string().nullable(),
    calendlyUrl: z.string(),
    minutes: z.literal(CONSULTATION_MINUTES),
  }),
  z.object({ ok: z.literal(false), error: z.literal("try_again") }),
]);

export type OfferConsultationOutput = z.infer<typeof offerConsultationOutput>;

export const offerConsultationTool = (env: ToolEnv) =>
  tool({
    description:
      "Show the card that books BeamX's free 30 minute strategy call with an adviser. Use it once after a ready report's first follow up, and whenever the client asks to talk to someone, book a call, or get help acting on a report. It is free for everyone.",
    inputSchema: offerConsultationInput,
    execute: async (): Promise<OfferConsultationOutput> => {
      const { deps, conversationId } = env;
      const read = await deps
        .offerConsultation(env.owner.current, conversationId)
        .catch(() => null);
      const output: OfferConsultationOutput =
        read === null || !read.ok
          ? { ok: false, error: "try_again" }
          : {
              ok: true,
              consultationId: read.value.id,
              status: read.value.status,
              startTime: read.value.startTime,
              calendlyUrl: deps.calendlyUrl,
              minutes: CONSULTATION_MINUTES,
            };
      deps.log("assistant_tool", {
        name: "offerConsultation",
        outcome: output.ok ? output.status : output.error,
      });
      return output;
    },
  });
