import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "./styles";
import { theme } from "./theme";
import { RT } from "./richText";
import type {
  Stage,
  RiskItem,
  PhaseItem,
  KpiRow,
  TemplateItem,
  InvestmentItem,
  Severity,
  StageTone,
} from "./types";

const stageColor: Record<StageTone, string> = {
  before: theme.navyDeep,
  during: theme.blueMid,
  after: theme.blue,
};

export const StageCard = ({ stage }: { stage: Stage }) => (
  <View style={styles.stage} wrap={false}>
    <View
      style={[styles.stageBar, { backgroundColor: stageColor[stage.tone] }]}
    >
      <Text style={styles.stageTag}>
        {stage.tag}
        <Text style={styles.stageSub}> {stage.sub}</Text>
      </Text>
      <Text style={styles.stageStep}>{stage.step}</Text>
    </View>
    <View style={styles.stageBody}>
      {stage.columns.map((c, i) => (
        <View
          key={i}
          style={[styles.stageCol, i > 0 ? styles.stageColDivider : {}]}
        >
          <Text style={styles.stageColH}>{c.heading}</Text>
          <Text style={styles.stageColP}>
            <RT>{c.body}</RT>
          </Text>
        </View>
      ))}
    </View>
  </View>
);

const sevBg: Record<Severity, string> = {
  high: theme.orange,
  medhigh: "#E8A33D",
  med: theme.blue,
};
const sevLabel: Record<Severity, string> = {
  high: "High",
  medhigh: "Med-High",
  med: "Medium",
};

export const RiskRow = ({ risk }: { risk: RiskItem }) => (
  <View style={styles.risk} wrap={false}>
    <View style={[styles.sev, { backgroundColor: sevBg[risk.severity] }]}>
      <Text style={styles.sevText}>{sevLabel[risk.severity]}</Text>
    </View>
    <Text style={styles.riskText}>
      <Text style={styles.bold}>{risk.label + "\u00A0"}</Text>
      <RT>{risk.body}</RT>
    </Text>
  </View>
);

export const Phase = ({ phase }: { phase: PhaseItem }) => (
  <View style={styles.phase} wrap={false}>
    <View style={styles.phaseLine} />
    <View style={styles.phaseTag}>
      <Text style={styles.phaseN}>{phase.code}</Text>
      <Text style={styles.phaseT}>{phase.title}</Text>
      <Text style={styles.phaseD}>{phase.when}</Text>
    </View>
    {phase.steps.map((s, i) => (
      <View key={i} style={styles.stepRow}>
        <View style={styles.stepDot} />
        <Text style={styles.stepText}>
          <RT>{s}</RT>
        </Text>
      </View>
    ))}
  </View>
);

export const KpiTable = ({ rows }: { rows: KpiRow[] }) => (
  <View style={styles.table}>
    <View style={styles.tHead}>
      <Text style={[styles.tHcell, { width: "30%" }]}>METRIC</Text>
      <Text style={[styles.tHcell, { width: "42%" }]}>
        HOW IT&apos;S TRACKED
      </Text>
      <Text style={[styles.tHcell, { width: "28%" }]}>TARGET</Text>
    </View>
    {rows.map((r, i) => (
      <View
        key={i}
        style={[
          styles.tRow,
          i % 2 === 1 ? { backgroundColor: theme.tint } : {},
        ]}
        wrap={false}
      >
        <Text style={[styles.tCell, styles.tMetric, { width: "30%" }]}>
          {r.metric}
        </Text>
        <Text style={[styles.tCell, { width: "42%" }]}>{r.tracked}</Text>
        <Text style={[styles.tCell, styles.tTarget, { width: "28%" }]}>
          {r.target}
        </Text>
      </View>
    ))}
  </View>
);

export const TemplateCard = ({ card }: { card: TemplateItem }) => (
  // No wrap={false}: a long card may break across pages instead of overflowing
  // its box. The header row stays intact so the number/title never split.
  <View style={styles.tcard}>
    <View style={styles.tcardHead} wrap={false}>
      <View style={styles.tcardNum}>
        <Text style={styles.tcardNumText}>{card.index}</Text>
      </View>
      <Text style={[styles.tcardTitle, { flex: 1 }]}>{card.title}</Text>
      {card.meta ? <Text style={styles.tcardMeta}>{card.meta}</Text> : null}
    </View>
    <Text style={styles.tcardBody}>
      <RT>{card.body}</RT>
    </Text>
  </View>
);

export const RoiRow = ({ item }: { item: InvestmentItem }) => {
  const orange = item.accent === "orange";
  return (
    <View style={styles.roiRow} wrap={false}>
      <View style={[styles.roiBadge, orange ? styles.roiBadgeOrange : {}]}>
        <Text
          style={[
            styles.roiBadgeText,
            orange ? { color: theme.orangeText } : {},
          ]}
        >
          {item.badge}
        </Text>
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.roiTitle}>{item.title}</Text>
        <Text style={styles.roiBody}>
          <RT>{item.body}</RT>
        </Text>
      </View>
    </View>
  );
};
