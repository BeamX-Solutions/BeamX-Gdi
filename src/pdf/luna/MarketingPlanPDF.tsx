import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import { styles } from "./styles";
import { DEFAULT_LOGO_SRC } from "./theme";
import { ensureFonts } from "./fonts";
import { Footer } from "./primitives";
import { Cover } from "./components/Cover";
import { TableOfContents } from "./components/TableOfContents";
import {
  ExecutiveSummary,
  CustomerJourney,
  StrategicInsights,
  RisksPositioning,
  Implementation,
  Resources,
  Kpis,
  Templates,
  InvestmentRoi,
  NextSteps,
} from "./sections";
import type { Plan } from "./types";

export interface MarketingPlanPDFProps {
  plan: Plan;
  /** Logo path/URL. Defaults to /beamx-logo.png in your public dir. */
  logoSrc?: string;
  /** Used internally by the two-pass renderer to capture section page numbers. */
  registry?: Map<string, number>;
}

export function MarketingPlanPDF({
  plan,
  logoSrc = DEFAULT_LOGO_SRC,
  registry,
}: MarketingPlanPDFProps) {
  ensureFonts();
  return (
    <Document
      title={`Marketing Plan — ${plan.business}`}
      author="BeamX Solutions"
      creator="BeamX Luna"
      subject="Strategic Marketing Plan"
    >
      <Cover plan={plan} logoSrc={logoSrc} />

      <Page size="A4" style={styles.page}>
        <Footer business={plan.business} />

        <TableOfContents plan={plan} />

        <ExecutiveSummary plan={plan} registry={registry} />
        <CustomerJourney plan={plan} registry={registry} />
        <StrategicInsights plan={plan} registry={registry} />
        <RisksPositioning plan={plan} />
        <Implementation plan={plan} registry={registry} />
        <Resources plan={plan} registry={registry} />
        <Kpis plan={plan} registry={registry} />
        <Templates plan={plan} registry={registry} />
        <InvestmentRoi plan={plan} registry={registry} />
        <NextSteps plan={plan} />
      </Page>
    </Document>
  );
}

export default MarketingPlanPDF;
