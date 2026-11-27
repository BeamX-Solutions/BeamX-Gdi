import React from "react";
import {
  Page,
  View,
  Text,
  Image,
  Svg,
  Rect,
  Line,
  Defs,
  LinearGradient,
  Stop,
} from "@react-pdf/renderer";
import { styles } from "../styles";
import { theme, PAGE_W } from "../theme";
import type { Plan } from "../types";

export const Cover = ({ plan, logoSrc }: { plan: Plan; logoSrc: string }) => (
  <Page size="A4" style={styles.coverPage}>
    {/* top brand band + orange accent */}
    <Svg
      width={PAGE_W}
      height={43}
      style={{ position: "absolute", top: 0, left: 0 }}
    >
      <Defs>
        <LinearGradient id="band" x1="0" y1="0" x2="1" y2="0">
          <Stop offset="0" stopColor={theme.navyDeep} />
          <Stop offset="0.55" stopColor={theme.navy} />
          <Stop offset="1" stopColor={theme.blue} />
        </LinearGradient>
      </Defs>
      <Rect x={0} y={0} width={PAGE_W} height={40} fill="url(#band)" />
      <Rect x={0} y={40} width={PAGE_W * 0.38} height={3} fill={theme.orange} />
    </Svg>

    {/* X-stroke motif echoing the logo */}
    <Svg
      width={320}
      height={815}
      style={{ position: "absolute", top: 0, right: 0, opacity: 0.1 }}
    >
      <Line
        x1={95}
        y1={0}
        x2={320}
        y2={690}
        stroke={theme.navy}
        strokeWidth={9}
      />
      <Line
        x1={150}
        y1={0}
        x2={320}
        y2={510}
        stroke={theme.blue}
        strokeWidth={6}
      />
      <Line
        x1={205}
        y1={0}
        x2={320}
        y2={370}
        stroke={theme.orange}
        strokeWidth={6}
      />
      <Line
        x1={320}
        y1={95}
        x2={120}
        y2={842}
        stroke={theme.navy}
        strokeWidth={9}
      />
    </Svg>

    <View style={styles.coverInner}>
      <View style={styles.coverTop}>
        {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
        <Image src={logoSrc} style={{ height: 34 }} />
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.coverProdEyebrow}>POWERED BY</Text>
          <Text style={styles.coverProdName}>BeamX Luna</Text>
        </View>
      </View>

      <View style={styles.coverMid}>
        <Text style={styles.coverKicker}>STRATEGIC GROWTH BLUEPRINT</Text>
        <Text style={styles.coverTitle}>Marketing{"\n"}Plan</Text>
        <View style={styles.coverAccent} />
        <Text style={styles.coverSub}>
          {`A complete, 180-day acquisition and growth strategy engineered for ${plan.business}.`}
        </Text>
      </View>

      <View>
        <Text style={styles.coverBizLbl}>PREPARED FOR</Text>
        <Text style={styles.coverBizName}>{plan.business}</Text>
        <View style={styles.coverChips}>
          <View style={styles.chip}>
            <Text style={styles.chipLbl}>INDUSTRY</Text>
            <Text style={styles.chipVal}>{plan.industry}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLbl}>BUSINESS MODEL</Text>
            <Text style={styles.chipVal}>{plan.model}</Text>
          </View>
          <View style={styles.chip}>
            <Text style={styles.chipLbl}>GENERATED</Text>
            <Text style={styles.chipVal}>{plan.date}</Text>
          </View>
        </View>
        <View style={styles.coverFoot}>
          <Text style={styles.coverFootText}>
            BeamX Solutions{" "}
            <Text style={{ color: theme.orange, fontWeight: 800 }}>/</Text> Data
            Intelligence & AI Consulting
          </Text>
        </View>
      </View>
    </View>
  </Page>
);
