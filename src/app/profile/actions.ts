"use server";

/**
 * Profile edits (spec 0012, AC-8, AC-9): a signed in account sets or removes one fact.
 * Every value goes through the catalog's edit card and schema (`factFromEdit`); guests
 * and unknown keys change nothing. Only the profile changes, never runs or reports.
 */
import { headers } from "next/headers";
import { sessionUser } from "@/auth/session";
import * as profile from "@/db/queries/profile";
import { logEvent } from "@/lib/log";
import { factFromEdit, isFactKey } from "@/tools/registry";

const accountId = async (): Promise<string | null> => {
  const user = await sessionUser(await headers());
  return user === null || user.isAnonymous ? null : user.id;
};

/** True when saved; false for a guest, an unknown key or a value that does not fit. */
export async function updateFactAction(
  key: string,
  answer: unknown,
): Promise<boolean> {
  const userId = await accountId();
  if (userId === null) return false;
  const edit = factFromEdit(key, answer);
  if (edit === null) return false;
  await profile.setFact(userId, edit.key, edit.value);
  logEvent("profile_fact_edited", { userId, key: edit.key });
  return true;
}

export async function removeFactAction(key: string): Promise<void> {
  const userId = await accountId();
  if (userId === null || !isFactKey(key)) return;
  await profile.removeFact(userId, key);
  logEvent("profile_fact_removed", { userId, key });
}
