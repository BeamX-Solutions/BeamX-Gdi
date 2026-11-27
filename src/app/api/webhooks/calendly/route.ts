/**
 * The Calendly webhook (spec 0016, AC-4 to AC-7). Nothing is trusted until the signed
 * `Calendly-Webhook-Signature` matches the raw body (401 otherwise). A booking or cancel
 * moves its consultation once, then confirms in the chat and emails BeamX. The logic
 * lives in `assistant/consultation/webhook`.
 */
import { webhookDeps } from "@/assistant/consultation/deps";
import { handleCalendlyWebhook } from "@/assistant/consultation/webhook";

// Rendering up to 3 report PDFs for BeamX's email takes a few seconds.
export const maxDuration = 60;

export async function POST(request: Request) {
  const rawBody = await request.text();
  const result = await handleCalendlyWebhook(
    webhookDeps,
    rawBody,
    request.headers.get("calendly-webhook-signature"),
  );
  return Response.json(result.body, {
    status: result.status,
    headers: { "Cache-Control": "no-store" },
  });
}
