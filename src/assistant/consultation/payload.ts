/**
 * The parts of a Calendly webhook the app reads (spec 0016, "Webhook payload"). Every
 * other field is ignored. Pure.
 */
import { z } from "zod";

const invitee = z.object({
  uri: z.string().min(1).max(500),
  name: z.string().max(200).optional(),
  email: z.string().max(320).optional(),
  event: z.string().max(500).optional(),
  scheduled_event: z
    .object({ start_time: z.string().max(40).optional() })
    .optional(),
  tracking: z.object({ utm_content: z.string().max(100).nullish() }).nullish(),
});

export const calendlyWebhookSchema = z.object({
  event: z.string().max(100),
  payload: invitee,
});

export type CalendlyWebhook = z.infer<typeof calendlyWebhookSchema>;

const uuid = z.uuid();

/** The consultation id the widget carried as `utm_content`, or null. */
export const consultationIdOf = (hook: CalendlyWebhook): string | null => {
  const parsed = uuid.safeParse(hook.payload.tracking?.utm_content ?? "");
  return parsed.success ? parsed.data : null;
};
