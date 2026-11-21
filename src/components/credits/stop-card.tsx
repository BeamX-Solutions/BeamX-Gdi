"use client";

import { ApprovalCard, type ApprovalCardState } from "./approval-card";
import { stopTitle } from "./credit-copy";

type StopCardProps = {
  /** `heldAmount`, written by the server; 0 with no hold. */
  readonly heldAmount: number;
  readonly state: ApprovalCardState;
  readonly onApprove: () => void;
  readonly onDecline: () => void;
  readonly disabled?: boolean;
};

/** "Stop this run?" (spec 0006, AC-9), naming the held credits that come back. */
export function StopCard({ heldAmount, ...rest }: StopCardProps) {
  return (
    <ApprovalCard
      title={stopTitle(heldAmount)}
      approveLabel="Stop the run"
      declineLabel="Keep going"
      approvedText="Run stopped"
      declinedText="Kept going"
      {...rest}
    />
  );
}
