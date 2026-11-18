"use client";

import { useId, useState } from "react";
import { CardFrame } from "./card-frame";
import { RadioChips } from "./radio-chips";
import type { AnswerValue, QuestionProgress, QuestionView } from "./types";

type Props = {
  readonly question: Extract<QuestionView, { kind: "single" }>;
  readonly progress?: QuestionProgress;
  readonly initialValue?: AnswerValue;
  readonly onSubmit: (value: AnswerValue) => void;
  readonly disabled?: boolean;
};

/** Chips; one tap picks and sends. */
export function SingleChoiceCard({
  question,
  progress,
  initialValue,
  onSubmit,
  disabled,
}: Props) {
  const promptId = useId();
  const [picked, setPicked] = useState<string | null>(
    typeof initialValue === "string" ? initialValue : null,
  );
  return (
    <CardFrame
      promptId={promptId}
      prompt={question.prompt}
      help={question.help}
      progress={progress}
    >
      <RadioChips
        variant="chip"
        items={question.options}
        value={picked}
        labelledBy={promptId}
        disabled={disabled}
        autoFocus={initialValue !== undefined}
        onPick={(value) => {
          setPicked(value);
          onSubmit(value);
        }}
      />
    </CardFrame>
  );
}
