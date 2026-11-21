/**
 * BotID's client side protection (spec 0007): the chat route and the guest sign in.
 * It does nothing under `next dev`; off Vercel the server treats requests as human.
 */
import { initBotId } from "botid/client/core";

initBotId({
  protect: [
    { path: "/api/chat", method: "POST" },
    { path: "/api/auth/sign-in/anonymous", method: "POST" },
  ],
});
