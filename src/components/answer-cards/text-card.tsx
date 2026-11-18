"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CardFrame } from "./card-frame";
import { formatNumber } from "./format-answer";
import { validateTextAnswer } from "./validate";
import type { AnswerValue, QuestionProgress, TextQuestion } from "./types";

type Props = {
  readonly question: TextQuestion;
  readonly progress?: QuestionProgress;
  readonly initialValue?: AnswerValue;
  readonly onSubmit: (value: AnswerValue) => void;
  readonly disabled?: boolean;
};

const startText = (question: TextQuestion, value?: AnswerValue): string => {
  if (value === undefined || Array.isArray(value)) return "";
  return question.input === "text" || typeof value === "string"
    ? String(value)
    : formatNumber(value as number);
};

/** A text, number, or naira field with a Submit button. Validated on submit, not while typing. */
export function TextCard({
  question,
  progress,
  initialValue,
  onSubmit,
  disabled,
}: Props) {
  const promptId = useId();
  const inputId = useId();
  const errorId = useId();
  const [raw, setRaw] = useState(startText(question, initialValue));
  const [error, setError] = useState<string | null>(null);
  const money = question.input === "money";

  function groupOnBlur() {
    if (question.input === "text") return;
    const result = validateTextAnswer(question, raw);
    if (result.ok && typeof result.value === "number") {
      setRaw(formatNumber(result.value));
    }
  }

  return (
    <CardFrame
      promptId={promptId}
      prompt={question.prompt}
      help={question.help}
      progress={progress}
    >
      <form
        noValidate
        className="flex flex-col gap-3"
        onSubmit={(event) => {
          event.preventDefault();
          const result = validateTextAnswer(question, raw);
          if (result.ok) {
            setError(null);
            onSubmit(result.value);
          } else {
            setError(result.error);
          }
        }}
      >
        <div className="relative">
          {money ? (
            <span
              aria-hidden
              className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-base text-muted-foreground"
            >
              ₦
            </span>
          ) : null}
          <Input
            id={inputId}
            type="text"
            inputMode={
              money
                ? "numeric"
                : question.input === "number"
                  ? "decimal"
                  : "text"
            }
            enterKeyHint="done"
            autoComplete="off"
            value={raw}
            placeholder={question.placeholder}
            disabled={disabled}
            autoFocus={initialValue !== undefined}
            aria-labelledby={promptId}
            aria-describedby={error ? errorId : undefined}
            aria-invalid={error ? true : undefined}
            className={money ? "pl-8" : undefined}
            onChange={(event) => setRaw(event.target.value)}
            onBlur={groupOnBlur}
          />
        </div>
        {error ? (
          <p
            id={errorId}
            role="alert"
            className="text-sm font-medium text-destructive"
          >
            {error}
          </p>
        ) : null}
        <Button type="submit" className="self-start" disabled={disabled}>
          Submit
        </Button>
      </form>
    </CardFrame>
  );
}
