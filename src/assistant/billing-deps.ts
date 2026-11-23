/**
 * Server only. The live billing helpers the chat route and the assistant's tools share
 * (spec 0004): the account opener with the guest grant IP cap (and the account grants
 * for a signed in user), and the
 * free chat allowance counters, both on the shared Redis store.
 */
import { claimGrants } from "@/auth/grants";
import { billingConfig } from "@/billing/config";
import { accountOpener, freeChat } from "@/billing/chat-billing";
import * as credits from "@/db/queries/credits";
import { limitStore } from "@/lib/limits";

const now = () => new Date();

export const openCreditAccount = accountOpener({
  store: limitStore,
  ensureAccount: credits.ensureAccount,
  claimGrants,
  config: billingConfig,
  now,
});

export const freeChatCounters = freeChat({ store: limitStore, now });
