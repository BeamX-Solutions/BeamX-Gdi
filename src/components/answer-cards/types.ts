export type Option = { readonly value: string; readonly label: string };

export type QuestionView =
  | {
      readonly kind: "single";
      readonly id: string;
      readonly prompt: string;
      readonly help?: string;
      readonly options: readonly Option[];
    }
  | {
      readonly kind: "multi";
      readonly id: string;
      readonly prompt: string;
      readonly help?: string;
      readonly options: readonly Option[];
      readonly min: number;
      readonly max: number;
    }
  | {
      readonly kind: "scale";
      readonly id: string;
      readonly prompt: string;
      readonly help?: string;
      readonly min: number;
      readonly max: number;
      readonly minLabel: string;
      readonly maxLabel: string;
    }
  | {
      readonly kind: "text";
      readonly id: string;
      readonly prompt: string;
      readonly help?: string;
      readonly input: "text" | "number" | "money";
      readonly placeholder?: string;
      readonly maxLength?: number;
      readonly minValue?: number;
      readonly maxValue?: number;
    };

export type AnswerValue = string | number | readonly string[];

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
