import { headers } from "next/headers";
import { Suspense } from "react";
import { toolNames } from "@/assistant/chat-page";
import { sessionUserId } from "@/auth/session";
import { toCreditSummary } from "@/billing/summary";
import { AccountControl } from "@/components/auth/account-control";
import { CreditChip } from "@/components/credits/credit-chip";
import { Chat } from "@/components/workspace/chat";
import * as credits from "@/db/queries/credits";

/**
 * A new chat (spec 0007, AC-1). The shell is static: the client reads the session
 * itself, and nothing is created until the first send. Only the header chip reads the
 * request, behind its own Suspense boundary.
 */
export default function Home() {
  return (
    <Chat
      toolNames={toolNames()}
      chip={
        <Suspense fallback={null}>
          <ChipSeed />
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
  const summary = toCreditSummary(
    userId === null ? null : await credits.getSummary(userId),
  );
  return (
    <>
      <CreditChip initial={summary} />
      <AccountControl availableCredits={summary?.available ?? 0} />
    </>
  );
}
