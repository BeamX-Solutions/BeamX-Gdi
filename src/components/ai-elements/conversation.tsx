"use client";

import { ArrowDownIcon } from "lucide-react";
import type { ReactNode } from "react";
import { useStickToBottom } from "use-stick-to-bottom";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type ConversationProps = {
  readonly children: ReactNode;
  readonly label?: string;
  readonly className?: string;
  readonly contentClassName?: string;
};

/**
 * Sticks to the bottom while content grows, unless the reader scrolled up; then a
 * "Jump to latest" button shows. Restyled from AI Elements `conversation`: no `role="log"`
 * (its implicit live region would read every token; the Thread owns the one live region),
 * a focusable scroll area (keyboard users can scroll it), and instant scrolling so no
 * script animation runs under reduced motion (AC-14).
 */
export function Conversation({
  children,
  label = "Conversation",
  className,
  contentClassName,
}: ConversationProps) {
  const { scrollRef, contentRef, isAtBottom, scrollToBottom } =
    useStickToBottom({ initial: "instant", resize: "instant" });

  return (
    <div className={cn("relative min-h-0 flex-1", className)}>
      <div
        ref={scrollRef}
        role="region"
        aria-label={label}
        tabIndex={0}
        className="h-full overflow-x-hidden overflow-y-auto rounded-md focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-hidden focus-visible:ring-inset"
      >
        <div
          ref={contentRef}
          className={cn(
            "flex min-w-0 flex-col gap-4 px-3 py-4",
            contentClassName,
          )}
        >
          {children}
        </div>
      </div>
      {isAtBottom ? null : (
        <Button
          type="button"
          variant="outline"
          onClick={() => void scrollToBottom()}
          className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-background shadow-md"
        >
          <ArrowDownIcon aria-hidden />
          Jump to latest
        </Button>
      )}
    </div>
  );
}
