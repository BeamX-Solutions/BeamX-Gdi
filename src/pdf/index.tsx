/**
 * Server only. Report PDFs (spec 0015): Luna's plan in the standalone's layout, every
 * other tool in the shared block layout. Called from routes through `assistant/`.
 */
import type { ReactElement } from "react";
import { renderToBuffer, type DocumentProps } from "@react-pdf/renderer";
import type { LunaContent } from "@/tools/luna/plan";
import type { ReportBlock } from "@/tools/registry";
import { pdfAssets } from "./assets";
import { renderPlanToBuffer } from "./luna/render";
import { lunaPlan, type PlanFacts } from "./luna-plan";
import { ReportPDF } from "./report/ReportPDF";

export type PdfInput =
  | {
      readonly kind: "luna";
      readonly content: LunaContent;
      readonly facts: PlanFacts;
    }
  | {
      readonly kind: "blocks";
      readonly toolName: string;
      readonly business: string | null;
      readonly date: string;
      readonly blocks: readonly ReportBlock[];
    };

export const reportPdf = async (input: PdfInput): Promise<Buffer> => {
  const { logo } = pdfAssets();
  switch (input.kind) {
    case "luna":
      return renderPlanToBuffer(lunaPlan(input.content, input.facts), logo);
    case "blocks":
      return renderToBuffer(
        (
          <ReportPDF
            toolName={input.toolName}
            business={input.business}
            date={input.date}
            blocks={input.blocks}
            logo={logo}
          />
        ) as ReactElement<DocumentProps>,
      );
    default: {
      const unreachable: never = input;
      return unreachable;
    }
  }
};
