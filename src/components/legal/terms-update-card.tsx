"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { PRIVACY_PATH, TERMS_PATH } from "@/legal/config";
import type { Result } from "@/lib/result";

const linkClass =
  "font-medium text-primary underline underline-offset-2 hover:no-underline";

/**
 * "We've updated our terms" (spec 0017, AC-6): shown once above the composer to an
 * account that hasn't accepted the current terms. It never blocks the chat; OK records
 * the new version (the Server Action comes in as a prop, so this never imports from
 * `src/app`) and hides the card. If recording fails the card still hides and shows again
 * on the next visit.
 */
export function TermsUpdateCard({
  onAccept,
}: {
  readonly onAccept: () => Promise<Result<null, unknown>>;
}) {
  const [open, setOpen] = useState(true);
  if (!open) return null;
  return (
    <section
      aria-labelledby="terms-update-title"
      className="mx-3 mt-2 flex shrink-0 flex-col gap-2 rounded-xl border bg-card p-3 text-card-foreground sm:flex-row sm:items-center sm:justify-between"
      data-testid="terms-update-card"
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <h2 id="terms-update-title" className="text-sm font-semibold">
          We&apos;ve updated our terms
        </h2>
        <p className="text-sm text-muted-foreground">
          Please read the new{" "}
          <a
            href={TERMS_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Terms
          </a>{" "}
          and{" "}
          <a
            href={PRIVACY_PATH}
            target="_blank"
            rel="noopener noreferrer"
            className={linkClass}
          >
            Privacy notice
          </a>
          . Select OK to accept them.
        </p>
      </div>
      <Button
        className="shrink-0 self-end sm:self-auto"
        onClick={() => {
          setOpen(false);
          void onAccept().catch(() => undefined);
        }}
      >
        OK
      </Button>
    </section>
  );
}
