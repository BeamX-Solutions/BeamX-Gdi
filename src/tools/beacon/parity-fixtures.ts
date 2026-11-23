/**
 * Test only. Maps a Beacon parity fixture answer set (fixtures/parity/beacon: standalone
 * field names and option labels) to stored answers (question ids and slugs), by label.
 */
import { z } from "zod";
import type { Answers } from "../_contract";
import { beaconQuestions } from "./questions";

export const fixtureAnswersSchema = z.record(z.string(), z.string());

const NOT_ASKED = new Set(["fullName", "email"]);

/** `yearsInBusiness` to `years_in_business`. */
export const toId = (field: string): string =>
  field.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Fixture answers to stored answers. Throws on a label no option has. */
export const toAnswers = (fields: Readonly<Record<string, string>>): Answers =>
  Object.fromEntries(
    Object.entries(fields)
      .filter(([field]) => !NOT_ASKED.has(field))
      .map(([field, answer]) => {
        const id = toId(field);
        const question = beaconQuestions.find((q) => q.id === id);
        if (!question) throw new Error(`no question for ${field}`);
        if (question.kind === "text") return [id, answer] as const;
        if (question.kind !== "single")
          throw new Error(`${id} is not a single choice question`);
        const option = question.options.find((o) => o.label === answer);
        if (!option) throw new Error(`${id} has no option "${answer}"`);
        return [id, option.value] as const;
      }),
  );
