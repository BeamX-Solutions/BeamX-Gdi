"use client";

import { useState } from "react";
import { AnswerCard } from "@/components/answer-cards/answer-card";
import { AnsweredBubble } from "@/components/answer-cards/answered-bubble";
import type {
  AnswerValue,
  QuestionProgress,
  QuestionView,
} from "@/components/answer-cards/types";

type QuestionDemoProps = {
  readonly question: QuestionView;
  readonly progress?: QuestionProgress;
  /** False shows the answered bubble with no Edit control. */
  readonly editable?: boolean;
  /** Called after an answer, for example to move focus to the composer. */
  readonly onAnswered?: () => void;
};

/**
 * The parent's job in miniature (feature #7 does it for real): show the card, collapse it
 * into a bubble once answered, and reopen it on Edit with the old answer selected.
 */
export function QuestionDemo({
  question,
  progress,
  editable = true,
  onAnswered,
}: QuestionDemoProps) {
  const [answer, setAnswer] = useState<AnswerValue | null>(null);
  const [editing, setEditing] = useState(false);

  if (answer === null || editing) {
    return (
      <AnswerCard
        key={editing ? "editing" : "open"}
        question={question}
        progress={progress}
        initialValue={editing && answer !== null ? answer : undefined}
        onSubmit={(value) => {
          setAnswer(value);
          setEditing(false);
          onAnswered?.();
        }}
      />
    );
  }
  return (
    <AnsweredBubble
      question={question}
      value={answer}
      editable={editable}
      onEdit={() => setEditing(true)}
    />
  );
}
