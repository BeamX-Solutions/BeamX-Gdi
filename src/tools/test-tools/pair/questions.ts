/**
 * Test only (spec 0005). The questions both pair modules share, the way two report
 * styles of one tool could share one questionnaire.
 */
import type { ToolQuestion } from "@/tools/_contract";

export const pairQuestions: readonly ToolQuestion[] = [
  {
    kind: "scale",
    id: "sales",
    prompt: "How are sales?",
    min: 1,
    max: 5,
    minLabel: "Poor",
    maxLabel: "Great",
    area: "Sales",
  },
  {
    kind: "scale",
    id: "cash",
    prompt: "How is cash flow?",
    min: 1,
    max: 5,
    minLabel: "Poor",
    maxLabel: "Great",
    area: "Money",
  },
];
