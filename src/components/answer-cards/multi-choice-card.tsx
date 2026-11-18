"use client";

import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { CardFrame } from "./card-frame";
import { multiCanConfirm, multiHint } from "./validate";
import type { AnswerValue, QuestionProgress, QuestionView } from "./types";

type Props = {
  readonly question: Extract<QuestionView, { kind: "multi" }>;
  readonly progress?: QuestionProgress;
  readonly initialValue?: AnswerValue;
  readonly onSubmit: (value: AnswerValue) => void;
  readonly disabled?: boolean;
};

/** Checkboxes with a Confirm button: off until `min` picks, further picks blocked at `max`. */
export function MultiChoiceCard({
  question,
  progress,
  initialValue,
  onSubmit,
  disabled,
}: Props) {
  const promptId = useId();
  const hintId = useId();
  const baseId = useId();
  const [picked, setPicked] = useState<readonly string[]>(
    Array.isArray(initialValue) ? (initialValue as readonly string[]) : [],
  );
  const atMax = picked.length >= question.max;
  const firstPickedIndex = question.options.findIndex((o) =>
    picked.includes(o.value),
  );

  function toggle(value: string, checked: boolean) {
    setPicked((current) =>
      checked ? [...current, value] : current.filter((v) => v !== value),
    );
  }

  return (
    <CardFrame
      promptId={promptId}
      prompt={question.prompt}
      help={question.help}
      progress={progress}
    >
      <p id={hintId} className="text-sm text-muted-foreground">
        {multiHint(question)}
      </p>
      <div className="flex flex-col gap-2">
        {question.options.map((option, index) => {
          const checked = picked.includes(option.value);
          const blocked = disabled || (!checked && atMax);
          const id = `${baseId}-${index}`;
          return (
            <label
              key={option.value}
              htmlFor={id}
              className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-lg border bg-card px-3 py-2 text-base transition-colors duration-150 hover:bg-accent has-[button:disabled]:cursor-not-allowed has-[button:disabled]:opacity-60 has-[button[data-state=checked]]:border-brand-sky has-[button[data-state=checked]]:bg-accent"
            >
              <Checkbox
                id={id}
                checked={checked}
                disabled={blocked}
                aria-describedby={hintId}
                autoFocus={
                  initialValue !== undefined && index === firstPickedIndex
                }
                onCheckedChange={(state) =>
                  toggle(option.value, state === true)
                }
              />
              <span className="min-w-0 wrap-anywhere">{option.label}</span>
            </label>
          );
        })}
      </div>
      <Button
        type="button"
        className="self-start"
        disabled={disabled || !multiCanConfirm(question, picked.length)}
        onClick={() =>
          onSubmit(
            question.options
              .filter((o) => picked.includes(o.value))
              .map((o) => o.value),
          )
        }
      >
        Confirm
      </Button>
    </CardFrame>
  );
}
