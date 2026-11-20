/**
 * The Better Auth client (spec 0007): same origin, with the anonymous plugin so a guest
 * is signed in on their first send.
 */
import { anonymousClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [anonymousClient()],
});
