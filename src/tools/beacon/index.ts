/**
 * Beacon, the business health check (spec 0010). The business name plus 22 questions,
 * fixed scoring and a rule based advisory, and one AI phase that polishes its wording.
 * Beacon Pro (#11) adds a second module here on the same questions and scores.
 */
import { defineTool } from "../_contract";
import { beaconQuestions } from "./questions";
import { advisoryPhase, beaconContentSchema } from "./report";
import { beaconScoresSchema, scoreBeacon } from "./scoring";
import { beaconView } from "./view";

export const beacon = defineTool({
  id: "beacon",
  version: "1",
  name: "Beacon",
  summary:
    "Check how healthy your business is, with a score, your weak spots and a 90 day plan.",
  whenToUse:
    "The client already runs a business and wants to know how healthy it is: a score, weak spots across money, customers, operations and growth, and what to fix next.",
  creditPrice: 50,
  questions: beaconQuestions,
  scoresSchema: beaconScoresSchema,
  contentSchema: beaconContentSchema,
  score: scoreBeacon,
  phases: [advisoryPhase],
  toView: beaconView,
});
