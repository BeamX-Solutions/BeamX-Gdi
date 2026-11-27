/**
 * Server only. Renders a Luna plan to PDF bytes (spec 0015, AC-2), ported from the
 * standalone's `luna-pdf/render.tsx`. The contents page needs each section's page
 * number, which react-pdf only knows after rendering, so the plan renders twice: once to
 * record the pages, once with them filled in.
 */
import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import { MarketingPlanPDF } from "./MarketingPlanPDF";
import type { Plan } from "./types";

type Doc = ReactElement<DocumentProps>;

export async function renderPlanToBuffer(
  plan: Plan,
  logoSrc?: string,
): Promise<Buffer> {
  const registry = new Map<string, number>();
  await renderToBuffer(
    (
      <MarketingPlanPDF plan={plan} logoSrc={logoSrc} registry={registry} />
    ) as Doc,
  );
  return renderToBuffer(
    (
      <MarketingPlanPDF
        plan={{ ...plan, tocPages: Object.fromEntries(registry) }}
        logoSrc={logoSrc}
      />
    ) as Doc,
  );
}
