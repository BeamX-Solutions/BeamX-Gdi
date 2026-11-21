"use client";

import { MessageSquareQuoteIcon } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";

export type PrefillItem = {
  readonly questionId: string;
  readonly prompt: string;
  /** The answer as the client reads it (`formatAnswer`, written by the server). */
  readonly label: string;
};

type PrefillCardProps = {
  /** "From our chat" or "From your last run" (spec 0006, AC-5, AC-5b). */
  readonly title: string;
  readonly items: readonly PrefillItem[];
  /** Accept every item. */
  readonly onAcceptAll: () => void;
  /** Accept the other items and open this question's card. */
  readonly onEdit: (questionId: string) => void;
  readonly disabled?: boolean;
};

/**
 * Answers found in the chat, confirmed before anything is saved (spec 0006, AC-5):
 * Accept all, or Edit on one item, which keeps the rest and opens that card.
 */
export function PrefillCard({
  title,
  items,
  onAcceptAll,
  onEdit,
  disabled = false,
}: PrefillCardProps) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="flex w-full min-w-0 flex-col gap-3 rounded-xl border bg-card p-4 text-card-foreground md:p-5"
    >
      <p
        id={titleId}
        className="flex items-center gap-2 font-heading text-lg font-semibold wrap-anywhere"
      >
        <MessageSquareQuoteIcon
          className="size-5 shrink-0 text-primary"
          aria-hidden
        />
        {title}
      </p>
      <ul className="flex flex-col divide-y">
        {items.map((item) => (
          <li
            key={item.questionId}
            className="flex min-w-0 items-center gap-3 py-2"
          >
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="text-sm wrap-anywhere text-muted-foreground">
                {item.prompt}
              </p>
              <p className="font-medium wrap-anywhere">{item.label}</p>
            </div>
            <Button
              variant="ghost"
              disabled={disabled}
              aria-label={`Edit: ${item.prompt}`}
              onClick={() => onEdit(item.questionId)}
            >
              Edit
            </Button>
          </li>
        ))}
      </ul>
      <Button className="self-start" disabled={disabled} onClick={onAcceptAll}>
        Accept all
      </Button>
    </section>
  );
}
