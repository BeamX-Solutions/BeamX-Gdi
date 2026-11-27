/**
 * The business profile (spec 0012). Facts are JSONB, one object per key:
 * `{ value, sourceRunId, updatedAt }`. Every write goes through one merge rule: per key,
 * the fact with the later `updatedAt` wins. The shapes of `value` belong to the fact
 * catalog (`tools/_kit/facts.ts`); this layer never interprets them.
 */
import { sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { db } from "../client";
import { newId } from "../id";

/** A fact to write from a completed run: its catalog key, its question and value. */
export type RunFactEntry = {
  readonly key: string;
  readonly questionId: string;
  readonly value: unknown;
};

/** One stored fact, unparsed, with the tool of the run it came from. */
export type StoredFact = {
  readonly key: string;
  readonly value: unknown;
  readonly sourceRunId: string | null;
  /** The source run's tool, or null for an edit or a deleted run. */
  readonly sourceToolId: string | null;
  readonly updatedAt: string;
};

/**
 * Upserts `incoming` (an SQL expression yielding one jsonb object of facts) into the
 * user's profile, the later `updatedAt` winning per key. Writes nothing when `incoming`
 * is null or empty.
 */
const mergeStatement = (userId: string, incoming: SQL) =>
  db.execute(sql`
    WITH n AS (SELECT ${incoming} AS facts)
    INSERT INTO business_profile (id, user_id, facts)
    SELECT ${newId()}::uuid, ${userId}::uuid, n.facts FROM n
    WHERE n.facts IS NOT NULL AND n.facts <> '{}'::jsonb
      AND EXISTS (SELECT 1 FROM "user" WHERE id = ${userId}::uuid)
    ON CONFLICT (user_id) DO UPDATE SET
      facts = (
        SELECT coalesce(jsonb_object_agg(t.k, CASE
            WHEN t.new_f IS NULL THEN t.old_f
            WHEN t.old_f IS NULL THEN t.new_f
            WHEN (t.new_f->>'updatedAt')::timestamptz >= (t.old_f->>'updatedAt')::timestamptz THEN t.new_f
            ELSE t.old_f END), '{}'::jsonb)
        FROM (
          SELECT coalesce(o.key, x.key) AS k, o.value AS old_f, x.value AS new_f
          FROM jsonb_each(business_profile.facts) o
          FULL JOIN jsonb_each(EXCLUDED.facts) x ON o.key = x.key
        ) t
      ),
      updated_at = now()
  `);

/**
 * The profile write that runs in the completion batch (spec 0012, AC-5): each entry
 * whose answer is saved in this completed run, and did not come from the profile
 * (`source <> 'profile'`), becomes a fact stamped with the run and the answer's own
 * `updated_at`. Does nothing if the run did not complete.
 */
export const runFactsStatement = (
  userId: string,
  runId: string,
  entries: readonly RunFactEntry[],
) =>
  entries.length === 0
    ? db.execute(sql`SELECT 1`)
    : mergeStatement(
        userId,
        sql`(
          SELECT jsonb_object_agg(v.key, jsonb_build_object(
            'value', v.value, 'sourceRunId', r.id, 'updatedAt', a.updated_at))
          FROM (VALUES ${sql.join(
            entries.map(
              (e) =>
                sql`(${e.key}, ${e.questionId}, ${JSON.stringify(e.value)}::jsonb)`,
            ),
            sql`, `,
          )}) AS v(key, question_id, value)
          JOIN tool_run r ON r.id = ${runId}::uuid AND r.user_id = ${userId}::uuid
            AND r.status = 'completed'
          JOIN tool_run_answer a ON a.run_id = r.id AND a.question_id = v.question_id
            AND a.source <> 'profile'
        )`,
      );

/** Sets one fact as the client's own edit (`sourceRunId` null, now). */
export const setFact = async (
  userId: string,
  key: string,
  value: unknown,
): Promise<void> => {
  await mergeStatement(
    userId,
    sql`jsonb_build_object(${key}::text, jsonb_build_object(
      'value', ${JSON.stringify(value)}::jsonb, 'sourceRunId', null, 'updatedAt', now()))`,
  );
};

/** Removes one fact. Removing a missing fact or from a missing profile does nothing. */
export const removeFact = async (
  userId: string,
  key: string,
): Promise<void> => {
  await db.execute(sql`
    UPDATE business_profile SET facts = facts - ${key}::text, updated_at = now()
    WHERE user_id = ${userId}::uuid
  `);
};

/**
 * Guest sign up (spec 0002, spec 0012 AC-10): the guest's facts merge into the account
 * (later `updatedAt` wins per key), then the guest profile is deleted. Two statements
 * for `users.linkGuest`'s batch, in this order.
 */
export const linkGuestProfileStatements = (
  guestUserId: string,
  newUserId: string,
) =>
  [
    mergeStatement(
      newUserId,
      sql`(SELECT facts FROM business_profile WHERE user_id = ${guestUserId}::uuid)`,
    ),
    db.execute(
      sql`DELETE FROM business_profile WHERE user_id = ${guestUserId}::uuid`,
    ),
  ] as const;

const factRowSchema = z.object({
  key: z.string(),
  value: z.unknown(),
  source_run_id: z.string().nullable(),
  source_tool_id: z.string().nullable(),
  updated_at: z.string(),
});

/**
 * The user's facts with the tool of each source run, in one statement (spec 0012,
 * AC-8). A malformed entry (no `updatedAt`, a bad run id) is skipped here; values are
 * checked against the catalog by the caller.
 */
export const get = async (userId: string): Promise<readonly StoredFact[]> => {
  const rows = await db.execute(sql`
    SELECT f.key, f.value->'value' AS value,
      r.id::text AS source_run_id, r.tool_id AS source_tool_id,
      f.value->>'updatedAt' AS updated_at
    FROM business_profile p
    CROSS JOIN LATERAL jsonb_each(p.facts) f
    LEFT JOIN tool_run r
      ON f.value->>'sourceRunId' ~ '^[0-9a-f-]{36}$'
      AND r.id = (f.value->>'sourceRunId')::uuid AND r.user_id = p.user_id
    WHERE p.user_id = ${userId}::uuid
      AND jsonb_typeof(f.value) = 'object' AND f.value ? 'updatedAt'
    ORDER BY f.key
  `);
  return rows.rows.flatMap((raw) => {
    const row = factRowSchema.safeParse(raw);
    return row.success
      ? [
          {
            key: row.data.key,
            value: row.data.value,
            sourceRunId: row.data.source_run_id,
            sourceToolId: row.data.source_tool_id,
            updatedAt: row.data.updated_at,
          },
        ]
      : [];
  });
};
