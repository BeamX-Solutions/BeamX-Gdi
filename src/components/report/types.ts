// Moved to the tool contract (spec 0005); re-exported so report imports stay put.
export type {
  AdviceItem,
  AdvicePriority,
  CategoryBarItem,
  ReportBlock,
  Verdict,
} from "@/tools/_contract";

export type SkeletonStepState = "pending" | "active" | "done";

export type SkeletonStep = {
  readonly label: string;
  readonly state: SkeletonStepState;
};
