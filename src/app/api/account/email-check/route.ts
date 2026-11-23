/**
 * The sign up form's email check (spec 0009, AC-2, AC-8): whether an email is free, has a
 * password account, or was made with Google. It reveals whether an email has an account,
 * so it is BotID checked and limited to 5 a minute per IP and 3 an hour per email (AC-15).
 */
import { z } from "zod";
import {
  allowEmailCheck,
  authRateLimiter,
  RATE_LIMITED_BODY,
} from "@/auth/rate-limit";
import { emailStatus } from "@/db/queries/users";
import { isBot } from "@/lib/bot-check";
import { requestIp } from "@/lib/client-ip";

const bodySchema = z.object({ email: z.email().max(254) });

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  if (await isBot()) return json(403, { code: "bot" });
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json(422, { code: "invalid_email" });
  const allowed = await allowEmailCheck(
    authRateLimiter,
    requestIp(request.headers),
    body.data.email,
  );
  if (!allowed) return json(429, RATE_LIMITED_BODY);
  return json(200, { status: await emailStatus(body.data.email) });
}
