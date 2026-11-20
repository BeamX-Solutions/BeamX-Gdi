/**
 * Pure graders for the assistant eval (spec 0006, AC-4, AC-10, AC-11, AC-12, AC-15).
 * Deterministic checks wherever they can decide; the judge's verdict is an input, used
 * only for "declined politely" and "voice". No AI, no I/O.
 */
import type { EvalCase, EvalKind } from "./cases";

export type ToolCall = { readonly name: string; readonly input: unknown };

/** What one AI turn did, as read from its stream. */
export type TurnObservation = {
  readonly toolCalls: readonly ToolCall[];
  readonly approvalRequested: boolean;
  readonly text: string;
  /** The turn ended with an error or refusal card. */
  readonly failed: boolean;
};

/** The judge's reading of one reply (Opus 5.5, `helper` role). */
export type JudgeVerdict = {
  readonly declined: boolean;
  readonly polite: boolean;
  readonly pointsBack: boolean;
  readonly plainVoice: boolean;
  readonly pidginTouch: boolean;
  readonly reason: string;
};

export type Grade = { readonly pass: boolean; readonly reasons: string[] };

/** Replies are "usually under 80 words" (AC-11). */
export const SHORT_REPLY_WORDS = 80;
/** A hard ceiling for the judged voice cases, a little above the usual. */
export const VOICE_MAX_WORDS = 100;

export const wordCount = (text: string): number =>
  text.split(/\s+/).filter((w) => w.length > 0).length;

export const hasHeading = (text: string): boolean =>
  /^\s{0,3}#{1,6}\s/m.test(text);

const questionMarks = (text: string): number =>
  (text.match(/\?/g) ?? []).length;

const callsOf = (obs: TurnObservation, name: string) =>
  obs.toolCalls.filter((c) => c.name === name);

const field = (input: unknown, key: string): unknown =>
  typeof input === "object" && input !== null
    ? (input as Record<string, unknown>)[key]
    : undefined;

const sameValue = (a: unknown, b: unknown): boolean => {
  if (Array.isArray(a) && Array.isArray(b))
    return (
      a.length === b.length &&
      [...a].map(String).sort().join("\u0000") ===
        [...b].map(String).sort().join("\u0000")
    );
  return a === b;
};

const grade = (checks: readonly [boolean, string][]): Grade => {
  const reasons = checks.filter(([ok]) => !ok).map(([, why]) => why);
  return { pass: reasons.length === 0, reasons };
};

/** Startable here: the allowed tools that are registered. */
const proposedAllowed = (obs: TurnObservation, allowed: readonly string[]) =>
  callsOf(obs, "startRun").some((c) => {
    const toolId = field(c.input, "toolId");
    return typeof toolId === "string" && allowed.includes(toolId);
  });

/** Routing (AC-4): startRun for the tool, behind an approval card. */
export const gradeRoute = (obs: TurnObservation, tool: string): Grade =>
  grade([
    [!obs.failed, "the turn failed"],
    [proposedAllowed(obs, [tool]), `no startRun for ${tool}`],
    [obs.approvalRequested, "no approval card"],
  ]);

/**
 * Ambiguity (AC-4): exactly one clarifying question and no tool call, or a proposal of
 * an allowed, registered tool.
 */
export const gradeAmbiguous = (
  obs: TurnObservation,
  allowedRegistered: readonly string[],
): Grade => {
  if (obs.failed) return grade([[false, "the turn failed"]]);
  if (obs.toolCalls.length > 0)
    return grade([
      [
        proposedAllowed(obs, allowedRegistered) && obs.approvalRequested,
        `proposed a tool outside [${allowedRegistered.join(", ")}]`,
      ],
    ]);
  return grade([
    [
      questionMarks(obs.text) === 1,
      `asked ${questionMarks(obs.text)} questions, expected exactly one`,
    ],
  ]);
};

/** Off topic (AC-10): declined politely with a pointer back, and nothing started. */
export const gradeOffTopic = (
  obs: TurnObservation,
  judge: JudgeVerdict | null,
): Grade =>
  grade([
    [!obs.failed, "the turn failed"],
    [obs.toolCalls.length === 0, "called a tool"],
    [judge !== null, "no judge verdict"],
    [judge?.declined ?? false, "not declined"],
    [judge?.polite ?? false, "not polite"],
    [judge?.pointsBack ?? false, "no pointer back to BeamX"],
  ]);

/** On topic (AC-10): never declined. */
export const gradeOnTopic = (
  obs: TurnObservation,
  judge: JudgeVerdict | null,
): Grade =>
  grade([
    [!obs.failed, "the turn failed"],
    [judge !== null, "no judge verdict"],
    [judge !== null && !judge.declined, "declined an on topic message"],
  ]);

/** Pidgin (AC-11): simple English, a light Pidgin touch, short, no headings. */
export const gradePidgin = (
  obs: TurnObservation,
  judge: JudgeVerdict | null,
): Grade =>
  grade([
    [!obs.failed, "the turn failed"],
    [judge?.plainVoice ?? false, "not plain, warm English"],
    [judge?.pidginTouch ?? false, "no light Pidgin touch"],
    [
      wordCount(obs.text) <= VOICE_MAX_WORDS,
      `${wordCount(obs.text)} words, over ${VOICE_MAX_WORDS}`,
    ],
    [!hasHeading(obs.text), "uses a markdown heading"],
  ]);

/** Typed answers (AC-8): saveAnswer with an accepted value, or no save at all. */
export const gradeTypedAnswer = (
  obs: TurnObservation,
  save: {
    readonly questionId: string;
    readonly values?: readonly unknown[];
  } | null,
): Grade => {
  const saves = callsOf(obs, "saveAnswer");
  if (save === null)
    return grade([
      [!obs.failed, "the turn failed"],
      [saves.length === 0, "saved an answer for a side question"],
    ]);
  const hit = saves.find(
    (c) => field(c.input, "questionId") === save.questionId,
  );
  const value = hit === undefined ? undefined : field(hit.input, "value");
  const accepted =
    save.values === undefined
      ? typeof value === "string" && value.trim().length > 0
      : save.values.some((v) => sameValue(v, value));
  return grade([
    [!obs.failed, "the turn failed"],
    [hit !== undefined, `no saveAnswer for ${save.questionId}`],
    [
      hit === undefined || accepted,
      `saved ${JSON.stringify(value)}, expected ${JSON.stringify(save.values ?? "any text")}`,
    ],
  ]);
};

/** Chat controls (AC-9): the named tool, with the expected input fields. */
export const gradeControl = (
  obs: TurnObservation,
  tool: string,
  input: Readonly<Record<string, string>>,
): Grade => {
  const calls = callsOf(obs, tool);
  const matches = calls.some((c) =>
    Object.entries(input).every(([k, v]) => field(c.input, k) === v),
  );
  return grade([
    [!obs.failed, "the turn failed"],
    [calls.length > 0, `no ${tool} call`],
    [
      calls.length === 0 || matches,
      `${tool} input ${JSON.stringify(calls[0]?.input)} does not match ${JSON.stringify(input)}`,
    ],
  ]);
};

/** Grounding (AC-12): the reply states no number of its own. */
export const gradeGrounding = (obs: TurnObservation): Grade =>
  grade([
    [!obs.failed, "the turn failed"],
    [!/\d/.test(obs.text), "the reply states a number"],
  ]);

/** Extraction (AC-5): exactly the expected answers; anything extra was invented. */
export const gradeExtraction = (
  facts: readonly { readonly questionId: string; readonly value: unknown }[],
  expect: Readonly<Record<string, unknown>>,
): Grade => {
  const got = new Map(facts.map((f) => [f.questionId, f.value]));
  const missing = Object.entries(expect).filter(
    ([id, v]) => !sameValue(got.get(id), v),
  );
  const extra = [...got.keys()].filter((id) => !(id in expect));
  return grade([
    [
      missing.length === 0,
      `missing or wrong: ${missing.map(([id]) => `${id}=${JSON.stringify(got.get(id))}`).join(", ")}`,
    ],
    [extra.length === 0, `invented: ${extra.join(", ")}`],
  ]);
};

// ---------------------------------------------------------------------------
// The summary
// ---------------------------------------------------------------------------

export type CaseResult = {
  readonly id: string;
  readonly kind: EvalKind;
  readonly skipped: boolean;
  readonly pass: boolean;
  readonly reasons: readonly string[];
  /** The reply text, for the voice stats (absent for extraction and skipped cases). */
  readonly text?: string;
  readonly judge?: JudgeVerdict | null;
};

export type Rate = {
  readonly passed: number;
  readonly total: number;
  readonly rate: number;
};

export type Bar = Rate & { readonly bar: string; readonly ok: boolean };

export type Summary = {
  readonly routing: Bar;
  readonly offTopicDeclined: Bar;
  readonly onTopicDeclines: {
    readonly declined: number;
    readonly total: number;
    readonly bar: string;
    readonly ok: boolean;
  };
  readonly byKind: Readonly<Record<EvalKind, Rate>>;
  readonly voice: {
    readonly replies: number;
    readonly shortReplies: number;
    readonly withHeadings: number;
  };
  readonly skipped: number;
  readonly ok: boolean;
};

const rateOf = (results: readonly CaseResult[]): Rate => {
  const passed = results.filter((r) => r.pass).length;
  return {
    passed,
    total: results.length,
    rate: results.length === 0 ? 1 : passed / results.length,
  };
};

const KINDS: readonly EvalKind[] = [
  "route",
  "ambiguous",
  "off_topic",
  "on_topic",
  "pidgin",
  "typed_answer",
  "control",
  "grounding",
  "extraction",
];

/** Routing at least 90% (AC-4); off topic declined at least 95%, no on topic declined (AC-10). */
export const ROUTING_BAR = 0.9;
export const OFF_TOPIC_BAR = 0.95;

export const summarize = (results: readonly CaseResult[]): Summary => {
  const ran = results.filter((r) => !r.skipped);
  const of = (...kinds: EvalKind[]) =>
    ran.filter((r) => kinds.includes(r.kind));
  const routing = rateOf(of("route", "ambiguous"));
  const offTopic = of("off_topic");
  const offDeclined = rateOf(
    offTopic.map((r) => ({ ...r, pass: r.judge?.declined === true })),
  );
  const onTopic = of("on_topic");
  const onDeclined = onTopic.filter((r) => r.judge?.declined !== false).length;
  const texts = ran.flatMap((r) =>
    r.text === undefined || r.text.length === 0 ? [] : [r.text],
  );
  const routingBar = {
    ...routing,
    bar: ">= 90%",
    ok: routing.rate >= ROUTING_BAR,
  };
  const offBar = {
    ...offDeclined,
    bar: ">= 95%",
    ok: offDeclined.rate >= OFF_TOPIC_BAR,
  };
  const onBar = {
    declined: onDeclined,
    total: onTopic.length,
    bar: "0",
    ok: onDeclined === 0,
  };
  return {
    routing: routingBar,
    offTopicDeclined: offBar,
    onTopicDeclines: onBar,
    byKind: Object.fromEntries(KINDS.map((k) => [k, rateOf(of(k))])) as Record<
      EvalKind,
      Rate
    >,
    voice: {
      replies: texts.length,
      shortReplies: texts.filter((t) => wordCount(t) < SHORT_REPLY_WORDS)
        .length,
      withHeadings: texts.filter(hasHeading).length,
    },
    skipped: results.length - ran.length,
    ok: routingBar.ok && offBar.ok && onBar.ok,
  };
};

/** Which judge question a case needs, if any. */
export const needsJudge = (kind: EvalCase["kind"]): boolean =>
  kind === "off_topic" || kind === "on_topic" || kind === "pidgin";
