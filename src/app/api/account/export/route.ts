/**
 * `GET /api/account/export` (spec 0017, AC-7): everything BeamX holds about the session
 * user, guest or account, as `beamx-data-<YYYY-MM-DD>.json`. Owner only (every statement
 * is filtered by the session user), never cached, at most 3 an hour per user.
 */
import { headers } from "next/headers";
import { exportData } from "@/auth/export-data";
import { sessionUserId } from "@/auth/session";
import * as exportQuery from "@/db/queries/export";
import { limitStore } from "@/lib/limits";
import { logEvent } from "@/lib/log";

export async function GET() {
  const reply = await exportData(
    {
      take: (key) => limitStore.take("data_export", key),
      giveBack: (key) => limitStore.giveBack("data_export", key),
      read: exportQuery.readAll,
      now: () => new Date(),
      log: logEvent,
    },
    await sessionUserId(await headers()),
  );
  if (reply.kind === "error")
    return Response.json(
      { code: reply.code },
      { status: reply.status, headers: { "Cache-Control": "no-store" } },
    );
  return new Response(JSON.stringify(reply.data, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${reply.fileName}"`,
      "Cache-Control": "no-store",
    },
  });
}
