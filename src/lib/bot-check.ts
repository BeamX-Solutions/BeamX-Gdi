/**
 * Server only. Vercel BotID (spec 0007) for the chat route and the guest sign in. BotID
 * runs only on Vercel (its client script is proxied there), so off Vercel (`next dev`,
 * the e2e `next start`) every request counts as human. Real detection is checked on a
 * Vercel deploy (#21).
 */
import { checkBotId } from "botid/server";
import { env } from "./env";
import { logEvent } from "./log";

/**
 * Fails open: when BotID itself fails (no OIDC token, the Vercel API down) the request
 * counts as human and `bot_check_failed` is logged, so an outage never locks real users
 * out or turns into a 500. The turn lock, limits and spend cap still apply.
 */
export const isBot = async (): Promise<boolean> => {
  try {
    const verdict = await checkBotId({
      developmentOptions: { isDevelopment: env.VERCEL !== "1" },
    });
    return verdict.isBot;
  } catch {
    logEvent("bot_check_failed", {});
    return false;
  }
};
