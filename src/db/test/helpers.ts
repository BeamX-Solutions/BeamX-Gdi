import * as conversations from "../queries/conversations";
import * as credits from "../queries/credits";
import * as runs from "../queries/runs";
import { eq } from "drizzle-orm";
import { db } from "../client";
import { newId } from "../id";
import { user } from "../schema";

/** Creates an anonymous user. Each test owns its users, so files can share one branch. */
export const createGuest = async () => {
  const id = newId();
  await db.insert(user).values({
    id,
    name: "Guest",
    email: `${id}@guest.test`,
    isAnonymous: true,
  });
  return id;
};

export const deleteUser = async (id: string) => {
  await db.delete(user).where(eq(user.id, id));
};

/** Collects guests so a test file can clean up after itself (cascade removes their rows). */
export const guestTracker = () => {
  const ids: string[] = [];
  return {
    guest: async () => {
      const id = await createGuest();
      ids.push(id);
      return id;
    },
    cleanup: async () => {
      await Promise.all(ids.map(deleteUser));
    },
  };
};

export const unwrap = <T, E>(
  r: { ok: true; value: T } | { ok: false; error: E },
): T => {
  if (!r.ok) throw new Error(`unexpected error: ${JSON.stringify(r.error)}`);
  return r.value;
};

/** The price test runs hold; well under the starter grant used by `fundRun`. */
export const TEST_RUN_PRICE = 10;

/**
 * Gives the user a credit account (100 credit grant) and holds `price` for an existing
 * run, like approving a paid run would (spec 0004). Reports need the hold to be claimed.
 */
export const fundRun = async (
  userId: string,
  runId: string,
  price = TEST_RUN_PRICE,
) => {
  await credits.ensureAccount(userId, 100);
  return unwrap(await credits.holdExistingRun(userId, runId, price));
};

/** A guest with a conversation and a funded in_progress run holding the given answers. */
export const runWithAnswers = async (
  userId: string,
  toolId = "stellar",
  toolVersion = "1",
  answers: Record<string, unknown> = { q1: "a", q2: "b" },
) => {
  const conv = await conversations.create(userId);
  const { run } = unwrap(
    await runs.start(userId, conv.id, toolId, toolVersion),
  );
  await fundRun(userId, run.id);
  for (const [q, v] of Object.entries(answers))
    unwrap(await runs.saveAnswer(userId, run.id, q, v, "client"));
  return { conv, run };
};

/** Completes a run from its current answers, like the tool layer would. */
export const completeFromAnswers = async (
  userId: string,
  runId: string,
  scores: unknown = { total: 1 },
) => {
  const { answers } = unwrap(await runs.get(userId, runId));
  const last =
    answers
      .map((a) => a.updatedAt)
      .sort()
      .at(-1) ?? null;
  return runs.complete(userId, runId, scores, answers.length, last);
};
