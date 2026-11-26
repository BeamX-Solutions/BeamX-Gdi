/**
 * The invariants every registered tool module must keep (spec 0005, AC-1), as a pure
 * check over a list of modules. `contract.test.ts` runs it over the registry, so a new
 * tool that breaks the contract fails CI before it can be started.
 */
import { z } from "zod";
import type { ToolModule, ToolQuestion } from "../_contract";
import { isFactKey } from "./facts";

/**
 * What one report call may spend (spec 0013, AC-10): the route's 300 second
 * `maxDuration` (Vercel Hobby) minus a margin for the claim, the save and the charge.
 */
export const MAX_CALL_MS = 280_000;

const duplicates = (values: readonly string[]): readonly string[] =>
  [...new Set(values.filter((v, i) => values.indexOf(v) !== i))].sort();

const sameKeys = (a: readonly string[], b: readonly string[]): boolean =>
  a.length === b.length &&
  [...a].sort().join("\0") === [...b].sort().join("\0");

const whenThrows = (when: () => boolean): boolean => {
  try {
    when();
    return false;
  } catch {
    return true;
  }
};

/** The violations of one module, each a short sentence naming the tool. */
export const moduleViolations = (tool: ToolModule): readonly string[] => {
  const name = `tool "${tool.id}"`;
  const phaseKeys = tool.phases.map((p) => p.key);
  // Each phase may need a repair call, so it costs up to twice its timeout. A tool with
  // `phasesPerCall: 1` spends one phase per call; any other spends all of them.
  const callMs =
    tool.phasesPerCall === 1
      ? Math.max(...tool.phases.map((p) => 2 * p.timeoutMs))
      : tool.phases.reduce((sum, p) => sum + 2 * p.timeoutMs, 0);
  const contentKeys =
    tool.contentSchema instanceof z.ZodObject
      ? Object.keys(tool.contentSchema.shape)
      : null;

  return [
    ...duplicates(tool.questions.map((q) => q.id)).map(
      (id) => `${name} has the question id "${id}" more than once`,
    ),
    ...(Number.isInteger(tool.creditPrice) && tool.creditPrice > 0
      ? []
      : [
          `${name} has creditPrice ${tool.creditPrice}, not a positive integer`,
        ]),
    ...(tool.phases.length === 0 ? [`${name} has no report phases`] : []),
    ...duplicates(phaseKeys).map(
      (key) => `${name} has the phase key "${key}" more than once`,
    ),
    ...(contentKeys === null
      ? [`${name} has a contentSchema that is not a z.object`]
      : sameKeys(contentKeys, [...new Set(phaseKeys)])
        ? []
        : [
            `${name} has phase keys [${phaseKeys.join(", ")}] that do not match the contentSchema keys [${contentKeys.join(", ")}]`,
          ]),
    ...tool.questions
      .filter(
        (q) => q.when !== undefined && whenThrows(() => q.when?.({}) ?? true),
      )
      .map(
        (q) => `${name} has a "when" on "${q.id}" that throws on empty answers`,
      ),
    ...(callMs > MAX_CALL_MS
      ? [
          `${name} needs up to ${callMs}ms in one call (two tries per phase), over ${MAX_CALL_MS}`,
        ]
      : []),
    ...tool.questions.flatMap((q) => factViolations(name, q)),
  ];
};

/**
 * Spec 0012, AC-2: a linked choice question reads back every option it stores. An option
 * mapped to no fact ("Other") is skipped; an unknown fact key is reported.
 */
const factViolations = (name: string, q: ToolQuestion): readonly string[] => {
  const fact = q.fact;
  if (fact === undefined) return [];
  if (!isFactKey(fact.key))
    return [`${name} links "${q.id}" to the unknown fact "${fact.key}"`];
  if (q.kind !== "single") return [];
  return q.options.flatMap((option) => {
    const stored = fact.toFact(option.value);
    if (stored === null) return [];
    const back = fact.fromFact(stored);
    return back === option.value
      ? []
      : [
          `${name} "${q.id}" option "${option.value}" reads back as ${JSON.stringify(back)}`,
        ];
  });
};

/** Every violation across the list, including tool ids used more than once. */
export const contractViolations = (
  tools: readonly ToolModule[],
): readonly string[] => [
  ...duplicates(tools.map((t) => t.id)).map(
    (id) => `the tool id "${id}" is registered more than once`,
  ),
  ...tools.flatMap(moduleViolations),
];
