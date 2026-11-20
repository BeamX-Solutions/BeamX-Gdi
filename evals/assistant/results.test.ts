import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { tools } from "@/tools/registry";
import { promptFingerprint } from "./fingerprint";

// Spec 0006, AC-15: a prompt or model change needs a new results file committed with it.
// CI runs only this check, never the real model eval.

const dir = new URL("./results/", import.meta.url);

const fingerprints = (): string[] =>
  readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const data = JSON.parse(readFileSync(new URL(f, dir), "utf8")) as {
        fingerprint?: unknown;
      };
      return typeof data.fingerprint === "string" ? data.fingerprint : "";
    });

describe("eval results", () => {
  it("has a results file for the current prompts, registry and models", () => {
    const current = promptFingerprint(tools);
    expect(
      fingerprints(),
      `No results file has fingerprint ${current}. The instructions, extraction prompt, registry or model roles changed: run \`pnpm eval:assistant\` and commit the new file under evals/assistant/results/.`,
    ).toContain(current);
  });
});
