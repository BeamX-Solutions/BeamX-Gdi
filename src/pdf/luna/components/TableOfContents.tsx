import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { BookmarkView } from "../primitives";
import { styles } from "../styles";
import { SECTIONS, type Plan } from "../types";

export const TableOfContents = ({ plan }: { plan: Plan }) => (
  <BookmarkView bookmark={{ title: "Contents" }}>
    <Text style={styles.eyebrow}>CONTENTS</Text>
    <Text style={styles.tocH}>What&apos;s Inside</Text>
    <View style={styles.secRule} />

    <View style={{ marginTop: 8 }}>
      {SECTIONS.map((s) => (
        <View key={s.id} style={styles.tocRow}>
          <Text style={styles.tocNum}>{s.num}</Text>
          <Text style={styles.tocTitle}>{s.title}</Text>
          <View style={styles.tocDots} />
          <Text style={styles.tocPage}>{plan.tocPages?.[s.id] ?? "—"}</Text>
        </View>
      ))}
    </View>

    <View style={styles.tocFoot}>
      <Text style={styles.tocFootEyebrow}>HOW TO USE THIS PLAN</Text>
      <Text style={styles.tocFootP}>
        Each section builds on the one before it. Start with the foundational
        moves in the{"\u00A0"}
        <Text style={styles.bold}>Implementation Roadmap</Text>, track progress
        against the{"\u00A0"}
        <Text style={styles.bold}>KPIs</Text>, and lean on the ready-to-use
        {"\u00A0"}
        <Text style={styles.bold}>Templates &amp; Tools</Text> to execute
        without reinventing anything.
      </Text>
    </View>
  </BookmarkView>
);
