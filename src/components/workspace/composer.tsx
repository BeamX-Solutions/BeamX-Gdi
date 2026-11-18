"use client";

import { ArrowUpIcon } from "lucide-react";
import {
  useId,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type Ref,
} from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  canSend,
  counterText,
  DEFAULT_MAX_LENGTH,
  enterShouldSend,
  showCounter,
} from "./composer-rules";

export type ComposerHandle = { readonly focus: () => void };

type ComposerProps = {
  /** Called with the trimmed text. What it means (an answer, a side question) is the caller's call. */
  readonly onSend: (text: string) => void;
  /** Small helper text above the field, like "Or type your answer". */
  readonly hint?: string;
  readonly disabled?: boolean;
  readonly maxLength?: number;
  /** Lets the parent move focus here, for example after an answer card is answered. */
  readonly ref?: Ref<ComposerHandle>;
};

/**
 * The message box. Grows with its text up to 6 lines; Enter sends on desktop and adds a
 * line on touch screens; Send is off for empty or over long text (AC-7). Text is 16px so
 * phones do not zoom in. It pads for the phone's safe area.
 */
export function Composer({
  onSend,
  hint,
  disabled = false,
  maxLength = DEFAULT_MAX_LENGTH,
  ref,
}: ComposerProps) {
  const [text, setText] = useState("");
  const localRef = useRef<HTMLTextAreaElement | null>(null);
  useImperativeHandle(
    ref,
    () => ({ focus: () => localRef.current?.focus() }),
    [],
  );
  const hintId = useId();
  const counterId = useId();

  // Auto grow: reset, then fit the content. `max-h-40` (6 lines of 24px plus padding) caps it.
  useLayoutEffect(() => {
    const el = localRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  const sendable = !disabled && canSend(text, maxLength);
  const counting = showCounter(text, maxLength);
  const overLimit = text.length > maxLength;

  function send() {
    if (!sendable) return;
    onSend(text.trim());
    setText("");
  }

  const describedBy =
    [hint ? hintId : null, counting ? counterId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <form
      className="shrink-0 px-3 pt-2 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
    >
      {hint ? (
        <p id={hintId} className="px-1 pb-1.5 text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
      <div className="flex items-end gap-2 rounded-xl border bg-card p-1.5 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50">
        <textarea
          ref={localRef}
          rows={1}
          value={text}
          disabled={disabled}
          aria-label="Message"
          aria-describedby={describedBy}
          aria-invalid={overLimit || undefined}
          placeholder="Message BeamX"
          className="max-h-40 min-h-11 min-w-0 flex-1 resize-none bg-transparent px-2.5 py-2.5 text-base leading-6 text-foreground outline-none placeholder:text-muted-foreground disabled:opacity-50"
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            const coarsePointer =
              window.matchMedia("(pointer: coarse)").matches;
            if (
              enterShouldSend({
                key: event.key,
                shiftKey: event.shiftKey,
                isComposing: event.nativeEvent.isComposing,
                coarsePointer,
              })
            ) {
              event.preventDefault();
              send();
            }
          }}
        />
        <Button
          type="submit"
          size="icon"
          disabled={!sendable}
          aria-label="Send"
          className="rounded-lg"
        >
          <ArrowUpIcon aria-hidden />
        </Button>
      </div>
      {counting ? (
        <p
          id={counterId}
          className={cn(
            "px-1 pt-1.5 text-right text-base",
            overLimit
              ? "font-medium text-destructive"
              : "text-muted-foreground",
          )}
        >
          {counterText(text, maxLength)}
        </p>
      ) : null}
    </form>
  );
}
