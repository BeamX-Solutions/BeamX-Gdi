import { sql } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";

export type UsageInput = {
  readonly callKey: string;
  readonly userId?: string;
  readonly conversationId?: string;
  readonly runId?: string;
  readonly purpose: "chat" | "report" | "title" | "extraction";
  readonly model: string;
  readonly inputTokens?: number;
  readonly outputTokens?: number;
  readonly cacheReadTokens?: number;
  readonly cacheWriteTokens?: number;
  /** Price at the time of the call, from `src/lib/ai-cost.ts`. */
  readonly costUsd: number | string;
};

/**
 * Server only (`onFinish`). Idempotent on `callKey`. Owner and links are resolved with
 * subselects, so a user, chat, or run deleted mid stream becomes null, not an FK error.
 */
export const record = async (
  input: UsageInput,
): Promise<{ status: "recorded"; id: string } | { status: "duplicate" }> => {
  const id = newId();
  const rows = await db.execute(sql`
    INSERT INTO ai_usage (id, call_key, user_id, conversation_id, run_id, purpose, model,
      input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, cost_usd)
    VALUES (
      ${id}::uuid, ${input.callKey},
      (SELECT id FROM "user" WHERE id = ${input.userId ?? null}::uuid),
      (SELECT id FROM conversation WHERE id = ${input.conversationId ?? null}::uuid),
      (SELECT id FROM tool_run WHERE id = ${input.runId ?? null}::uuid),
      ${input.purpose}::ai_purpose, ${input.model},
      ${input.inputTokens ?? 0}, ${input.outputTokens ?? 0},
      ${input.cacheReadTokens ?? 0}, ${input.cacheWriteTokens ?? 0},
      ${String(input.costUsd)}::numeric
    )
    ON CONFLICT (call_key) DO NOTHING
    RETURNING id
  `);
  return rows.rows.length > 0
    ? { status: "recorded", id }
    : { status: "duplicate" };
};
