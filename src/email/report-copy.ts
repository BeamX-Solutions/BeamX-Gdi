/**
 * The words of the report email (spec 0015, AC-5), shared by the HTML and the plain
 * text so they always match. Pure.
 */
import { footerText } from "./footer-copy";

export type ReportEmailInput = {
  readonly toolName: string;
  /** "Beacon 62.5 of 100: Building Blocks", or null. */
  readonly headline: string | null;
  /** The chat the report lives in, or null. */
  readonly chatUrl: string | null;
};

export const reportEmailCopy = (input: ReportEmailInput) => ({
  subject: `Your BeamX ${input.toolName} report`,
  preview: `Your ${input.toolName} report is attached as a PDF.`,
  heading: `Your ${input.toolName} report`,
  headline: input.headline,
  body: "Your full report is attached as a PDF. Keep it, share it with your team, or open the chat to ask follow up questions about it.",
  button: "Open the chat",
  chatUrl: input.chatUrl,
  consultation:
    "Want help putting it into action? Book a free 30 minute strategy call with a BeamX adviser from the chat.",
});

export const reportEmailText = (
  input: ReportEmailInput,
  appUrl: string,
): string => {
  const c = reportEmailCopy(input);
  return (
    [
      c.heading,
      ...(c.headline ? ["", c.headline] : []),
      "",
      c.body,
      ...(c.chatUrl ? ["", `${c.button}: ${c.chatUrl}`] : []),
      "",
      c.consultation,
    ].join("\n") + footerText(appUrl)
  );
};
