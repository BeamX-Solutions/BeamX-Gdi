import type { ReactNode } from "react";
import type { ReportBlock } from "./types";
import { AdviceList } from "./advice-list";
import { CategoryBars } from "./category-bars";
import { ReportSection } from "./report-section";
import { ResourceList } from "./resource-list";
import { ScoreHeader } from "./score-header";
import { TimelineList } from "./timeline-list";
import { defaultVerdictLabel } from "./verdict";

function BlockFrame({
  title,
  children,
}: {
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3">
      <h3 className="text-lg font-semibold wrap-anywhere">{title}</h3>
      {children}
    </section>
  );
}

/** One block, drawn with the existing report parts. Text only, never HTML. */
function Block({ block }: { readonly block: ReportBlock }) {
  switch (block.kind) {
    case "score_header":
      return (
        <BlockFrame title={block.title}>
          <ScoreHeader
            score={block.score}
            max={block.max}
            verdict={block.verdict}
            verdictLabel={defaultVerdictLabel[block.verdict]}
            summary={block.summary}
          />
        </BlockFrame>
      );
    case "category_bars":
      return (
        <BlockFrame title={block.title}>
          <CategoryBars label={block.title} items={block.items} />
        </BlockFrame>
      );
    case "advice_list":
      return (
        <BlockFrame title={block.title}>
          <AdviceList label={block.title} items={block.items} />
        </BlockFrame>
      );
    case "text":
      return (
        <ReportSection title={block.title}>
          {block.paragraphs.map((paragraph, index) => (
            <p key={index} className="wrap-anywhere">
              {paragraph}
            </p>
          ))}
        </ReportSection>
      );
    case "bullets":
      return (
        <ReportSection title={block.title}>
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {block.items.map((item, index) => (
              <li key={index} className="wrap-anywhere">
                {item}
              </li>
            ))}
          </ul>
        </ReportSection>
      );
    case "timeline":
      return (
        <ReportSection title={block.title}>
          <TimelineList label={block.title} steps={block.steps} />
        </ReportSection>
      );
    case "resources":
      return (
        <ReportSection title={block.title}>
          <ResourceList label={block.title} items={block.items} />
        </ReportSection>
      );
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

/**
 * The one renderer for every tool's report (spec 0005): a tool's `toView` returns
 * blocks, and this draws them in order. The switch is exhaustive, so a new block kind
 * cannot be forgotten here.
 */
export function ReportView({
  blocks,
}: {
  readonly blocks: readonly ReportBlock[];
}) {
  return (
    <div className="flex min-w-0 flex-col gap-8" data-testid="report-view">
      {blocks.map((block, index) => (
        <Block key={`${index}-${block.kind}`} block={block} />
      ))}
    </div>
  );
}
