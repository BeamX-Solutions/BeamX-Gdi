/**
 * Stellar, the idea validator (spec 0005). Ten questions plus four follow ups, fixed
 * scoring, and one AI analysis phase.
 */
import { defineTool } from "../_contract";
import { stellarQuestions } from "./questions";
import { analysisPhase, stellarContentSchema } from "./report";
import { scoreStellar, stellarScoresSchema } from "./scoring";
import { stellarView } from "./view";

export const stellar = defineTool({
  id: "stellar",
  version: "1",
  name: "Stellar",
  summary: "Check if your business idea is ready to start, in ten questions.",
  whenToUse:
    "The client has a business idea, or a very new business, and wants to know if it is ready or worth starting.",
  creditPrice: 30,
  questions: stellarQuestions,
  scoresSchema: stellarScoresSchema,
  contentSchema: stellarContentSchema,
  score: scoreStellar,
  phases: [analysisPhase],
  toView: stellarView,
});
