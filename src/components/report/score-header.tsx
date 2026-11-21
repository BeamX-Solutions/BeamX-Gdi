import type { Verdict } from "./types";
import { VerdictBadge } from "./verdict-badge";

type ScoreHeaderProps = {
  readonly score: number;
  readonly max: number;
  readonly verdict: Verdict;
  readonly verdictLabel: string;
  readonly summary: string;
};

/** The top of a report: the score as a whole number over its max, the verdict, a summary. */
export function ScoreHeader({
  score,
  max,
  verdict,
  verdictLabel,
  summary,
}: ScoreHeaderProps) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-4xl font-semibold">
          {Math.round(score)}
          <span className="text-xl font-medium text-muted-foreground">
            /{max}
          </span>
        </p>
        <VerdictBadge
          verdict={verdict}
          label={verdictLabel}
          className="px-3 py-1 text-sm"
        />
      </div>
      <p className="text-base wrap-anywhere">{summary}</p>
    </div>
  );
}
