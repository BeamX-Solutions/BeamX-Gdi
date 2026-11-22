/**
 * The sign up form's email check (spec 0009, AC-2, AC-8): whether an email is free, has a
 * password account, or was made with Google. BotID and the per email limit join in build
 * step 5.
 */
import { z } from "zod";
import { emailStatus } from "@/db/queries/users";

const bodySchema = z.object({ email: z.email().max(254) });

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: Request) {
  const body = bodySchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return json(422, { code: "invalid_email" });
  return json(200, { status: await emailStatus(body.data.email) });
}
