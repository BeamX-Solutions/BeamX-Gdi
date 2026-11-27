/**
 * Server only. Free strategy calls (spec 0016). Every state change is one conditional
 * `UPDATE … RETURNING`, so a retried Calendly webhook changes nothing and the caller
 * knows whether it made the move.
 */
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";
import { db } from "../client";
import { newId } from "../id";
import { consultation, toolRun, report } from "../schema";

export type ConsultationStatus = "offered" | "booked" | "canceled";

export type Consultation = {
  readonly id: string;
  readonly status: ConsultationStatus;
  /** The call's start, a stored timestamp string; null until booked. */
  readonly startTime: string | null;
};

const view = {
  id: consultation.id,
  status: consultation.status,
  startTime: consultation.startTime,
};

/**
 * AC-2: the chat's open call (offered or booked), creating an offered one when there is
 * none. `not_found` when the chat is not the user's.
 */
export const offer = async (
  userId: string,
  conversationId: string,
): Promise<Result<Consultation, { readonly code: "not_found" }>> => {
  const [, rows] = await db.batch([
    db.execute(sql`
      INSERT INTO consultation (id, user_id, conversation_id)
      SELECT ${newId()}::uuid, c.user_id, c.id
      FROM conversation c
      WHERE c.id = ${conversationId}::uuid AND c.user_id = ${userId}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM consultation k
          WHERE k.conversation_id = c.id AND k.status IN ('offered', 'booked')
        )
      ON CONFLICT DO NOTHING
    `),
    db
      .select(view)
      .from(consultation)
      .where(
        and(
          eq(consultation.conversationId, conversationId),
          eq(consultation.userId, userId),
          inArray(consultation.status, ["offered", "booked"]),
        ),
      )
      .orderBy(desc(consultation.createdAt))
      .limit(1),
  ]);
  const row = rows[0];
  return row ? ok(row) : err({ code: "not_found" });
};

/** AC-8: one call for its owner only. */
export const get = async (
  userId: string,
  id: string,
): Promise<Consultation | null> => {
  const rows = await db
    .select(view)
    .from(consultation)
    .where(and(eq(consultation.id, id), eq(consultation.userId, userId)));
  return rows[0] ?? null;
};

/** Who a booking or cancel belongs to, for the webhook's follow ups. */
export type Moved = {
  readonly id: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly startTime: string | null;
};

const moved = {
  id: consultation.id,
  userId: consultation.userId,
  conversationId: consultation.conversationId,
  startTime: consultation.startTime,
};

/** AC-5: offered → booked, once. Null when it was not offered (a retry, or unknown). */
export const book = async (
  id: string,
  booking: {
    readonly startTime: string;
    readonly eventUri: string;
    readonly inviteeUri: string;
  },
): Promise<Moved | null> => {
  const rows = await db
    .update(consultation)
    .set({
      status: "booked",
      startTime: booking.startTime,
      calendlyEventUri: booking.eventUri,
      calendlyInviteeUri: booking.inviteeUri,
      bookedAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(and(eq(consultation.id, id), eq(consultation.status, "offered")))
    .returning(moved);
  return rows[0] ?? null;
};

/** AC-7: booked → canceled, once, found by the Calendly invitee. */
export const cancel = async (inviteeUri: string): Promise<Moved | null> => {
  const rows = await db
    .update(consultation)
    .set({
      status: "canceled",
      canceledAt: sql`now()`,
      updatedAt: sql`now()`,
    })
    .where(
      and(
        eq(consultation.calendlyInviteeUri, inviteeUri),
        eq(consultation.status, "booked"),
      ),
    )
    .returning(moved);
  return rows[0] ?? null;
};

/** The longest list of reports one BeamX email attaches (AC-6). */
export const REPORTS_PER_BOOKING = 3;

const idRow = z.object({ id: z.string() });

/** AC-6: the user's newest runs with a ready report, newest first. */
export const readyRunIds = async (
  userId: string,
  limit = REPORTS_PER_BOOKING,
): Promise<readonly string[]> => {
  const rows = await db
    .select({ id: toolRun.id })
    .from(toolRun)
    .innerJoin(report, eq(report.runId, toolRun.id))
    .where(and(eq(toolRun.userId, userId), eq(report.status, "ready")))
    .orderBy(desc(toolRun.completedAt))
    .limit(limit);
  return rows.flatMap((r) => {
    const parsed = idRow.safeParse(r);
    return parsed.success ? [parsed.data.id] : [];
  });
};
