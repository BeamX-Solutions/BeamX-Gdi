import * as conversations from "../queries/conversations";
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

/** A guest with a conversation and an in_progress run holding the given answers. */
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
  const { run } = unwrap(await runs.get(userId, runId));
  return runs.complete(userId, runId, scores, run.answersVersion);
};
