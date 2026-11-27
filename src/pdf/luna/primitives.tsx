import React from "react";
import { View, Text, Svg, Circle, Path } from "@react-pdf/renderer";
import { styles } from "./styles";
import { theme, accentColor, type Accent } from "./theme";
import { RT } from "./richText";

/**
 * react-pdf 4.5.1 supports the `bookmark` prop on any node at runtime (it
 * builds the PDF outline) but only declares it on <Page> in its types. This
 * alias re-adds it to <View> so section outline entries stay type-safe.
 */
export type Bookmark =
  string | { title: string; expanded?: boolean; fit?: boolean };
export const BookmarkView = View as unknown as React.ComponentType<
  React.ComponentProps<typeof View> & { bookmark?: Bookmark }
>;

/* ----------------------------------------------------------------- icons */
export const Diamond = ({ color = theme.blue }: { color?: string }) => (
  <Svg width={9} height={9} style={{ marginTop: 4 }}>
    <Path d="M4.5 0.8 L8.2 4.5 L4.5 8.2 L0.8 4.5 Z" fill={color} />
  </Svg>
);

export const Check = () => (
  <Svg width={14} height={14} style={{ marginTop: 1.5 }}>
    <Circle cx={7} cy={7} r={7} fill={theme.navy} />
    <Path
      d="M3.8 7.2 L6 9.4 L10.4 5"
      stroke="#fff"
      strokeWidth={1.6}
      fill="none"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </Svg>
);

/* ---------------------------------------------------------- page anchor */
/**
 * Invisible marker. During the measure pass it records the page number it
 * lands on into `registry` (a Map). fontSize 0 keeps it out of the visible flow.
 */
export const Anchor = ({
  id,
  registry,
}: {
  id: string;
  registry?: Map<string, number>;
}) =>
  registry ? (
    <View
      style={{ height: 0 }}
      render={({ pageNumber }) => {
        registry.set(id, pageNumber);
        return null;
      }}
    />
  ) : null;

/* --------------------------------------------------------------- footer */
// A `fixed` element whose `render` returns null on some pages makes react-pdf
// compute a -Infinity box height for the fixed node, which crashes the PDF
// drawing layer ("unsupported number: -Infinity"). So the footer is a static
// fixed View (always present) and only the page-number leaf uses `render` —
// the canonical, stable react-pdf pattern. The cover is a separate <Page> with
// no footer, so there's nothing to hide on page one.
export const Footer = ({ business }: { business: string }) => (
  <View style={styles.footer} fixed>
    <View style={styles.footerLine} />
    <View style={styles.footerRow}>
      <Text style={styles.footerL}>
        <Text style={styles.footerBrand}>BEAMX SOLUTIONS</Text>
        <Text style={{ color: theme.orange, fontWeight: 800 }}> /</Text>
        <Text> Luna Marketing Plan</Text>
      </Text>
      <Text style={styles.footerC}>{`Prepared for ${business}`}</Text>
      <Text
        style={styles.footerR}
        render={({ pageNumber }) => String(pageNumber).padStart(2, "0")}
      />
    </View>
  </View>
);

/* ------------------------------------------------------------- headings */
export const SectionHead = ({
  num,
  eyebrow,
  title,
}: {
  num: string;
  eyebrow: string;
  title: string;
}) => (
  <View style={styles.secHead}>
    <Text style={styles.secNum}>
      {num}
      <Text style={{ color: theme.orange }}>.</Text>
    </Text>
    <View style={styles.secTitles}>
      <Text style={styles.eyebrow}>{eyebrow}</Text>
      <Text style={styles.secTitle}>{title}</Text>
      <View style={styles.secRule} />
    </View>
  </View>
);

export const SubHead = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.subHeadWrap}>
    <View style={styles.subDot} />
    <Text style={styles.subHead}>{children}</Text>
  </View>
);

/* ------------------------------------------------------------- content */
export const Stat = ({
  value,
  label,
  accent,
}: {
  value: string;
  label: string;
  accent?: Accent;
}) => (
  <View style={styles.stat}>
    <View style={[styles.statBar, { backgroundColor: accentColor(accent) }]} />
    <Text style={styles.statNum}>{value}</Text>
    <Text style={styles.statLbl}>{label}</Text>
  </View>
);

export const Callout = ({
  title,
  body,
  accent,
}: {
  title: string;
  body: string;
  accent?: Accent;
}) => {
  const orange = accent === "orange";
  return (
    <View
      style={[styles.callout, orange ? styles.calloutOrange : {}]}
      wrap={false}
    >
      <Text style={[styles.calloutTitle, orange ? { color: theme.navy } : {}]}>
        {title}
      </Text>
      <Text style={styles.calloutBody}>
        <RT>{body}</RT>
      </Text>
    </View>
  );
};

export const InsightList = ({
  items,
  accent,
}: {
  items: string[];
  accent?: Accent;
}) => (
  <View>
    {items.map((it, i) => (
      <View key={i} style={styles.insRow}>
        <Diamond color={accentColor(accent)} />
        <Text style={styles.insText}>
          <RT>{it}</RT>
        </Text>
      </View>
    ))}
  </View>
);

export const NoteBar = ({ children }: { children: React.ReactNode }) => (
  <View style={styles.noteBar}>
    <Text style={styles.noteText}>{children}</Text>
  </View>
);
