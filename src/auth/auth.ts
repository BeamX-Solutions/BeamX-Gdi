import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  advanced: { database: { generateId: "uuid" } },
  plugins: [
    anonymous({
      // Guest rows are re-pointed to the new user by users.linkGuest (milestone 4).
      // Errors must propagate so Better Auth aborts before deleting the guest.
      onLinkAccount: async () => {},
    }),
  ],
});
