/**
 * The frozen read side of Beacon v1 (spec 0010), kept so reports made before Beacon
 * became the Claude advisory (spec 0011) still open. Never used to start a run.
 */
import { z } from "zod";
import { defineReader } from "../_contract";
import { beaconQuestions } from "./questions";
import { beaconScoresSchema } from "./scoring";
import { advisorySchema } from "./v1-schema";
import { beaconV1View } from "./v1-view";

/** v1 scores: today's scores plus the rule based advisory v1 stored with them. */
export const beaconV1ScoresSchema = beaconScoresSchema.extend({
  advisory: advisorySchema,
});

export type BeaconV1Scores = z.infer<typeof beaconV1ScoresSchema>;

export const beaconV1ContentSchema = z.object({ advisory: advisorySchema });

export type BeaconV1Content = z.infer<typeof beaconV1ContentSchema>;

export const beaconV1Reader = defineReader({
  questions: beaconQuestions,
  scoresSchema: beaconV1ScoresSchema,
  contentSchema: beaconV1ContentSchema,
  toView: beaconV1View,
});
