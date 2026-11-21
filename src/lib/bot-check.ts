/**
 * Server only. Vercel BotID (spec 0007) for the chat route and the guest sign in. BotID
 * runs only on Vercel (its client script is proxied there), so off Vercel (`next dev`,
 * the e2e `next start`) every request counts as human. Real detection is checked on a
 * Vercel deploy (#21).
 */
import { checkBotId } from "botid/server";
import { env } from "./env";

export const isBot = async (): Promise<boolean> => {
  const verdict = await checkBotId({
    developmentOptions: { isDevelopment: env.VERCEL !== "1" },
  });
  return verdict.isBot;
};
