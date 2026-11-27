import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "../styles";
import { RT } from "../richText";
import {
  Anchor,
  SectionHead,
  SubHead,
  Stat,
  Callout,
  InsightList,
  Check,
  NoteBar,
  BookmarkView,
} from "../primitives";
import {
  StageCard,
  RiskRow,
  Phase,
  KpiTable,
  TemplateCard,
  RoiRow,
} from "../blocks";
import type { Plan } from "../types";

type Props = { plan: Plan; registry?: Map<string, number> };

/** Wrapper: forces a page break, registers the PDF outline + the anchor. */
const Section = ({
  id,
  bookmark,
  registry,
  children,
}: {
  id?: string;
  bookmark: string;
  registry?: Map<string, number>;
  children: React.ReactNode;
}) => (
  <BookmarkView break bookmark={{ title: bookmark }}>
    {id ? <Anchor id={id} registry={registry} /> : null}
    {children}
  </BookmarkView>
);

/* ===================================================== 01 Executive Summary */
export const ExecutiveSummary = ({ plan, registry }: Props) => {
  const d = plan.executiveSummary;
  return (
    <Section
      id="executiveSummary"
      bookmark="Executive Summary"
      registry={registry}
    >
      <SectionHead num="01" eyebrow="OVERVIEW" title="Executive Summary" />
      <View style={styles.statRow}>
        {d.stats.map((s, i) => (
          <Stat key={i} {...s} />
        ))}
      </View>
      {d.paragraphs.map((p, i) => (
        <Text key={i} style={i === 0 ? styles.lead : styles.p}>
          <RT>{p}</RT>
        </Text>
      ))}
      <Callout {...d.callout} />
    </Section>
  );
};

/* ===================================================== 02 Customer Journey */
export const CustomerJourney = ({ plan, registry }: Props) => {
  const d = plan.customerJourney;
  return (
    <Section
      id="customerJourney"
      bookmark="The Customer Journey"
      registry={registry}
    >
      <SectionHead
        num="02"
        eyebrow="ACQUISITION FRAMEWORK"
        title="The Customer Journey"
      />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      <View style={{ gap: 14 }}>
        {d.stages.map((s, i) => (
          <StageCard key={i} stage={s} />
        ))}
      </View>
    </Section>
  );
};

/* ===================================================== 03 Strategic Insights */
export const StrategicInsights = ({ plan, registry }: Props) => {
  const d = plan.strategicInsights;
  return (
    <Section
      id="strategicInsights"
      bookmark="Strategic Insights"
      registry={registry}
    >
      <SectionHead
        num="03"
        eyebrow="SITUATION ANALYSIS"
        title="Strategic Insights"
      />
      <SubHead>Key Strengths</SubHead>
      <InsightList items={d.strengths} />
      <SubHead>Market Opportunities</SubHead>
      <InsightList items={d.opportunities} accent="orange" />
    </Section>
  );
};

/* (still section 03 — Risks & Positioning, second page, no TOC entry) */
export const RisksPositioning = ({ plan }: Props) => {
  const d = plan.risksPositioning;
  return (
    <Section bookmark="Risks & Positioning">
      <SectionHead
        num="03"
        eyebrow="SITUATION ANALYSIS"
        title="Risks & Positioning"
      />
      <SubHead>Key Risks &amp; Mitigation</SubHead>
      <View>
        {d.risks.map((r, i) => (
          <RiskRow key={i} risk={r} />
        ))}
      </View>
      <SubHead>Recommended Positioning</SubHead>
      <Text style={styles.p}>
        <RT>{d.positioning}</RT>
      </Text>
      <Callout {...d.callout} />
    </Section>
  );
};

/* ===================================================== 04 Implementation */
export const Implementation = ({ plan, registry }: Props) => {
  const d = plan.implementation;
  return (
    <Section
      id="implementation"
      bookmark="Implementation Roadmap"
      registry={registry}
    >
      <SectionHead
        num="04"
        eyebrow="EXECUTION PLAN"
        title="Implementation Roadmap"
      />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      {d.phases.map((p, i) => (
        <Phase key={i} phase={p} />
      ))}
    </Section>
  );
};

/* ===================================================== 05 Resources & Budget */
export const Resources = ({ plan, registry }: Props) => {
  const d = plan.resources;
  return (
    <Section id="resources" bookmark="Resources & Budget" registry={registry}>
      <SectionHead num="05" eyebrow="OPERATIONS" title="Resources & Budget" />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      <View style={styles.statRow}>
        {d.stats.map((s, i) => (
          <Stat key={i} {...s} />
        ))}
      </View>
      <SubHead>Required Resources</SubHead>
      {d.items.map((it, i) => (
        <View key={i} style={styles.chkRow}>
          <Check />
          <Text style={styles.chkText}>
            <Text style={styles.bold}>{it.label + "\u00A0"}</Text>
            <RT>{it.body}</RT>
          </Text>
        </View>
      ))}
      <Callout {...d.callout} />
    </Section>
  );
};

/* ===================================================== 06 KPIs */
export const Kpis = ({ plan, registry }: Props) => {
  const d = plan.kpis;
  return (
    <Section
      id="kpis"
      bookmark="Key Performance Indicators"
      registry={registry}
    >
      <SectionHead
        num="06"
        eyebrow="MEASUREMENT"
        title="Key Performance Indicators"
      />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      <KpiTable rows={d.rows} />
      <NoteBar>
        <RT>{d.note}</RT>
      </NoteBar>
    </Section>
  );
};

/* ===================================================== 07 Templates */
export const Templates = ({ plan, registry }: Props) => {
  const d = plan.templates;
  return (
    <Section id="templates" bookmark="Templates & Tools" registry={registry}>
      <SectionHead num="07" eyebrow="READY TO USE" title="Templates & Tools" />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      {d.cards.map((c, i) => (
        <TemplateCard key={i} card={c} />
      ))}
    </Section>
  );
};

/* ===================================================== 08 Investment & ROI */
export const InvestmentRoi = ({ plan, registry }: Props) => {
  const d = plan.investmentRoi;
  return (
    <Section id="investmentRoi" bookmark="Investment & ROI" registry={registry}>
      <SectionHead num="08" eyebrow="THE CASE" title="Investment & ROI" />
      <Text style={styles.lead}>
        <RT>{d.intro}</RT>
      </Text>
      <SubHead>Recommended Investments</SubHead>
      {d.investments.map((it, i) => (
        <RoiRow key={i} item={it} />
      ))}
      <Callout {...d.callout} />
    </Section>
  );
};

/* ===================================================== 09 Next Steps */
export const NextSteps = ({ plan }: Props) => {
  const d = plan.nextSteps;
  return (
    <Section bookmark="Next Steps">
      <SectionHead num="09" eyebrow="GET STARTED" title="Next Steps" />
      {d.steps.map((s, i) => (
        <View key={i} style={styles.nsRow}>
          <Text style={styles.nsNum}>{String(i + 1).padStart(2, "0")}</Text>
          <Text style={styles.nsText}>
            <RT>{s}</RT>
          </Text>
        </View>
      ))}
      <NoteBar>
        <RT>{d.note}</RT>
      </NoteBar>
    </Section>
  );
};
