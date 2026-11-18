import {
  AlertTriangleIcon,
  CheckCircle2Icon,
  OctagonXIcon,
  type LucideIcon,
} from "lucide-react";
import type { Verdict } from "./types";

type VerdictStyle = {
  readonly Icon: LucideIcon;
  /** Badge: strong text on the muted background. */
  readonly badge: string;
  /** Bar fill. */
  readonly fill: string;
};

/**
 * The one place a verdict gets its icon and colors. A verdict is never shown by color
 * alone, so every caller also prints a text label next to the icon.
 */
export const verdictStyle: Readonly<Record<Verdict, VerdictStyle>> = {
  good: {
    Icon: CheckCircle2Icon,
    badge: "bg-verdict-good-muted text-verdict-good-strong",
    fill: "bg-verdict-good",
  },
  caution: {
    Icon: AlertTriangleIcon,
    badge: "bg-verdict-caution-muted text-verdict-caution-strong",
    fill: "bg-verdict-caution",
  },
  risk: {
    Icon: OctagonXIcon,
    badge: "bg-verdict-risk-muted text-verdict-risk-strong",
    fill: "bg-verdict-risk",
  },
};

/** The default wording, for callers that have no tool wording of their own. */
export const defaultVerdictLabel: Readonly<Record<Verdict, string>> = {
  good: "Good",
  caution: "Needs work",
  risk: "At risk",
};
