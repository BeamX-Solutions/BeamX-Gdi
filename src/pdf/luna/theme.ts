/** Brand tokens for the BeamX Luna marketing-plan PDF. */
export const theme = {
  navy: "#02428E",
  navyDeep: "#012857",
  blue: "#008BD8",
  blueMid: "#0A5BA8",
  orange: "#F27900",
  orangeText: "#C25E00",
  ink: "#19212E",
  body: "#2C3645",
  slate: "#5A6675",
  slateLight: "#8893A2",
  line: "#E4EAF1",
  lineSoft: "#EFF3F8",
  tint: "#F4F8FD",
  tintBlue: "#EAF3FB",
  tintOrange: "#FFF4EB",
  white: "#FFFFFF",
} as const;

/** A4 dimensions in points (used to size full-bleed SVG and anchor the footer). */
export const PAGE_W = 595.28;
export const PAGE_H = 841.89;

/** Default location of the logo (place it in /public). Override via the
 *  `logoSrc` prop on <MarketingPlanPDF /> or a hosted URL for server rendering. */
export const DEFAULT_LOGO_SRC = "/beamx-logo.png";

export type Accent = "blue" | "orange";
export const accentColor = (a: Accent | undefined) =>
  a === "orange" ? theme.orange : theme.blue;
