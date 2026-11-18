"use client";

import type { ComponentProps, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** A wrapping row of quick reply chips (no sideways scroll, so nothing hides off screen). */
export function Suggestions({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      className={cn("flex flex-wrap items-center gap-2", className)}
      {...props}
    />
  );
}

type SuggestionProps = Omit<ComponentProps<typeof Button>, "onClick"> & {
  readonly suggestion: string;
  readonly onClick?: (suggestion: string) => void;
  readonly children?: ReactNode;
};

export function Suggestion({
  suggestion,
  onClick,
  className,
  children,
  ...props
}: SuggestionProps) {
  return (
    <Button
      type="button"
      variant="outline"
      className={cn(
        "min-w-0 rounded-full px-4 wrap-anywhere whitespace-normal",
        className,
      )}
      onClick={() => onClick?.(suggestion)}
      {...props}
    >
      {children ?? suggestion}
    </Button>
  );
}
