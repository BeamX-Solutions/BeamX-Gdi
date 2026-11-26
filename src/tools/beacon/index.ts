/**
 * Beacon, the business health check (spec 0010), and Beacon Pro (spec 0011). Both use
 * the business name plus 22 questions and the same fixed scoring. Beacon polishes a
 * rule based advisory; Pro has Claude write a full advisory, reuses answers from an
 * earlier Beacon or Pro run, and shows the scores while the advisory is written.
 */
import { defineTool } from "../_contract";
import { proAdvisoryPhase, proContentSchema } from "./pro-report";
import { beaconProPreview, beaconProView } from "./pro-view";
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

export const beaconPro = defineTool({
  id: "beacon_pro",
  version: "1",
  name: "Beacon Pro",
  summary:
    "A deeper business health check: the same score, plus a full personal advisory written for your business.",
  whenToUse:
    "The client wants more depth than Beacon: a deeper plan, a personal advisory, or more detail on their business health. Same questions and scores as Beacon, plus a full advisory written for them; answers from an earlier Beacon or Beacon Pro run are reused, so they answer nothing again.",
  creditPrice: 150,
  questions: beaconQuestions,
  scoresSchema: beaconScoresSchema,
  contentSchema: proContentSchema,
  score: scoreBeacon,
  phases: [proAdvisoryPhase],
  toView: beaconProView,
  toPreview: beaconProPreview,
  reuseFrom: ["beacon", "beacon_pro"],
});
