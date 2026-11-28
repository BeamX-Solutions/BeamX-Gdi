/**
 * The words of the email BeamX gets for each booking or cancel (spec 0016, AC-6, AC-7),
 * shared by the HTML and the plain text. Pure.
 */
import { footerText } from "./footer-copy";

export type ConsultationEmailInput = {
  readonly kind: "booked" | "canceled";
  readonly clientName: string | null;
  readonly clientEmail: string | null;
  /** "Wed 2 Dec at 10:00 (Lagos time)", or null. */
  readonly callTime: string | null;
  readonly profile: readonly {
    readonly label: string;
    readonly value: string;
  }[];
  /** The tool name and headline of each attached report. */
  readonly reports: readonly {
    readonly toolName: string;
    readonly headline: string | null;
  }[];
};

const who = (input: ConsultationEmailInput) =>
  input.clientName ?? input.clientEmail ?? "A client";

export const consultationEmailCopy = (input: ConsultationEmailInput) => ({
  subject:
    input.kind === "booked"
      ? `New strategy call: ${who(input)}${input.callTime ? `, ${input.callTime}` : ""}`
      : `Strategy call canceled: ${who(input)}`,
  heading:
    input.kind === "booked"
      ? "New strategy call booked"
      : "Strategy call canceled",
  lines: [
    `Client: ${who(input)}`,
    ...(input.clientEmail && input.clientName
      ? [`Email: ${input.clientEmail}`]
      : []),
    ...(input.callTime ? [`When: ${input.callTime}`] : []),
  ],
  profileTitle: "Business profile",
  profile: input.profile.map((p) => `${p.label}: ${p.value}`),
  reportsTitle:
    input.reports.length === 0
      ? "No reports yet"
      : "Reports (attached as PDFs)",
  reports: input.reports.map((r) =>
    r.headline ? `${r.toolName}: ${r.headline}` : r.toolName,
  ),
});

export const consultationEmailText = (
  input: ConsultationEmailInput,
  appUrl: string,
): string => {
  const c = consultationEmailCopy(input);
  return (
    [
      c.heading,
      "",
      ...c.lines,
      ...(input.kind === "booked"
        ? [
            ...(c.profile.length > 0 ? ["", c.profileTitle, ...c.profile] : []),
            "",
            c.reportsTitle,
            ...c.reports,
          ]
        : []),
    ].join("\n") + footerText(appUrl)
  );
};
