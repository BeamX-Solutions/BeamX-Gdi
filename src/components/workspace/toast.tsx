"use client";

import { useEffect } from "react";
import { CheckCircle2Icon } from "lucide-react";

/** How long the toast stays on screen. */
export const TOAST_MS = 4000;

/**
 * A short confirmation at the bottom of the screen (spec 0009, AC-6). It is visual only
 * (`aria-hidden`): its text is also passed to the Thread, which owns the one polite live
 * region and announces it, so screen readers hear it once. Never used for failures, which
 * are error cards (DESIGN.md).
 */
export function Toast({
  message,
  onDone,
}: {
  readonly message: string | null;
  readonly onDone: () => void;
}) {
  useEffect(() => {
    if (message === null) return;
    const timer = setTimeout(onDone, TOAST_MS);
    return () => clearTimeout(timer);
  }, [message, onDone]);

  if (message === null) return null;
  return (
    <div
      aria-hidden
      data-testid="toast"
      className="pointer-events-none fixed inset-x-0 bottom-24 z-50 flex justify-center px-4"
    >
      <div className="flex items-center gap-2 rounded-md border bg-background px-4 py-3 text-sm shadow-lg">
        <CheckCircle2Icon className="size-4 text-primary" aria-hidden />
        {message}
      </div>
    </div>
  );
}
