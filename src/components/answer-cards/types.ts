import type { QuestionView } from "@/tools/_contract";

// Moved to the tool contract (spec 0005); re-exported so card imports stay put.
export type {
  AnswerValue,
  Option,
  QuestionProgress,
  QuestionView,
} from "@/tools/_contract";

export type TextQuestion = Extract<QuestionView, { kind: "text" }>;
export type MultiQuestion = Extract<QuestionView, { kind: "multi" }>;
