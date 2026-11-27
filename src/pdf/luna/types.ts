import type { Accent } from "./theme";

/**
 * The data contract between Luna and the PDF. The backend emits a `Plan`
 * (string fields support **bold** markers via the rich-text renderer) and the
 * document fills itself in. Nothing about layout lives in here.
 */

export type Severity = "high" | "medhigh" | "med";
export type StageTone = "before" | "during" | "after";

export interface StatItem {
  value: string; // e.g. "₦500K–₦2M"
  label: string; // e.g. "AVERAGE CLIENT VALUE"
  accent?: Accent;
}

export interface CalloutData {
  title: string; // shown uppercase
  body: string; // supports **bold**
  accent?: Accent; // "orange" tints the box
}

export interface StageColumn {
  heading: string;
  body: string; // supports **bold**
}

export interface Stage {
  tag: string; // BEFORE / DURING / AFTER
  sub: string; // Prospects / Leads / Customers
  step: string; // ATTRACT / CONVERT / RETAIN & GROW
  tone: StageTone;
  columns: StageColumn[];
}

export interface RiskItem {
  severity: Severity;
  label: string; // bolded lead-in
  body: string; // supports **bold**
}

export interface PhaseItem {
  code: string; // "PHASE 01"
  title: string; // "Foundation"
  when: string; // "First 30 Days"
  steps: string[]; // supports **bold**
}

export interface ResourceItem {
  label: string; // bolded lead-in, e.g. "Website:"
  body: string; // supports **bold**
}

export interface KpiRow {
  metric: string;
  tracked: string;
  target: string;
}

export interface TemplateItem {
  index: string; // "1".."4"
  title: string;
  meta: string; // "GOOGLE DOCS"
  body: string; // supports **bold**
}

export interface InvestmentItem {
  badge: string; // two-line text, use "\n" to break
  title: string;
  body: string; // supports **bold**
  accent?: Accent;
}

export interface Plan {
  business: string;
  industry: string;
  model: string;
  date: string;

  executiveSummary: {
    stats: StatItem[];
    paragraphs: string[]; // supports **bold**
    callout: CalloutData;
  };
  customerJourney: {
    intro: string;
    stages: Stage[];
  };
  strategicInsights: {
    strengths: string[]; // supports **bold**
    opportunities: string[];
  };
  risksPositioning: {
    risks: RiskItem[];
    positioning: string; // supports **bold**
    callout: CalloutData;
  };
  implementation: {
    intro: string;
    phases: PhaseItem[];
  };
  resources: {
    intro: string;
    stats: StatItem[];
    items: ResourceItem[];
    callout: CalloutData;
  };
  kpis: {
    intro: string;
    rows: KpiRow[];
    note: string; // supports **bold**
  };
  templates: {
    intro: string;
    cards: TemplateItem[];
  };
  investmentRoi: {
    intro: string;
    investments: InvestmentItem[];
    callout: CalloutData;
  };
  nextSteps: {
    steps: string[];
    note: string; // supports **bold**
  };

  /** Filled automatically by the two-pass renderer. Leave undefined. */
  tocPages?: Record<string, number>;
}

/**
 * Single source of truth for the contents list, the section anchors, and the
 * PDF outline. Order here is the order sections render in.
 */
export const SECTIONS = [
  { id: "executiveSummary", num: "01", title: "Executive Summary" },
  { id: "customerJourney", num: "02", title: "The Customer Journey" },
  { id: "strategicInsights", num: "03", title: "Strategic Insights" },
  { id: "implementation", num: "04", title: "Implementation Roadmap" },
  { id: "resources", num: "05", title: "Resources & Budget" },
  { id: "kpis", num: "06", title: "Key Performance Indicators" },
  { id: "templates", num: "07", title: "Templates & Tools" },
  { id: "investmentRoi", num: "08", title: "Investment & ROI" },
] as const;

export type SectionId = (typeof SECTIONS)[number]["id"];
