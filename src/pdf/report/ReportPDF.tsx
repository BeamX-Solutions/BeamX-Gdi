/**
 * The shared report PDF for block based tools, Stellar and Beacon (spec 0015, AC-3): a
 * branded header, every report block in the panel's order, and a page footer. The blocks
 * are the tool's own view, so the PDF and the panel agree. Brand colors are hex (PDFs
 * cannot read CSS variables), from the Luna theme.
 */
import type { ReactNode } from "react";
import {
  Document,
  Image,
  Page,
  StyleSheet,
  Text,
  View,
} from "@react-pdf/renderer";
import type { ReportBlock, RichPart } from "@/tools/registry";
import { theme as C } from "../luna/theme";

export type ReportPdfProps = {
  readonly toolName: string;
  readonly business: string | null;
  /** "24 November 2026". */
  readonly date: string;
  readonly blocks: readonly ReportBlock[];
  readonly logo: string;
};

const s = StyleSheet.create({
  page: {
    fontFamily: "Montserrat",
    fontSize: 10,
    color: C.body,
    paddingTop: 44,
    paddingBottom: 56,
    paddingHorizontal: 48,
    lineHeight: 1.45,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: C.navy,
    paddingBottom: 12,
    marginBottom: 18,
  },
  eyebrow: { fontSize: 8, color: C.slate, letterSpacing: 1.2, fontWeight: 600 },
  title: { fontSize: 20, fontWeight: 700, color: C.navyDeep, marginTop: 2 },
  meta: { fontSize: 9, color: C.slate, marginTop: 2 },
  block: { marginBottom: 16 },
  h2: { fontSize: 13, fontWeight: 700, color: C.navy, marginBottom: 6 },
  h3: {
    fontSize: 11,
    fontWeight: 600,
    color: C.ink,
    marginTop: 6,
    marginBottom: 3,
  },
  label: {
    fontSize: 8,
    fontWeight: 700,
    color: C.orangeText,
    letterSpacing: 1,
    marginTop: 6,
  },
  note: { fontSize: 9, color: C.slate },
  bold: { fontWeight: 700, color: C.ink },
  row: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 12, color: C.blue },
  grow: { flex: 1 },
  score: {
    backgroundColor: C.tint,
    borderRadius: 6,
    padding: 14,
    marginBottom: 16,
  },
  scoreNum: { fontSize: 28, fontWeight: 800, color: C.navyDeep },
  barTrack: {
    height: 6,
    backgroundColor: C.lineSoft,
    borderRadius: 3,
    marginTop: 2,
  },
  rule: { borderBottomWidth: 1, borderBottomColor: C.line, marginVertical: 8 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: C.slateLight,
  },
});

const verdictColor = (v: string | undefined): string =>
  v === "good"
    ? C.blue
    : v === "caution"
      ? C.orange
      : v === "risk"
        ? C.orangeText
        : C.navy;

function Lead({
  lead,
  text,
}: {
  readonly lead?: string;
  readonly text: string;
}) {
  return (
    <Text>
      {lead ? <Text style={s.bold}>{lead} </Text> : null}
      {text}
    </Text>
  );
}

function Item({
  mark,
  children,
}: {
  readonly mark: string;
  readonly children: ReactNode;
}) {
  return (
    <View style={s.row} wrap={false}>
      <Text style={s.bullet}>{mark}</Text>
      <View style={s.grow}>{children}</View>
    </View>
  );
}

function Part({ part }: { readonly part: RichPart }) {
  switch (part.kind) {
    case "paragraph":
      return (
        <View style={{ marginTop: part.tight ? 0 : 4 }}>
          <Lead lead={part.lead} text={part.text} />
        </View>
      );
    case "note":
      return <Text style={s.note}>{part.text}</Text>;
    case "label":
      return <Text style={s.label}>{part.text.toUpperCase()}</Text>;
    case "subheading":
      return <Text style={s.h3}>{part.text}</Text>;
    case "bullets":
      return (
        <View style={{ marginTop: part.tight ? 2 : 4 }}>
          {part.items.map((i, n) => (
            <Item key={n} mark="•">
              <Lead lead={i.lead} text={i.text} />
            </Item>
          ))}
        </View>
      );
    case "numbered":
      return (
        <View style={{ marginTop: part.tight ? 2 : 4 }}>
          {part.items.map((i, n) => (
            <Item key={n} mark={`${n + 1}.`}>
              <Lead lead={i.lead} text={i.text} />
            </Item>
          ))}
        </View>
      );
    case "rule":
      return <View style={s.rule} />;
    default: {
      const unreachable: never = part;
      return unreachable;
    }
  }
}

export function Block({ block }: { readonly block: ReportBlock }) {
  switch (block.kind) {
    case "score_header":
      return (
        <View style={s.score} wrap={false}>
          <Text style={s.eyebrow}>{block.title.toUpperCase()}</Text>
          <Text style={[s.scoreNum, { color: verdictColor(block.verdict) }]}>
            {block.score}
            <Text style={{ fontSize: 12, color: C.slate }}> / {block.max}</Text>
          </Text>
          <Text>{block.summary}</Text>
        </View>
      );
    case "category_bars":
      return (
        <View style={s.block} wrap={false}>
          <Text style={s.h2}>{block.title}</Text>
          {block.items.map((i, n) => (
            <View key={n} style={{ marginBottom: 6 }}>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                }}
              >
                <Text>{i.label}</Text>
                <Text style={s.bold}>
                  {i.score} / {i.max}
                </Text>
              </View>
              <View style={s.barTrack}>
                <View
                  style={{
                    height: 6,
                    borderRadius: 3,
                    width: `${Math.max(0, Math.min(100, (i.score / i.max) * 100))}%`,
                    backgroundColor: verdictColor(i.verdict),
                  }}
                />
              </View>
            </View>
          ))}
        </View>
      );
    case "advice_list":
      return (
        <View style={s.block}>
          <Text style={s.h2}>{block.title}</Text>
          {block.items.map((i, n) => (
            <Item key={n} mark={i.priority === "high" ? "!" : "•"}>
              <Text>
                <Text style={i.priority === "high" ? s.bold : {}}>
                  {i.title}
                </Text>
                {i.detail ? (
                  <Text style={{ color: C.slate }}> ({i.detail})</Text>
                ) : null}
              </Text>
            </Item>
          ))}
        </View>
      );
    case "text":
      return (
        <View style={s.block}>
          <Text style={s.h2}>{block.title}</Text>
          {block.paragraphs.map((p, n) => (
            <Text key={n} style={{ marginBottom: 4 }}>
              {p}
            </Text>
          ))}
        </View>
      );
    case "bullets":
      return (
        <View style={s.block}>
          <Text style={s.h2}>{block.title}</Text>
          {block.items.map((i, n) => (
            <Item key={n} mark="•">
              <Text>{i}</Text>
            </Item>
          ))}
        </View>
      );
    case "timeline":
      return (
        <View style={s.block}>
          <Text style={s.h2}>{block.title}</Text>
          {block.steps.map((step, n) => (
            <View key={n} style={{ marginBottom: 6 }} wrap={false}>
              <Text style={s.h3}>{step.label}</Text>
              {step.items.map((i, m) => (
                <Item key={m} mark="•">
                  <Text>{i}</Text>
                </Item>
              ))}
            </View>
          ))}
        </View>
      );
    case "rich_section":
      return (
        <View style={s.block}>
          <Text style={s.h2}>{block.title}</Text>
          {block.parts.map((p, n) => (
            <Part key={n} part={p} />
          ))}
        </View>
      );
    case "resources":
      return (
        <View style={s.block} wrap={false}>
          <Text style={s.h2}>{block.title}</Text>
          {block.items.map((i, n) => (
            <Item key={n} mark="→">
              <Text>
                <Text style={s.bold}>{i.title}</Text>
                {i.url ? ` (${i.url})` : ""}
              </Text>
            </Item>
          ))}
        </View>
      );
    default: {
      const unreachable: never = block;
      return unreachable;
    }
  }
}

export function ReportPDF({
  toolName,
  business,
  date,
  blocks,
  logo,
}: ReportPdfProps) {
  return (
    <Document
      title={`${toolName} report${business ? `, ${business}` : ""}`}
      author="BeamX Solutions"
      creator={`BeamX ${toolName}`}
    >
      <Page size="A4" style={s.page}>
        <View style={s.header} fixed>
          <View>
            <Text style={s.eyebrow}>BEAMX {toolName.toUpperCase()} REPORT</Text>
            <Text style={s.title}>{business ?? `Your ${toolName} report`}</Text>
            <Text style={s.meta}>{date}</Text>
          </View>
          {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
          <Image src={logo} style={{ height: 28 }} />
        </View>
        {blocks.map((b, n) => (
          <Block key={n} block={b} />
        ))}
        <View style={s.footer} fixed>
          <Text>beamxsolutions.com</Text>
          <Text
            render={({ pageNumber, totalPages }) =>
              `${pageNumber} / ${totalPages}`
            }
          />
        </View>
      </Page>
    </Document>
  );
}
