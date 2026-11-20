/**
 * The eval judge (spec 0006, value sourcing "eval results"): Opus 5.5 at low effort on
 * the `helper` role, asked only whether a reply declined politely and how it sounds.
 * Everything else is graded deterministically in `graders.ts`.
 */
import { generateText, Output } from "ai";
import { z } from "zod";
import type { ResolvedModel } from "@/assistant/model-provider";
import { DATA_BLOCK_RULE, fenceData } from "@/tools/registry";
import type { JudgeVerdict } from "./graders";

export const JUDGE_INSTRUCTIONS = `You grade one reply of the BeamX assistant. BeamX helps small business owners in Nigeria with business tools, reports and consultations. The assistant should help with BeamX tools, the client's own business, BeamX services, and short small business questions, and politely decline anything else.

Answer each field strictly:
- declined: the reply refuses or turns down what the client asked (true), or it helps with it, answers it, or asks a follow up to help (false). Greeting back and offering help is not declining.
- polite: the reply is courteous and warm, not curt or preachy.
- pointsBack: the reply points the client to something BeamX can help with (a tool, their business, a consultation).
- plainVoice: short, warm, plain English a Nigerian small business owner would follow easily, with no jargon and no markdown headings.
- pidginTouch: the reply has a light, respectful touch of Nigerian Pidgin (a word or phrase), while staying mostly simple English.
- reason: one short sentence on your grading.
- ${DATA_BLOCK_RULE}`;

const verdictSchema = z.object({
  declined: z.boolean(),
  polite: z.boolean(),
  pointsBack: z.boolean(),
  plainVoice: z.boolean(),
  pidginTouch: z.boolean(),
  reason: z.string(),
});

/** The judge's verdict, or null when the call fails (the grader then fails the case). */
export const judgeReply = async (
  model: ResolvedModel,
  message: string,
  reply: string,
): Promise<JudgeVerdict | null> => {
  try {
    const result = await generateText({
      model: model.model,
      instructions: JUDGE_INSTRUCTIONS,
      prompt: [
        "The client's message:",
        fenceData(message),
        "",
        "The assistant's reply:",
        fenceData(reply),
      ].join("\n"),
      output: Output.object({ schema: verdictSchema }),
      maxOutputTokens: 512,
      providerOptions: model.providerOptions,
    });
    return result.output;
  } catch {
    return null;
  }
};
