import { StyleSheet } from "@react-pdf/renderer";
import { theme as C } from "./theme";

export const styles = StyleSheet.create({
  /* ---- pages ---- */
  page: {
    fontFamily: "Montserrat",
    fontSize: 10.2,
    color: C.ink,
    lineHeight: 1.6,
    paddingTop: 48,
    paddingHorizontal: 51,
    paddingBottom: 56,
  },
  coverPage: {
    fontFamily: "Montserrat",
    color: C.ink,
    backgroundColor: C.white,
  },

  /* ---- type ---- */
  eyebrow: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.6,
    color: C.blue,
    textTransform: "uppercase",
  },
  lead: {
    fontSize: 11,
    lineHeight: 1.65,
    color: C.body,
    marginBottom: 9,
    marginTop: 4,
  },
  p: { fontSize: 10.2, lineHeight: 1.6, color: C.body, marginBottom: 9 },
  bold: { fontWeight: 600, color: C.navyDeep },

  /* ---- section head ---- */
  secHead: { flexDirection: "row", marginBottom: 18, marginTop: 2 },
  secNum: {
    fontSize: 30,
    fontWeight: 800,
    color: C.navy,
    letterSpacing: -0.5,
    marginRight: 14,
  },
  secTitles: { flex: 1, paddingTop: 4 },
  secTitle: {
    fontSize: 20,
    fontWeight: 800,
    color: C.navyDeep,
    letterSpacing: -0.3,
    marginTop: 3,
  },
  secRule: {
    height: 3,
    width: 38,
    backgroundColor: C.orange,
    borderRadius: 2,
    marginTop: 16,
  },

  subHeadWrap: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 18,
    marginBottom: 8,
  },
  subDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: C.orange,
    marginRight: 9,
  },
  subHead: {
    fontSize: 12.5,
    fontWeight: 700,
    color: C.navy,
    letterSpacing: -0.1,
  },

  /* ---- stats ---- */
  statRow: { flexDirection: "row", gap: 12, marginVertical: 16 },
  stat: {
    flex: 1,
    backgroundColor: C.tint,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 15,
    paddingLeft: 18,
    position: "relative",
  },
  statBar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 12,
    borderBottomLeftRadius: 12,
  },
  statNum: {
    fontSize: 17,
    fontWeight: 800,
    color: C.navyDeep,
    letterSpacing: -0.4,
  },
  statLbl: {
    fontSize: 7.4,
    fontWeight: 600,
    color: C.slate,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginTop: 6,
    lineHeight: 1.35,
  },

  /* ---- callout ---- */
  callout: {
    backgroundColor: C.tintBlue,
    borderLeftWidth: 4,
    borderLeftColor: C.blue,
    borderTopRightRadius: 10,
    borderBottomRightRadius: 10,
    paddingVertical: 13,
    paddingHorizontal: 17,
    marginVertical: 15,
  },
  calloutOrange: { backgroundColor: C.tintOrange, borderLeftColor: C.orange },
  calloutTitle: {
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: 1,
    color: C.navy,
    textTransform: "uppercase",
    marginBottom: 5,
  },
  calloutBody: { fontSize: 9.5, lineHeight: 1.55, color: C.body },

  /* ---- insight list ---- */
  insRow: { flexDirection: "row", marginBottom: 8 },
  insText: {
    flex: 1,
    fontSize: 9.7,
    lineHeight: 1.55,
    color: C.body,
    marginLeft: 12,
  },

  /* ---- stage cards ---- */
  stage: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    overflow: "hidden",
  },
  stageBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 18,
  },
  stageTag: { fontSize: 13, fontWeight: 800, color: C.white },
  stageSub: { fontSize: 9.5, fontWeight: 500, color: "#DCE8F4" },
  stageStep: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: "#CFE0F0",
    textTransform: "uppercase",
  },
  stageBody: { flexDirection: "row" },
  stageCol: { flex: 1, paddingVertical: 14, paddingHorizontal: 16 },
  stageColDivider: { borderLeftWidth: 1, borderLeftColor: C.lineSoft },
  stageColH: { fontSize: 10, fontWeight: 700, color: C.navy, marginBottom: 6 },
  stageColP: { fontSize: 9, lineHeight: 1.5, color: "#2F3947" },

  /* ---- risk ---- */
  risk: {
    flexDirection: "row",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  sev: {
    width: 64,
    paddingVertical: 5,
    borderRadius: 7,
    marginRight: 13,
    marginTop: 1,
  },
  sevText: {
    fontSize: 7,
    fontWeight: 800,
    letterSpacing: 0.4,
    color: C.white,
    textTransform: "uppercase",
    textAlign: "center",
  },
  riskText: { flex: 1, fontSize: 9.5, lineHeight: 1.55, color: C.body },

  /* ---- phase ---- */
  phase: { paddingLeft: 22, marginBottom: 18, position: "relative" },
  phaseLine: {
    position: "absolute",
    left: 0,
    top: 6,
    bottom: 6,
    width: 3,
    borderRadius: 2,
    backgroundColor: C.blue,
  },
  phaseTag: { flexDirection: "row", alignItems: "baseline", marginBottom: 10 },
  phaseN: {
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: 1,
    color: C.blue,
    textTransform: "uppercase",
    marginRight: 10,
  },
  phaseT: { fontSize: 12.5, fontWeight: 700, color: C.navyDeep },
  phaseD: {
    fontSize: 8.5,
    fontWeight: 600,
    color: C.slateLight,
    marginLeft: "auto",
  },
  stepRow: { flexDirection: "row", marginBottom: 7 },
  stepDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    borderWidth: 1.6,
    borderColor: C.blue,
    marginTop: 4,
    marginRight: 13,
  },
  stepText: { flex: 1, fontSize: 9.4, lineHeight: 1.5, color: C.body },

  /* ---- table ---- */
  table: { marginTop: 6, borderRadius: 8, overflow: "hidden" },
  tHead: { flexDirection: "row", backgroundColor: C.navy },
  tHcell: {
    fontSize: 7.8,
    fontWeight: 700,
    letterSpacing: 0.5,
    color: C.white,
    textTransform: "uppercase",
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  tRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  tCell: {
    fontSize: 9,
    lineHeight: 1.45,
    color: C.body,
    paddingVertical: 9,
    paddingHorizontal: 12,
  },
  tMetric: { fontWeight: 700, color: C.navyDeep },
  tTarget: { fontWeight: 600, color: C.orange },

  /* ---- check list ---- */
  chkRow: { flexDirection: "row", marginBottom: 8 },
  chkText: {
    flex: 1,
    fontSize: 9.7,
    lineHeight: 1.5,
    color: C.body,
    marginLeft: 11,
  },

  /* ---- template cards ---- */
  tcard: {
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  tcardHead: { flexDirection: "row", alignItems: "center", marginBottom: 8 },
  tcardNum: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: C.navy,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  tcardNumText: { fontSize: 10, fontWeight: 800, color: C.white },
  tcardTitle: { fontSize: 10.5, fontWeight: 700, color: C.navyDeep },
  tcardMeta: {
    fontSize: 7.4,
    fontWeight: 600,
    color: C.blue,
    letterSpacing: 0.4,
    textTransform: "uppercase",
    marginLeft: "auto",
  },
  tcardBody: { fontSize: 8.9, lineHeight: 1.55, color: "#3A4452" },

  /* ---- roi ---- */
  roiRow: {
    flexDirection: "row",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  roiBadge: {
    backgroundColor: C.tintBlue,
    borderRadius: 7,
    paddingVertical: 6,
    paddingHorizontal: 9,
    minWidth: 96,
    marginRight: 13,
    justifyContent: "center",
  },
  roiBadgeOrange: { backgroundColor: C.tintOrange },
  roiBadgeText: {
    fontSize: 7.4,
    fontWeight: 800,
    color: C.navy,
    textAlign: "center",
    lineHeight: 1.3,
  },
  roiTitle: {
    fontSize: 9.6,
    fontWeight: 700,
    color: C.navyDeep,
    marginBottom: 2,
  },
  roiBody: { fontSize: 9, lineHeight: 1.5, color: C.body },

  /* ---- next steps ---- */
  nsRow: {
    flexDirection: "row",
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
    alignItems: "flex-start",
  },
  nsNum: {
    fontSize: 13,
    fontWeight: 800,
    color: C.blue,
    width: 36,
    letterSpacing: -0.4,
  },
  nsText: {
    flex: 1,
    fontSize: 10,
    fontWeight: 500,
    color: C.body,
    marginTop: 2,
  },

  /* ---- note bar ---- */
  noteBar: {
    backgroundColor: C.tint,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 16,
  },
  noteText: { fontSize: 8.4, lineHeight: 1.55, color: C.slate },

  /* ---- TOC ---- */
  tocH: {
    fontSize: 30,
    fontWeight: 800,
    color: C.navyDeep,
    letterSpacing: -0.5,
    marginTop: 4,
  },
  tocRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: C.lineSoft,
  },
  tocNum: {
    fontSize: 13,
    fontWeight: 800,
    color: C.blue,
    width: 34,
    letterSpacing: -0.4,
  },
  tocTitle: { fontSize: 12.5, fontWeight: 600, color: C.navyDeep },
  tocDots: {
    flex: 1,
    borderBottomWidth: 1.5,
    borderBottomColor: C.line,
    borderStyle: "dotted",
    marginHorizontal: 10,
    marginBottom: 3,
  },
  tocPage: { fontSize: 11, fontWeight: 700, color: C.navy },
  tocFoot: {
    marginTop: 28,
    backgroundColor: C.tint,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 14,
    paddingVertical: 18,
    paddingHorizontal: 22,
  },
  tocFootEyebrow: {
    fontSize: 8,
    fontWeight: 800,
    letterSpacing: 1.2,
    color: C.orange,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  tocFootP: { fontSize: 9.6, lineHeight: 1.65, color: "#3A4452" },

  /* ---- footer ---- */
  // NOTE: anchored from the top (in the bottom padding zone). A `fixed`+`render`
  // element positioned with `bottom` corrupts react-pdf's transform matrix past ~10 pages.
  // An explicit `height` is REQUIRED: a fixed+absolute element with auto height
  // makes react-pdf 4.x accumulate a corrupt transform across pages on long
  // documents ("unsupported number: <huge>/-Infinity"). A fixed height keeps the
  // per-page layout stable.
  footer: { position: "absolute", bottom: 18, left: 51, right: 51, height: 24 },
  footerLine: {
    borderBottomWidth: 0.6,
    borderBottomColor: C.line,
    marginBottom: 7,
  },
  footerRow: { flexDirection: "row", alignItems: "center" },
  footerL: { flex: 1, fontSize: 6.6, color: C.slate, fontWeight: 400 },
  footerBrand: { fontSize: 6.6, fontWeight: 800, color: C.navy },
  footerC: { flex: 1, textAlign: "center", fontSize: 6.6, color: C.slate },
  footerR: {
    flex: 1,
    textAlign: "right",
    fontSize: 7.4,
    fontWeight: 800,
    color: C.navy,
  },

  /* ---- cover ---- */
  coverInner: {
    paddingTop: 85,
    paddingBottom: 68,
    paddingHorizontal: 62,
    height: "100%",
    justifyContent: "space-between",
  },
  coverTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  coverProdEyebrow: {
    fontSize: 7,
    fontWeight: 600,
    letterSpacing: 1.4,
    color: C.slateLight,
  },
  coverProdName: { fontSize: 12, fontWeight: 800, color: C.navy, marginTop: 4 },
  coverMid: { marginVertical: "auto" },
  coverKicker: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: 2.6,
    color: C.blue,
    marginBottom: 16,
  },
  coverTitle: {
    fontSize: 58,
    fontWeight: 800,
    color: C.navyDeep,
    letterSpacing: -1.3,
    lineHeight: 0.96,
  },
  coverAccent: {
    width: 80,
    height: 5,
    backgroundColor: C.orange,
    borderRadius: 3,
    marginTop: 22,
    marginBottom: 20,
  },
  coverSub: { fontSize: 12.5, color: C.slate, lineHeight: 1.5, maxWidth: 340 },
  coverBizLbl: {
    fontSize: 8,
    fontWeight: 700,
    letterSpacing: 1.4,
    color: C.slateLight,
    marginBottom: 5,
  },
  coverBizName: {
    fontSize: 22,
    fontWeight: 800,
    color: C.navy,
    marginBottom: 18,
  },
  coverChips: { flexDirection: "row", gap: 11 },
  chip: {
    flex: 1,
    backgroundColor: C.tint,
    borderWidth: 1,
    borderColor: C.line,
    borderRadius: 11,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  chipLbl: {
    fontSize: 7,
    fontWeight: 700,
    letterSpacing: 0.8,
    color: C.slateLight,
    marginBottom: 5,
  },
  chipVal: { fontSize: 10.5, fontWeight: 700, color: C.navyDeep },
  coverFoot: {
    marginTop: 22,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: C.line,
  },
  coverFootText: {
    fontSize: 8.5,
    fontWeight: 600,
    color: C.slate,
    letterSpacing: 0.3,
  },
});
