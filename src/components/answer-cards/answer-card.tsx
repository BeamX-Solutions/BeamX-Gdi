"use client";

import { MultiChoiceCard } from "./multi-choice-card";
import { ScaleCard } from "./scale-card";
import { SingleChoiceCard } from "./single-choice-card";
import { TextCard } from "./text-card";
import type { AnswerValue, QuestionProgress, QuestionView } from "./types";

type AnswerCardProps = {
  readonly question: QuestionView;
  readonly progress?: QuestionProgress;
  /** The previous answer, when a card reopens for editing. Its control gets focus. */
  readonly initialValue?: AnswerValue;
  readonly onSubmit: (value: AnswerValue) => void;
  readonly disabled?: boolean;
};

/**
 * One card per question kind, from one `QuestionView`. It only reports `onSubmit`; the
 * parent decides whether a question shows as a card or as an answered bubble.
 */
export function AnswerCard({ question, ...rest }: AnswerCardProps) {
  switch (question.kind) {
    case "single":
      return <SingleChoiceCard question={question} {...rest} />;
    case "multi":
      return <MultiChoiceCard question={question} {...rest} />;
    case "scale":
      return <ScaleCard question={question} {...rest} />;
    case "text":
      return <TextCard question={question} {...rest} />;
    default: {
      const unreachable: never = question;
      return unreachable;
    }
  }
}
