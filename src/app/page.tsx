import { headers } from "next/headers";
import { Suspense } from "react";
import { toolNames } from "@/assistant/chat-page";
import { startCheckoutAction } from "./credits/actions";
import { sessionUser, sessionUserId } from "@/auth/session";
import { billingConfig } from "@/billing/config";
import { expiryWarning, toCreditSummary } from "@/billing/summary";
import { AccountControl } from "@/components/auth/account-control";
import { CreditChip } from "@/components/credits/credit-chip";
import { Chat } from "@/components/workspace/chat";
import * as credits from "@/db/queries/credits";
import { needsTermsCard, TermsNotice } from "./terms/notice";

/**
 * A new chat (spec 0007, AC-1). The shell is static: the client reads the session
 * itself, and nothing is created until the first send. Only the header chip reads the
 * request, behind its own Suspense boundary.
 */
export default function Home() {
  return (
    <Chat
      toolNames={toolNames()}
      buy={startCheckoutAction}
      chip={
        <Suspense fallback={null}>
          <ChipSeed />
        </Suspense>
      }
      notice={
        <Suspense fallback={null}>
          <TermsSeed />
        </Suspense>
      }
    />
  );
}

/**
 * The header's server read (AC-9): the user's credits, or nothing with no account. The
 * account control beside the chip uses the same read for its forfeit note (spec 0009).
 */
async function ChipSeed() {
  const userId = await sessionUserId(await headers());
  const account = userId === null ? null : await credits.getSummary(userId);
  const summary = toCreditSummary(account);
  return (
    <>
      <CreditChip
        initial={summary}
        expiring={expiryWarning(account, new Date(), billingConfig)}
      />
      <AccountControl availableCredits={summary?.available ?? 0} />
    </>
  );
}

/** The updated terms card for an account behind on the terms (spec 0017, AC-6). */
async function TermsSeed() {
  const user = await sessionUser(await headers());
  return (await needsTermsCard(user)) ? <TermsNotice /> : null;
}
