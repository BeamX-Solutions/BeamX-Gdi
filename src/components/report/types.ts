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

export type SkeletonStepState = "pending" | "active" | "done";

export type SkeletonStep = {
  readonly label: string;
  readonly state: SkeletonStepState;
};
