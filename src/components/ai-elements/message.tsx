"use client";

import type { ComponentProps, HTMLAttributes } from "react";
import { memo } from "react";
import { Streamdown, type Components } from "streamdown";
import { cn } from "@/lib/utils";

type MessageProps = HTMLAttributes<HTMLDivElement> & {
  readonly from: "user" | "assistant";
};

/** One chat turn. The user's turn sits on the right in a royal blue bubble. */
export function Message({ className, from, ...props }: MessageProps) {
  return (
    <div
      data-from={from}
      className={cn(
        "group flex w-full min-w-0 flex-col gap-1",
        from === "user" ? "is-user items-end" : "is-assistant items-start",
        className,
      )}
      {...props}
    />
  );
}

/** The bubble. Assistant text is on the muted surface; the user's is on `--primary`. */
export function MessageContent({
  className,
  ...props
}: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "flex min-w-0 flex-col gap-2 rounded-xl px-4 py-2.5 text-base wrap-anywhere",
        "group-[.is-user]:max-w-[85%] group-[.is-user]:bg-primary group-[.is-user]:text-primary-foreground",
        "group-[.is-assistant]:max-w-full group-[.is-assistant]:bg-muted group-[.is-assistant]:text-foreground",
        className,
      )}
      {...props}
    />
  );
}

/** Links open in a new tab and never leak the opener or referrer. */
const components: Components = {
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="font-medium wrap-anywhere text-primary underline underline-offset-2"
    >
      {children}
    </a>
  ),
};

type MessageResponseProps = Omit<
  ComponentProps<typeof Streamdown>,
  "plugins" | "components" | "linkSafety" | "controls"
>;

/**
 * Streaming markdown. Code highlighting, diagrams, and math are off (no plugins), the
 * copy and download controls are off, and raw HTML is never rendered, so model output
 * cannot inject script.
 */
export const MessageResponse = memo(
  ({ className, ...props }: MessageResponseProps) => (
    <Streamdown
      className={cn(
        "min-w-0 wrap-anywhere [&>*:first-child]:mt-0 [&>*:last-child]:mb-0",
        className,
      )}
      components={components}
      controls={false}
      linkSafety={{ enabled: false }}
      {...props}
    />
  ),
  (prev, next) =>
    prev.children === next.children && prev.isAnimating === next.isAnimating,
);
MessageResponse.displayName = "MessageResponse";
