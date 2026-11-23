/**
 * BotID's client side protection (spec 0007, spec 0009 AC-15): the chat route, the guest
 * sign in, and the account auth POSTs (listed once in `src/auth/paths.ts`).
 * It does nothing under `next dev`; off Vercel the server treats requests as human.
 */
import { initBotId } from "botid/client/core";
import { BOT_PROTECTED_AUTH_PATHS } from "@/auth/paths";

initBotId({
  protect: [
    { path: "/api/chat", method: "POST" },
    ...BOT_PROTECTED_AUTH_PATHS.map((path) => ({
      path,
      method: "POST" as const,
    })),
  ],
});
