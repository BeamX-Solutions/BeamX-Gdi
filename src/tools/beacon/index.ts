/**
 * Beacon, the business health check. The business name plus 22 questions, fixed scoring
 * (spec 0010), and a full advisory written by Claude in five sections (spec 0011). The
 * scores show while the advisory is written. Version 1, the rule based advisory, is
 * kept only as a reader so its stored reports still open.
 */
import { defineTool } from "../_contract";
import { beaconQuestions } from "./questions";
import { advisoryPhase, beaconContentSchema } from "./report";
import { beaconScoresSchema, scoreBeacon } from "./scoring";
import { beaconV1Reader } from "./v1-reader";
import { beaconPreview, beaconView } from "./view";

export const beacon = defineTool({
  id: "beacon",
  version: "2",
  name: "Beacon",
  summary:
    "Check how healthy your business is: a score, your weak spots, and a full advisory written for your business.",
  whenToUse:
    "The client already runs a business and wants to know how healthy it is: a score, weak spots across money, customers, operations and growth, and a personal plan for what to fix next.",
  creditPrice: 150,
  questions: beaconQuestions,
  scoresSchema: beaconScoresSchema,
  contentSchema: beaconContentSchema,
  score: scoreBeacon,
  phases: [advisoryPhase],
  toView: beaconView,
  toPreview: beaconPreview,
  readers: { "1": beaconV1Reader },
});
