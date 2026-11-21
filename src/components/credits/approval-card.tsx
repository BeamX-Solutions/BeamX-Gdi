"use client";

import { CheckIcon, XIcon } from "lucide-react";
import { useId, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

/** Where an approval card stands: waiting for a tap, or settled. */
export type ApprovalCardState = "pending" | "approved" | "declined";

type ApprovalCardProps = {
  readonly title: string;
  readonly children?: ReactNode;
  readonly state: ApprovalCardState;
  readonly approveLabel: string;
  readonly declineLabel: string;
  /** What a settled card says instead of its buttons. */
  readonly approvedText: string;
  readonly declinedText: string;
  readonly onApprove: () => void;
  readonly onDecline: () => void;
  readonly disabled?: boolean;
};

/**
 * The shared shell of the confirm and stop cards: a question, its details, and two
 * buttons while it waits. Once tapped, the buttons give way to one line saying what
 * was chosen, so a reload shows the same thing.
 */
export function ApprovalCard({
  title,
  children,
  state,
  approveLabel,
  declineLabel,
  approvedText,
  declinedText,
  onApprove,
  onDecline,
  disabled = false,
}: ApprovalCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      data-approval-state={state}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      <p
        id={titleId}
        className="font-heading text-lg font-semibold wrap-anywhere"
      >
        {title}
      </p>
      {children}
      {state === "pending" ? (
        <div className="flex flex-wrap gap-2">
          <Button onClick={onApprove} disabled={disabled}>
            {approveLabel}
          </Button>
          <Button variant="outline" onClick={onDecline} disabled={disabled}>
            {declineLabel}
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          {state === "approved" ? (
            <CheckIcon className="size-4" aria-hidden />
          ) : (
            <XIcon className="size-4" aria-hidden />
          )}
          {state === "approved" ? approvedText : declinedText}
        </p>
      )}
    </section>
  );
}
