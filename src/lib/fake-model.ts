/**
 * Server only. Scripted AI SDK mock models for `pnpm e2e` (spec 0007). Used only when
 * `fakeAiEnabled()` (`env.ts`): `E2E_FAKE_AI=true` and not a production deploy.
 *
 * - `chat`: replies keyed by the latest user text. "business idea" proposes Stellar, "how healthy" proposes Beacon and "deeper" proposes Beacon Pro
 *   (a `startRun` call, which waits for approval); a tool result (the approved run) gets
 *   a short text; anything else gets a short steer towards a tool.
 * - `helper`: known facts extraction finds nothing, so a run opens on its first card.
 * - `report`: a fixed Stellar analysis, for Beacon its own rule advisory back, and for
 *   Beacon Pro a fixed advisory that fits the flags in its prompt.
 *
 * Keep the chat script in step with the assistant's tool flow (spec 0007, Consequences).
 */
import type { LanguageModel } from "ai";
import { MockLanguageModelV4, simulateReadableStream } from "ai/test";

type DoStreamOptions = Parameters<MockLanguageModelV4["doStream"]>[0];
type StreamPart =
  Awaited<
    ReturnType<MockLanguageModelV4["doStream"]>
  >["stream"] extends ReadableStream<infer P>
    ? P
    : never;
type Prompt = DoStreamOptions["prompt"];

export const FAKE_REPLIES = {
  approved: "Great, let's check your idea. Tap an answer on each card.",
  steer:
    "I can check a business idea for you with Stellar. Tell me about your idea to start.",
} as const;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: undefined },
};

const finish = (unified: "stop" | "tool-calls"): StreamPart => ({
  type: "finish",
  finishReason: { unified, raw: unified },
  usage,
});

const textParts = (text: string): StreamPart[] => [
  { type: "text-start", id: "t1" },
  { type: "text-delta", id: "t1", delta: text },
  { type: "text-end", id: "t1" },
  finish("stop"),
];

/** The last message that is not a system note (the run state note goes last). */
const lastTurn = (prompt: Prompt) =>
  [...prompt].reverse().find((m) => m.role !== "system");

const textOf = (message: ReturnType<typeof lastTurn>): string =>
  message?.role === "user"
    ? message.content
        .flatMap((p) => (p.type === "text" ? [p.text] : []))
        .join(" ")
    : "";

/** What the scripted chat model says next, from the prompt alone. Pure. */
export const chatScript = (prompt: Prompt): StreamPart[] => {
  const last = lastTurn(prompt);
  if (last?.role === "tool") return textParts(FAKE_REPLIES.approved);
  const said = textOf(last);
  const toolId = /business idea/i.test(said)
    ? "stellar"
    : /how healthy/i.test(said)
      ? "beacon"
      : /deeper/i.test(said)
        ? "beacon_pro"
        : null;
  if (toolId)
    return [
      {
        type: "tool-call",
        toolCallId: `fake-${prompt.length}`,
        toolName: "startRun",
        input: JSON.stringify({ toolId }),
      },
      finish("tool-calls"),
    ];
  return textParts(FAKE_REPLIES.steer);
};

const ADVISORY_MARK = "Advisory (JSON):\n";

const PRO_MARK = "Write the Beacon Pro advisory report";

/** A paragraph of plain words, so the fake advisory meets Pro's length check. */
const filler = (words: number) => ({
  kind: "paragraph",
  text: Array.from(
    { length: words },
    (_, i) =>
      ["Keep", "a", "daily", "cash", "record", "and", "review", "it"][i % 8],
  ).join(" "),
});

/**
 * A fixed Beacon Pro advisory (`src/tools/beacon/pro-report.ts`) of about 1000 words. Its
 * conditional sections follow the flags the prompt lists, so it passes the phase check.
 */
export const fakeProAdvisory = (prompt: string) => ({
  executive_summary: [filler(300)],
  critical_priorities: /Critical flags: none/.test(prompt)
    ? null
    : [
        { kind: "subheading", text: "Week 1" },
        {
          kind: "bullets",
          items: [{ lead: "Cash", text: "Call every customer who owes you." }],
        },
        filler(150),
      ],
  strategic_recommendations: [filler(300)],
  growth_opportunities: /Opportunity flags: none/.test(prompt)
    ? null
    : [filler(150)],
  next_steps: [
    {
      kind: "numbered",
      items: [{ text: "Book a free strategy call with BeamX." }],
    },
    filler(200),
  ],
});

/**
 * What the scripted report model returns, from the prompt alone. Pure. Beacon's
 * advisory phase gets its own rule advisory back unchanged (it carries it in the
 * prompt), which passes the phase check; every other phase gets the Stellar analysis.
 */
export const reportScript = (prompt: Prompt): unknown => {
  const text = prompt
    .flatMap((m) =>
      m.role === "user"
        ? m.content.flatMap((p) => (p.type === "text" ? [p.text] : []))
        : [],
    )
    .join("\n");
  if (text.includes(PRO_MARK)) return fakeProAdvisory(text);
  const start = text.indexOf(ADVISORY_MARK);
  if (start === -1) return FAKE_STELLAR_ANALYSIS;
  const json = text.slice(start + ADVISORY_MARK.length);
  return JSON.parse(json.slice(0, json.indexOf("\n</client_data>"))) as unknown;
};

const streaming = (script: (prompt: Prompt) => StreamPart[]) =>
  new MockLanguageModelV4({
    modelId: "fake-chat",
    doStream: async (options) => ({
      stream: simulateReadableStream({ chunks: script(options.prompt) }),
    }),
  });

const generating = (modelId: string, reply: (prompt: Prompt) => unknown) =>
  new MockLanguageModelV4({
    modelId,
    doGenerate: async (options) => ({
      content: [{ type: "text", text: JSON.stringify(reply(options.prompt)) }],
      finishReason: { unified: "stop", raw: "stop" },
      usage,
      warnings: [],
    }),
  });

/** A fixed report in Stellar's analysis shape (`src/tools/stellar/report.ts`). */
export const FAKE_STELLAR_ANALYSIS = {
  strengths: [
    "You know your customer well.",
    "You have tested demand with real buyers.",
    "Your startup costs are small.",
  ],
  gaps: [
    "You have not priced your product yet.",
    "You have no plan for your first 50 customers.",
    "You are working on this alone.",
  ],
  personalizedPlan:
    "Start by pricing your product against two competitors.\n\nThen sell to ten customers by hand before you spend on marketing.",
  weeklyRoadmap: [
    { week: 1, tasks: ["List three competitors", "Set a test price"] },
    {
      week: 2,
      tasks: ["Sell to five customers", "Write down every objection"],
    },
    { week: 3, tasks: ["Fix the top objection", "Sell to five more"] },
  ],
  resources: [
    {
      title: "BeamX consultation",
      description: "Talk your plan through with a BeamX adviser.",
      link: null,
    },
  ],
  riskAssessment:
    "The biggest risk is pricing too low to cover your costs. Test your price early.",
};

export type FakeRole = "chat" | "helper" | "report";

/** The fake model for a role. Every call is deterministic and offline. */
export const fakeModel = (role: FakeRole): LanguageModel => {
  switch (role) {
    case "chat":
      return streaming(chatScript);
    case "helper":
      return generating("fake-helper", () => ({ answers: [] }));
    case "report":
      return generating("fake-report", reportScript);
    default: {
      const unreachable: never = role;
      return unreachable;
    }
  }
};
