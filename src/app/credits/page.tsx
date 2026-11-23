import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { Suspense } from "react";
import { claimGrants } from "@/auth/grants";
import { sessionUser } from "@/auth/session";
import { parsePaymentNotice } from "@/billing/checkout";
import { billingConfig } from "@/billing/config";
import {
  decodeCursor,
  encodeCursor,
  HISTORY_PAGE_SIZE,
} from "@/billing/history";
import { expiryDate, expiryState } from "@/billing/pricing";
import { BuyPacks } from "@/components/credits/buy-packs";
import { CreditHistory } from "@/components/credits/credit-history";
import {
  credits as creditsText,
  expiryBannerLine,
  expiryBannerTitle,
  formatDay,
  paymentBanner,
} from "@/components/credits/credit-copy";
import { CreditsBanner } from "@/components/credits/credits-banner";
import { Skeleton } from "@/components/ui/skeleton";
import { Header } from "@/components/workspace/header";
import * as credits from "@/db/queries/credits";
import { logEvent } from "@/lib/log";
import { startCheckoutAction } from "./actions";

export const metadata: Metadata = { title: "Credits · BeamX Workspace" };

/**
 * The credits page (spec 0004, AC-13, AC-14, AC-15): balance, held credits, the expiry
 * date (with a banner from 30 days before), the packs to buy, and the history, newest
 * first, 20 a page by cursor. The frame is static; everything from the session streams in
 * behind Suspense. A signed in account's pending grants are claimed on load first, so a
 * missed sign up hook heals here.
 */
export default function CreditsPage({ searchParams }: PageProps<"/credits">) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Header>
        <Link
          href="/"
          className="inline-flex min-h-11 items-center px-2 text-sm font-medium underline-offset-4 hover:underline"
        >
          Back to chat
        </Link>
      </Header>
      <main className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-4 py-6 md:py-10">
        <h1 className="text-2xl font-semibold">Credits</h1>
        <Suspense fallback={<CreditsSkeleton />}>
          <CreditsContent searchParams={searchParams} />
        </Suspense>
      </main>
    </div>
  );
}

function CreditsSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-hidden>
      <Skeleton className="h-28 w-full rounded-xl" />
      <Skeleton className="h-40 w-full rounded-xl" />
      <Skeleton className="h-64 w-full rounded-xl" />
    </div>
  );
}

const cardClass =
  "flex min-w-0 flex-col gap-4 rounded-xl border bg-card p-4 text-card-foreground md:p-5";

/** Grants never block the page: a failure is logged and heals at the next billable action. */
const claimQuietly = async (userId: string): Promise<void> => {
  try {
    await claimGrants(userId);
  } catch (e) {
    logEvent("grant_claim_failed", {
      userId,
      where: "credits_page",
      error: e instanceof Error ? e.name : "unknown",
    });
  }
};

async function CreditsContent({
  searchParams,
}: Pick<PageProps<"/credits">, "searchParams">) {
  await connection();
  const [user, params] = await Promise.all([
    headers().then(sessionUser),
    searchParams,
  ]);
  const notice = parsePaymentNotice(params.payment);
  const banner = notice === null ? null : paymentBanner(notice);
  const paymentLine =
    banner === null ? null : (
      <CreditsBanner
        tone={banner.tone}
        title={banner.title}
        message={banner.message}
        testId="payment-banner"
      />
    );

  if (user === null)
    return (
      <>
        {paymentLine}
        <section className={cardClass}>
          <p className="font-semibold">Sign in to see your credits</p>
          <p className="text-sm text-muted-foreground">
            Open the chat and sign in to your account. If you just paid, your
            credits are added once Paystack confirms the payment.
          </p>
          <Link
            href="/"
            className="inline-flex min-h-11 items-center self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            Go to the chat
          </Link>
        </section>
      </>
    );

  if (!user.isAnonymous) await claimQuietly(user.id);
  const cursor = decodeCursor(params.cursor);
  const [summary, page] = await Promise.all([
    credits.getSummary(user.id),
    credits.listLedger(user.id, cursor, HISTORY_PAGE_SIZE),
  ]);

  const state =
    summary === null
      ? "ok"
      : expiryState(
          new Date(summary.lastActivityAt),
          summary.balance,
          new Date(),
          billingConfig,
        );
  const expires =
    summary === null || summary.balance <= 0
      ? null
      : formatDay(expiryDate(new Date(summary.lastActivityAt), billingConfig));
  const last = page.entries.at(-1);
  const olderHref =
    page.hasMore && last !== undefined
      ? `/credits?cursor=${encodeCursor({ createdAt: last.createdAt, id: last.id })}`
      : null;

  return (
    <>
      {paymentLine}
      {state !== "ok" && expires !== null ? (
        <CreditsBanner
          tone="warn"
          title={expiryBannerTitle}
          message={expiryBannerLine(expires, state === "expired")}
          testId="expiry-banner"
        />
      ) : null}

      <section aria-labelledby="balance-title" className={cardClass}>
        <h2 id="balance-title" className="sr-only">
          Balance
        </h2>
        <dl className="grid grid-cols-2 gap-4">
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-sm text-muted-foreground">Available</dt>
            <dd
              data-testid="credits-available"
              className="text-2xl font-semibold"
            >
              {creditsText(summary?.available ?? 0)}
            </dd>
          </div>
          <div className="flex min-w-0 flex-col gap-1">
            <dt className="text-sm text-muted-foreground">
              Held for runs in progress
            </dt>
            <dd className="text-2xl font-semibold">
              {creditsText(summary?.held ?? 0)}
            </dd>
          </div>
          {expires !== null ? (
            <div className="col-span-2 flex flex-col gap-1">
              <dt className="text-sm text-muted-foreground">Expires</dt>
              <dd>
                {expires}, 12 months after your last purchase or tool run.
              </dd>
            </div>
          ) : null}
        </dl>
      </section>

      <section aria-labelledby="packs-title" className={cardClass}>
        <h2 id="packs-title" className="text-lg font-semibold">
          Buy credits
        </h2>
        {user.isAnonymous ? (
          <p className="text-sm text-muted-foreground">
            Sign up for a free account in the chat to buy credits. Your answers
            and credits so far are kept.
          </p>
        ) : (
          <>
            <p className="text-sm text-muted-foreground">
              Paid securely with Paystack, in naira. Prices include VAT.
            </p>
            <BuyPacks
              packs={billingConfig.packs}
              buy={startCheckoutAction}
              returnTo={null}
            />
          </>
        )}
      </section>

      <section aria-labelledby="history-title" className={cardClass}>
        <h2 id="history-title" className="text-lg font-semibold">
          History
        </h2>
        <CreditHistory
          entries={page.entries}
          timeZone={billingConfig.chat.dayTimeZone}
          olderHref={olderHref}
          newestHref={cursor === null ? null : "/credits"}
        />
      </section>
    </>
  );
}
