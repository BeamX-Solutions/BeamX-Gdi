import { sql, type SQL } from "drizzle-orm";
import { db } from "../client";

/**
 * Charge and release shapes for run holds (spec 0004). Kept apart from `credits.ts` so
 * `runs`, `reports` and `conversations` can compose them without an import cycle.
 */

/**
 * CTEs that charge the active run hold of each run id in `runIds` in full: hold →
 * charged, account `balance -= amount, held -= amount`, one `run_charge` ledger entry.
 * Compose after a CTE that yields the run ids (e.g. the report turning ready), so the
 * charge only happens when that step did (AC-4). Names: ch, ca, cl.
 */
export const chargeRunHoldCtes = (runIds: SQL, ledgerId: string): SQL => sql`
  ch AS (
    UPDATE credit_hold
    SET status = 'charged', charged_amount = amount, settled_at = now()
    WHERE run_id IN (${runIds}) AND status = 'active' AND purpose = 'run'
    RETURNING id, user_id, run_id, amount
  ), ca AS (
    UPDATE credit_account acc
    SET balance = acc.balance - x.total, held = acc.held - x.total,
        last_activity_at = now(), updated_at = now()
    FROM (SELECT user_id, sum(amount)::int AS total FROM ch GROUP BY user_id) x
    WHERE acc.user_id = x.user_id
    RETURNING acc.user_id, acc.balance
  ), cl AS (
    INSERT INTO credit_ledger (id, user_id, kind, amount, balance_after, hold_id, run_id, idempotency_key)
    SELECT ${ledgerId}::uuid, ch.user_id, 'run_charge', -ch.amount, ca.balance, ch.id, ch.run_id, 'charge:' || ch.id
    FROM ch JOIN ca ON ca.user_id = ch.user_id
    ON CONFLICT (idempotency_key) DO NOTHING
    RETURNING id
  )
`;

export type ReleaseReason = "report_failed" | "abandoned" | "idle";

/**
 * CTEs that release the active run hold of each run id in `runIds`: hold → released,
 * account `held -= amount`. Nothing is charged and no ledger entry is written (a hold
 * is a reservation, not a balance change). Names: rh, ra.
 */
export const releaseRunHoldCtes = (
  runIds: SQL,
  reason: ReleaseReason,
): SQL => sql`
  rh AS (
    UPDATE credit_hold
    SET status = 'released', release_reason = ${reason}::hold_release_reason, settled_at = now()
    WHERE run_id IN (${runIds}) AND status = 'active' AND purpose = 'run'
    RETURNING user_id, amount
  ), ra AS (
    UPDATE credit_account acc
    SET held = acc.held - x.total, updated_at = now()
    FROM (SELECT user_id, sum(amount)::int AS total FROM rh GROUP BY user_id) x
    WHERE acc.user_id = x.user_id
    RETURNING acc.user_id
  )
`;

/** A whole statement releasing the holds of `runIds`; returns how many were released. */
export const releaseRunHolds = (runIds: SQL, reason: ReleaseReason) =>
  db.execute(sql`
    WITH ${releaseRunHoldCtes(runIds, reason)}
    SELECT count(*)::int AS released FROM rh
  `);
