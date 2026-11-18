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
  const { eq } = await import("drizzle-orm");
  await db.delete(user).where(eq(user.id, id));
};
