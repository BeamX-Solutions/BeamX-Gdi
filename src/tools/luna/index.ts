/**
 * Luna, the marketing plan (spec 0013). Fifty questions in chat (the business, then 9
 * squares), no scoring, and a plan Claude writes in five phases, one phase per report
 * call so each fits the 300 second limit. 500 credits (spec 0004).
 */
import { defineTool } from "../_contract";
import { lunaQuestions } from "./facts";
import { lunaContentSchema } from "./plan";
import {
  analysisPhase,
  assetsPhase,
  corePhase,
  lunaScoresSchema,
  operationsPhase,
  overviewPhase,
} from "./report";
import { scoreLuna } from "./scoring";
import { lunaView } from "./view";

export const luna = defineTool({
  id: "luna",
  version: "1",
  name: "Luna",
  summary:
    "A full marketing plan for your business: your customer journey, a 180 day roadmap, budget, KPIs and templates.",
  whenToUse:
    "The client wants a marketing plan or a marketing strategy: who to target, which channels to use, how to get and keep customers, with a budget and a roadmap. It asks 50 questions, so it suits a client ready to spend some time.",
  creditPrice: 500,
  questions: lunaQuestions,
  scoresSchema: lunaScoresSchema,
  contentSchema: lunaContentSchema,
  score: scoreLuna,
  phases: [
    analysisPhase,
    corePhase,
    overviewPhase,
    operationsPhase,
    assetsPhase,
  ],
  phasesPerCall: 1,
  toView: lunaView,
});
