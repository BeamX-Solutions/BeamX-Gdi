"use client";

import { useId, useState } from "react";
import { CardFrame } from "./card-frame";
import { RadioChips } from "./radio-chips";
import { scaleColumns } from "./scale";
import type { AnswerValue, QuestionProgress, QuestionView } from "./types";

type Props = {
  readonly question: Extract<QuestionView, { kind: "scale" }>;
  readonly progress?: QuestionProgress;
  readonly initialValue?: AnswerValue;
  readonly onSubmit: (value: AnswerValue) => void;
  readonly disabled?: boolean;
};

/** Numbered segments from `min` to `max` with end labels; one tap picks and sends. */
export function ScaleCard({
  question,
  progress,
  initialValue,
  onSubmit,
  disabled,
}: Props) {
  const promptId = useId();
  const [picked, setPicked] = useState<string | null>(
    typeof initialValue === "number" ? String(initialValue) : null,
  );
  const points = Math.max(question.max - question.min + 1, 0);
  const items = Array.from({ length: points }, (_, i) => {
    const n = question.min + i;
    return { value: String(n), label: String(n) };
  });

  return (
    <CardFrame
      promptId={promptId}
      prompt={question.prompt}
      help={question.help}
      progress={progress}
    >
      <div className="-mx-2 flex flex-col gap-2">
        <RadioChips
          variant="segment"
          columns={scaleColumns(points)}
          items={items}
          value={picked}
          labelledBy={promptId}
          disabled={disabled}
          autoFocus={initialValue !== undefined}
          onPick={(value) => {
            setPicked(value);
            onSubmit(Number(value));
          }}
        />
        <div className="flex justify-between gap-4 px-1 text-sm text-muted-foreground">
          <span className="min-w-0 wrap-anywhere">
            {question.min}: {question.minLabel}
          </span>
          <span className="min-w-0 text-right wrap-anywhere">
            {question.max}: {question.maxLabel}
          </span>
        </div>
      </div>
    </CardFrame>
  );
}
