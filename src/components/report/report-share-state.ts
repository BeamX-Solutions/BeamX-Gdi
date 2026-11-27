/** The report share row's state and words (spec 0015, AC-6). Pure. */
export type ShareState =
  | { readonly kind: "idle" }
  | { readonly kind: "sending" }
  | { readonly kind: "sent"; readonly sentTo: string }
  | { readonly kind: "failed"; readonly reason: "limit" | "send" };

export const shareCopy = {
  label: "Keep this report",
  download: "Download PDF",
  email: "Email me this report",
  sending: "Sending…",
  guestLead: "Want it by email?",
  guestAction: "Create a free account",
  note: (state: ShareState): string => {
    switch (state.kind) {
      case "idle":
      case "sending":
        return "";
      case "sent":
        return `Sent to ${state.sentTo}`;
      case "failed":
        return state.reason === "limit"
          ? "You've emailed a lot of reports this hour. Try again later, or download the PDF."
          : "We couldn't send the email. Try again, or download the PDF.";
      default: {
        const unreachable: never = state;
        return unreachable;
      }
    }
  },
} as const;
