/**
 * The tool module contract (spec 0005). Every tool folder describes itself with these
 * types: plain data plus pure functions. Nothing here talks to the AI or the database.
 *
 * Tool folders may import only this file, `tools/_kit/`, `zod` and `@/lib/result`
 * (an ESLint rule enforces it).
 */
import type { z } from "zod";
import type { Result } from "@/lib/result";

// ---------------------------------------------------------------------------
// Questions and answers (moved here from components/answer-cards/types.ts)
// ---------------------------------------------------------------------------

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

/** Where a card sits in its run, shown above it ("Question 4 of 7"). Counts start at 1. */
export type QuestionProgress = {
  readonly area?: {
    readonly index: number;
    readonly total: number;
    readonly name: string;
  };
  readonly question: { readonly index: number; readonly total: number };
};

/** A text card's length limit when the question sets none. */
export const DEFAULT_TEXT_MAX = 200;

export type AnswerValue = string | number | readonly string[];

/** Question id to answer value. */
export type Answers = Readonly<Record<string, AnswerValue>>;

export type ToolQuestion = QuestionView & {
  /** Progress grouping (Luna squares, Beacon categories). */
  readonly area?: string;
  /** Pure. The question is hidden when this returns false. */
  readonly when?: (answers: Answers) => boolean;
  /** An extra rule after the card's own checks. Returns a short reason, or null when fine. */
  readonly refine?: (value: AnswerValue) => string | null;
  /** The profile fact this answer maps to (#9 uses it to skip facts already known). */
  readonly factKey?: string;
};

// ---------------------------------------------------------------------------
// Report blocks (the view model drawn by components/report/report-view.tsx)
// ---------------------------------------------------------------------------

export type Verdict = "good" | "caution" | "risk";

export type CategoryBarItem = {
  readonly label: string;
  readonly score: number;
  readonly max: number;
  /** Fills the bar with the verdict color. Without it the bar uses `--primary`. */
  readonly verdict?: Verdict;
};

export type AdvicePriority = "high" | "medium" | "low";

export type AdviceItem = {
  readonly title: string;
  readonly detail?: string;
  readonly priority: AdvicePriority;
};

export type ReportBlock =
  | {
      readonly kind: "score_header";
      readonly title: string;
      readonly score: number;
      readonly max: number;
      readonly verdict: Verdict;
      readonly summary: string;
    }
  | {
      readonly kind: "category_bars";
      readonly title: string;
      readonly items: readonly CategoryBarItem[];
    }
  | {
      readonly kind: "advice_list";
      readonly title: string;
      readonly items: readonly AdviceItem[];
    }
  | {
      readonly kind: "text";
      readonly title: string;
      readonly paragraphs: readonly string[];
    }
  | {
      readonly kind: "bullets";
      readonly title: string;
      readonly items: readonly string[];
    }
  | {
      readonly kind: "timeline";
      readonly title: string;
      readonly steps: readonly {
        readonly label: string;
        readonly items: readonly string[];
      }[];
    }
  | {
      readonly kind: "resources";
      readonly title: string;
      readonly items: readonly {
        readonly title: string;
        readonly description: string;
        readonly url: string | null;
      }[];
    };

// ---------------------------------------------------------------------------
// Report phases and modules
// ---------------------------------------------------------------------------

/** Model roles a phase may ask for. The runner maps each to a model id in `assistant/models.ts`. */
export const modelRoles = ["report"] as const;
export type ModelRole = (typeof modelRoles)[number];

export type PromptParts = {
  readonly instructions: string;
  readonly prompt: string;
};

export type ReportPhase = {
  /** Top level key in the report content. */
  readonly key: string;
  /** The skeleton step label, in plain words. */
  readonly label: string;
  readonly modelRole: ModelRole;
  /** Capped by the runner's global ceiling. */
  readonly maxOutputTokens: number;
  /** Per AI call. */
  readonly timeoutMs: number;
  /** What this phase must return. */
  readonly output: z.ZodType;
  readonly buildPrompt: (ctx: {
    /** Visible answers only. */
    readonly answers: Answers;
    /** Parsed by `scoresSchema`. */
    readonly scores: unknown;
    /** Outputs of the phases before this one, by phase key. */
    readonly earlier: Readonly<Record<string, unknown>>;
  }) => PromptParts;
};

export type ViewInput = {
  readonly scores: unknown;
  readonly content: unknown;
  readonly answers: Answers;
};

/** The read side of one tool version. */
export type ToolReader = {
  readonly questions: readonly ToolQuestion[];
  readonly scoresSchema: z.ZodType;
  readonly contentSchema: z.ZodType;
  readonly toView: (input: ViewInput) => readonly ReportBlock[];
};

export type ScoreError = {
  readonly code: "incomplete";
  readonly missing: readonly string[];
};

export type ToolModule = ToolReader & {
  /** Stored as `tool_run.tool_id`. Never changes. */
  readonly id: string;
  /** Stored as `tool_run.tool_version`. */
  readonly version: string;
  /** Shown to clients. */
  readonly name: string;
  /** One line for clients. */
  readonly summary: string;
  /** One sentence for the model, used for routing (#6). */
  readonly whenToUse: string;
  /** Positive integer credits (spec 0004). */
  readonly creditPrice: number;
  readonly score: (answers: Answers) => Result<unknown, ScoreError>;
  /** At least one. */
  readonly phases: readonly ReportPhase[];
  /** Frozen read sides of older versions, by version. */
  readonly readers?: Readonly<Record<string, ToolReader>>;
};

// ---------------------------------------------------------------------------
// Typed definitions, erased by defineTool / defineReader
// ---------------------------------------------------------------------------

export type TypedPhase<S> = Omit<ReportPhase, "buildPrompt"> & {
  readonly buildPrompt: (ctx: {
    readonly answers: Answers;
    readonly scores: S;
    readonly earlier: Readonly<Record<string, unknown>>;
  }) => PromptParts;
};

export type TypedReader<S, C> = {
  readonly questions: readonly ToolQuestion[];
  readonly scoresSchema: z.ZodType<S>;
  readonly contentSchema: z.ZodType<C>;
  readonly toView: (input: {
    readonly scores: S;
    readonly content: C;
    readonly answers: Answers;
  }) => readonly ReportBlock[];
};

export type TypedTool<S, C> = TypedReader<S, C> & {
  readonly id: string;
  readonly version: string;
  readonly name: string;
  readonly summary: string;
  readonly whenToUse: string;
  readonly creditPrice: number;
  readonly score: (answers: Answers) => Result<S, ScoreError>;
  readonly phases: readonly [TypedPhase<S>, ...TypedPhase<S>[]];
  readonly readers?: Readonly<Record<string, ToolReader>>;
};

/**
 * Thrown only on a programming error: a caller handed a reader data it did not parse
 * with that reader's schemas first. Callers parse stored data before calling `toView`
 * or `buildPrompt`, and turn a failed parse into `stored_data_invalid`.
 */
const unparsed = (what: string, error: z.ZodError): never => {
  throw new Error(`${what} was not parsed with the tool's schema first`, {
    cause: error,
  });
};

const parseWith = <T>(
  schema: z.ZodType<T>,
  value: unknown,
  what: string,
): T => {
  const parsed = schema.safeParse(value);
  return parsed.success ? parsed.data : unparsed(what, parsed.error);
};

/** Erases a typed reader into the uniform `ToolReader` the registry holds. */
export const defineReader = <S, C>(def: TypedReader<S, C>): ToolReader => ({
  questions: def.questions,
  scoresSchema: def.scoresSchema,
  contentSchema: def.contentSchema,
  toView: (input) =>
    def.toView({
      scores: parseWith(def.scoresSchema, input.scores, "scores"),
      content: parseWith(def.contentSchema, input.content, "content"),
      answers: input.answers,
    }),
});

/**
 * Takes a typed module (scores type `S`, content type `C`) and returns the erased
 * `ToolModule`, so each tool is fully typed inside its folder and the registry holds
 * one uniform type.
 */
export const defineTool = <S, C>(def: TypedTool<S, C>): ToolModule => ({
  ...defineReader(def),
  id: def.id,
  version: def.version,
  name: def.name,
  summary: def.summary,
  whenToUse: def.whenToUse,
  creditPrice: def.creditPrice,
  score: def.score,
  phases: def.phases.map((phase): ReportPhase => ({
    ...phase,
    buildPrompt: (ctx) =>
      phase.buildPrompt({
        answers: ctx.answers,
        scores: parseWith(def.scoresSchema, ctx.scores, "scores"),
        earlier: ctx.earlier,
      }),
  })),
  ...(def.readers ? { readers: def.readers } : {}),
});
