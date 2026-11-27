/**
 * A strategy call's live state for its booking card (spec 0016, AC-8): offered, booked
 * with the time, or canceled. Owner only; anyone else gets `404`.
 */
import type { NextRequest } from "next/server";
import { z } from "zod";
import { sessionUserId } from "@/auth/session";
import * as consultations from "@/db/queries/consultations";

const idSchema = z.uuid();

const json = (status: number, body: unknown): Response =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(
  request: NextRequest,
  ctx: RouteContext<"/api/consultations/[id]">,
) {
  const { id } = await ctx.params;
  const parsed = idSchema.safeParse(id);
  if (!parsed.success) return json(400, { code: "invalid_id" });
  const userId = await sessionUserId(request.headers);
  if (userId === null) return json(401, { code: "unauthenticated" });
  const row = await consultations.get(userId, parsed.data);
  return row === null ? json(404, { code: "not_found" }) : json(200, row);
}
