import React from "react";
import { Text } from "@react-pdf/renderer";
import { styles } from "./styles";

/**
 * Renders a string that may contain **bold** segments, for use inside a parent
 * <Text>:  <Text style={styles.p}><RT>{value}</RT></Text>
 *
 * Bold is applied only to a *leading* segment (e.g. "**Trigger:** ...", a
 * label or note prefix). Emphasis that appears mid-paragraph is rendered as
 * plain text on purpose: react-pdf (4.5.x) mispositions a nested <Text> that
 * follows plain text within the same block, overlapping the preceding word.
 * Leading bold sits at the start of the line and is unaffected, so that is the
 * only place we switch weight. The markers are always stripped from output.
 */
export function RT({ children }: { children: string }) {
  const raw = children ?? "";
  const parts = raw.split("**");
  const leadingBold = parts.length > 1 && parts[0] === "";

  if (!leadingBold) {
    return <>{raw.replace(/\*\*/g, "")}</>;
  }

  let boldText = parts[1];
  let rest = parts.slice(2).join("**").replace(/\*\*/g, "");
  // Keep the boundary space inside the bold run so it isn't trimmed.
  if (rest.startsWith(" ")) {
    boldText += "\u00A0";
    rest = rest.slice(1);
  }
  return (
    <>
      <Text style={styles.bold}>{boldText}</Text>
      {rest}
    </>
  );
}
