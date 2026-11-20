import type { QuestionView } from "@/tools/_contract";

// Moved to the tool contract (spec 0005); re-exported so card imports stay put.
export type { AnswerValue, Option, QuestionView } from "@/tools/_contract";

export type QuestionProgress = {
  readonly area?: {
    readonly index: number;
    readonly total: number;
    readonly name: string;
  };
  readonly question: { readonly index: number; readonly total: number };
};

export type TextQuestion = Extract<QuestionView, { kind: "text" }>;
export type MultiQuestion = Extract<QuestionView, { kind: "multi" }>;
