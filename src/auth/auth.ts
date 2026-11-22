import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { anonymous, emailOTP, haveIBeenPwned } from "better-auth/plugins";
import { db } from "@/db/client";
import * as schema from "@/db/schema";
import type { CodePurpose } from "@/email/copy";
import { sendCodeEmail } from "@/email/send";
import { env } from "@/lib/env";
import { linkGuestAccount } from "./link";

const DAY_S = 60 * 60 * 24;

/** Better Auth's code types mapped to the email we send (spec 0009). */
const PURPOSE: Readonly<
  Record<
    "sign-in" | "email-verification" | "forget-password" | "change-email",
    CodePurpose
  >
> = {
  // The code sign in creates the account: our sign up (spec 0009, flow 1).
  "sign-in": "sign-up",
  "email-verification": "sign-up",
  "change-email": "sign-up",
  "forget-password": "reset",
};

export const auth = betterAuth({
  baseURL: env.NEXT_PUBLIC_APP_URL,
  // On a preview, `baseURL` is the per deploy URL; the branch alias must sign in too.
  trustedOrigins: env.VERCEL_BRANCH_URL
    ? [`https://${env.VERCEL_BRANCH_URL}`]
    : [],
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, { provider: "pg", schema }),
  advanced: { database: { generateId: "uuid" } },
  // Email and password (spec 0009). Accounts are only ever created by the code sign in
  // below; `/sign-up/email` is blocked in the route, so no unverified account exists.
  // `requireEmailVerification` is a safety net on top of that.
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
  },
  // 30 days, extended at most once a day while used (AC-11); a session counts as fresh
  // for deleting the account for one day after it was created (AC-13).
  session: { expiresIn: 30 * DAY_S, updateAge: DAY_S, freshAge: DAY_S },
  plugins: [
    anonymous({ onLinkAccount: linkGuestAccount }),
    emailOTP({
      otpLength: 6,
      expiresIn: 600,
      allowedAttempts: 3,
      // The code sign in creates the account, already verified (spec 0009, AC-2).
      disableSignUp: false,
      sendVerificationOTP: async ({ email, otp, type }) => {
        const sent = await sendCodeEmail(email, otp, PURPOSE[type]);
        if (!sent.ok)
          throw new APIError("SERVICE_UNAVAILABLE", {
            code: "EMAIL_SEND_FAILED",
            message: "We couldn't send the email, try again.",
          });
      },
    }),
    // Known leaked passwords are refused on reset (AC-10). Setting the first password is
    // checked in `/api/account/set-password` itself: the plugin only sees requests that
    // come through the auth handler, not that route's direct server call (AC-2).
    haveIBeenPwned({ paths: ["/email-otp/reset-password"] }),
  ],
});
