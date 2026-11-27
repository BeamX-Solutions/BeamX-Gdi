import type { HistoryItem } from "@/components/workspace/history-rail";

export const historyItems: readonly HistoryItem[] = [
  {
    id: "h1",
    title: "Is my bakery idea worth starting?",
    href: "/design/shell",
  },
  {
    id: "h2",
    title: "Beacon health check, Ade Stores",
    href: "/design/shell",
    reports: "Beacon report",
  },
  {
    id: "h3",
    title: "Marketing plan for a tailoring shop in Abuja",
    href: "/design/shell",
  },
];

export const longUrl =
  "https://example.com/a/very/long/path/that/keeps/going/and/going/with-no-spaces-at-all/" +
  "0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789";

export const reportParagraphs: readonly string[] = [
  "Your idea scores well on demand and needs work on cost control.",
  "The full report will show a score, category bars, advice, and written sections here.",
  "Keep chatting on the left and the report stays beside you.",
];
