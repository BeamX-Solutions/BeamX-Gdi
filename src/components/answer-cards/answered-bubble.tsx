"use client";

import { formatAnswer } from "./format-answer";
import type { AnswerValue, QuestionView } from "./types";

type AnsweredBubbleProps = {
  readonly question: QuestionView;
  readonly value: AnswerValue;
  /** True until the run is scored. When false there is no Edit control. */
  readonly editable: boolean;
  readonly onEdit: () => void;
};

/** An answered card, collapsed into the user's reply bubble. */
export function AnsweredBubble({
  question,
  value,
  editable,
  onEdit,
}: AnsweredBubbleProps) {
  return (
    <div className="flex w-full min-w-0 flex-col items-end gap-1">
      <p className="max-w-[85%] min-w-0 rounded-xl bg-primary px-4 py-2.5 text-base wrap-anywhere text-primary-foreground">
        <span className="sr-only">Your answer: </span>
        {formatAnswer(question, value)}
      </p>
      {editable ? (
        <button
          type="button"
          onClick={onEdit}
          aria-label={`Edit answer: ${question.prompt}`}
          className="inline-flex min-h-6 items-center rounded-sm px-1 text-sm font-medium text-primary underline underline-offset-2 outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Edit
        </button>
      ) : null}
    </div>
  );
}
