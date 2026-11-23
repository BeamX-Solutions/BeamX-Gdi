/**
 * The Better Auth client (spec 0007, 0009): same origin, with the anonymous plugin so a
 * guest is signed in on their first send, and the email code plugin for sign up and
 * password reset.
 */
import { anonymousClient, emailOTPClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [anonymousClient(), emailOTPClient()],
});
