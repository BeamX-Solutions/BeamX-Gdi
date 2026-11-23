/** Asks a yes or no question on the terminal; only "y" or "yes" counts as yes. */
import { createInterface } from "node:readline/promises";

export const confirm = async (question: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  try {
    const answer = await rl.question(`${question} [y/N] `);
    return ["y", "yes"].includes(answer.trim().toLowerCase());
  } finally {
    rl.close();
  }
};
