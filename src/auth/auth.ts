import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { anonymous } from "better-auth/plugins";
import { db } from "@/db/client";
import { linkGuestAccount } from "./link";
import * as schema from "@/db/schema";
import { env } from "@/lib/env";

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  advanced: { database: { generateId: "uuid" } },
  plugins: [anonymous({ onLinkAccount: linkGuestAccount })],
});
