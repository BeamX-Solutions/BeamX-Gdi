"use client";

import { useRef, useState, type CSSProperties } from "react";
import { cn } from "@/lib/utils";

type Item = { readonly value: string; readonly label: string };

type RadioChipsProps = {
  readonly items: readonly Item[];
  /** The selected value, or null when nothing is picked yet. */
  readonly value: string | null;
  readonly onPick: (value: string) => void;
  readonly labelledBy: string;
  readonly describedBy?: string;
  readonly disabled?: boolean;
  /** Focus the starting item on mount (used when a card reopens for editing). */
  readonly autoFocus?: boolean;
  /** `chip`: wrapping pills. `segment`: joined numbered cells in an equal column grid. */
  readonly variant: "chip" | "segment";
  readonly columns?: number;
};

/**
 * A radio group built by hand because Radix radios select on arrow keys. Here arrow keys
 * only move focus and Space or Enter picks, so a keyboard user never submits by passing
 * over an option (AC-8). One Tab stop: the selected item, else the first.
 */
export function RadioChips({
  items,
  value,
  onPick,
  labelledBy,
  describedBy,
  disabled = false,
  autoFocus = false,
  variant,
  columns,
}: RadioChipsProps) {
  const selectedIndex = items.findIndex((item) => item.value === value);
  const [focusIndex, setFocusIndex] = useState(Math.max(selectedIndex, 0));
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  function move(to: number) {
    const next = (to + items.length) % items.length;
    setFocusIndex(next);
    refs.current[next]?.focus();
  }

  const style: CSSProperties | undefined =
    variant === "segment" && columns
      ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }
      : undefined;

  // Pad the last row so the grid's divider color never shows through an empty cell.
  const fillers =
    variant === "segment" && columns
      ? Array.from(
          { length: (columns - (items.length % columns)) % columns },
          (_, n) => n,
        )
      : [];

  return (
    <div
      role="radiogroup"
      aria-labelledby={labelledBy}
      aria-describedby={describedBy}
      style={style}
      className={cn(
        variant === "chip"
          ? "flex flex-wrap gap-2"
          : "grid gap-px overflow-hidden rounded-lg border bg-border",
      )}
      onKeyDown={(event) => {
        switch (event.key) {
          case "ArrowRight":
          case "ArrowDown":
            event.preventDefault();
            move(focusIndex + 1);
            break;
          case "ArrowLeft":
          case "ArrowUp":
            event.preventDefault();
            move(focusIndex - 1);
            break;
          case "Home":
            event.preventDefault();
            move(0);
            break;
          case "End":
            event.preventDefault();
            move(items.length - 1);
            break;
          default:
            break;
        }
      }}
    >
      {items.map((item, index) => {
        const checked = item.value === value;
        return (
          <button
            key={item.value}
            ref={(node) => {
              refs.current[index] = node;
            }}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === focusIndex ? 0 : -1}
            disabled={disabled}
            autoFocus={autoFocus && index === focusIndex}
            onFocus={() => setFocusIndex(index)}
            onClick={() => onPick(item.value)}
            className={cn(
              "inline-flex min-h-11 min-w-0 min-w-11 items-center justify-center text-center text-base wrap-anywhere transition-colors duration-150 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset disabled:opacity-50",
              variant === "chip"
                ? "rounded-xl border bg-card px-4 py-2 hover:bg-accent focus-visible:ring-offset-0"
                : "bg-card px-1 hover:bg-accent",
              checked &&
                "border-brand-sky bg-accent font-medium text-accent-foreground",
              checked &&
                variant === "segment" &&
                "ring-2 ring-brand-sky ring-inset",
            )}
          >
            {item.label}
          </button>
        );
      })}
      {fillers.map((n) => (
        <div key={`filler-${n}`} aria-hidden className="bg-card" />
      ))}
    </div>
  );
}
