"use client";

import { MessageResponse } from "@/components/ai-elements/message";
import { Shimmer } from "@/components/ai-elements/shimmer";

type ReportSectionProps = {
  readonly title: string;
  readonly markdown: string;
  /** True while the text is still arriving: sets `aria-busy` and shows a shimmer. */
  readonly streaming?: boolean;
};

/** A long written part of a report. Markdown, safe (no raw HTML), and it can stream. */
export function ReportSection({
  title,
  markdown,
  streaming = false,
}: ReportSectionProps) {
  return (
    <section
      aria-label={title}
      aria-busy={streaming}
      className="flex min-w-0 flex-col gap-2"
    >
      <h3 className="text-lg font-semibold wrap-anywhere">{title}</h3>
      <MessageResponse>{markdown}</MessageResponse>
      {streaming ? (
        <p className="text-sm" data-testid="section-shimmer">
          <Shimmer>Writing this section…</Shimmer>
        </p>
      ) : null}
    </section>
  );
}
