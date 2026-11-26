"use client";

import { CoinsIcon } from "lucide-react";
import { ApprovalCard, type ApprovalCardState } from "./approval-card";
import {
  balanceLine,
  confirmTitle,
  priceLine,
  type ConfirmTool,
} from "./credit-copy";

type ConfirmCardProps = {
  readonly tool: ConfirmTool;
  /** The tool's name, when the card knows it ("Stellar"). */
  readonly toolName: string | null;
  /** `shownPrice`, written by the server. */
  readonly price: number;
  /** `availableBalance`, written by the server; null when absent. */
  readonly available: number | null;
  readonly state: ApprovalCardState;
  readonly onApprove: () => void;
  readonly onDecline: () => void;
  readonly disabled?: boolean;
};

/**
 * The confirm card before a paid run (spec 0007, AC-3; spec 0004): the tool, the price
 * and the available balance, with Approve and Not now. Nothing is spent until Approve.
 */
export function ConfirmCard({
  tool,
  toolName,
  price,
  available,
  ...rest
}: ConfirmCardProps) {
  const balance = balanceLine(available);
  return (
    <ApprovalCard
      title={confirmTitle(tool, toolName)}
      approveLabel="Approve"
      declineLabel="Not now"
      approvedText="Approved"
      declinedText="Not started"
      {...rest}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <p className="flex items-center gap-1.5 font-medium">
          <CoinsIcon className="size-4 shrink-0 text-primary" aria-hidden />
          {priceLine(price)}
        </p>
        {balance ? (
          <p className="text-sm text-muted-foreground">{balance}</p>
        ) : null}
      </div>
    </ApprovalCard>
  );
}
