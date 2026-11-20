#!/usr/bin/env node
// Generates parity fixtures for Stellar and Luna from their original source.
//
// The original repos are only read. The files this needs are copied into a
// temporary folder, their imports rewritten so Node can run them directly
// (Node 24 strips TypeScript types), and the copies are executed there.
//
// Usage:
//   node scripts/parity/generate-ts-tools.mjs --stellar <path to biv> --luna <path to paid-marketing-plan>
//
// Output: fixtures/parity/stellar/*.json and fixtures/parity/luna/*

import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const outRoot = join(repoRoot, "fixtures", "parity");

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i]?.replace(/^--/, "");
    const value = argv[i + 1];
    if (!key || !value) throw new Error(`Bad arguments near "${argv[i]}"`);
    args[key] = resolve(value);
  }
  return args;
}

function sourceInfo(repoPath) {
  const git = (...a) =>
    execFileSync("git", ["-C", repoPath, ...a], { encoding: "utf8" }).trim();
  return {
    remote: git("remote", "get-url", "origin"),
    commit: git("rev-parse", "HEAD"),
    commitDate: git("log", "-1", "--format=%cs"),
    uncommittedChanges: git("status", "--porcelain").length > 0,
  };
}

/** Copy files into a temp dir, applying text rewrites, and return the dir. */
function stage(files) {
  const dir = mkdtempSync(join(tmpdir(), "beamx-parity-"));
  for (const { from, to, rewrite } of files) {
    const target = join(dir, to);
    mkdirSync(dirname(target), { recursive: true });
    if (rewrite) writeFileSync(target, rewrite(readFileSync(from, "utf8")));
    else copyFileSync(from, target);
  }
  return dir;
}

const typeImportFrom = (alias, target) => (text) =>
  text.replace(
    new RegExp(
      `import\\s+(?:type\\s+)?\\{([^}]*)\\}\\s+from\\s+['"]${alias}['"]`,
      "g",
    ),
    `import type {$1} from '${target}'`,
  );

function writeJson(path, data) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + "\n");
}

/** Small seeded PRNG (mulberry32) so random cases are reproducible. */
function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─────────────────────────────────────────────
// Stellar
// ─────────────────────────────────────────────

async function stellar(src) {
  const dir = stage([
    { from: join(src, "types", "index.ts"), to: "types.ts" },
    {
      from: join(src, "lib", "questions.ts"),
      to: "questions.ts",
      rewrite: typeImportFrom("@/types", "./types.ts"),
    },
    {
      from: join(src, "lib", "scoring.ts"),
      to: "scoring.ts",
      rewrite: (t) =>
        typeImportFrom(
          "@/types",
          "./types.ts",
        )(t).replace(/from\s+['"]\.\/questions['"]/, "from './questions.ts'"),
    },
  ]);

  try {
    const { questions } = await import(
      pathToFileURL(join(dir, "questions.ts")).href
    );
    const { calculateScore, calculateDimensionScores } = await import(
      pathToFileURL(join(dir, "scoring.ts")).href
    );

    // Question set, with the function fields turned into data.
    const serializedQuestions = questions.map((q) => {
      const out = {
        id: q.id,
        title: q.title,
        subtitle: q.subtitle ?? null,
        type: q.type,
        placeholder: q.placeholder ?? null,
        options: q.options ?? null,
        followUpPrompt: q.followUpPrompt ?? null,
        followUpTriggers: q.followUpCondition
          ? (q.options ?? [])
              .map((o) => o.value)
              .filter((v) => q.followUpCondition(v))
          : [],
        textMinLengthToCountPositive: null,
      };
      if (q.validation) {
        let n = 0;
        while (!q.validation("x".repeat(n)) && n < 1000) n++;
        out.textMinLengthToCountPositive = n;
      }
      return out;
    });

    const byId = new Map(questions.map((q) => [q.id, q]));
    const goodText = {
      2: "I help small shop owners in Lagos increase sales by setting up simple WhatsApp ordering",
      8: "Jumia (jumia.com.ng), Konga (konga.com)",
    };
    const shortText = { 2: "I sell food", 8: "None" };

    /** Build one response list (in question order) from a choice map. */
    const build = (choices, opts = {}) =>
      questions.map((q) => {
        const answer =
          choices[q.id] ??
          (q.type === "text" ? goodText[q.id] : q.options?.[0]?.value) ??
          "";
        const r = { questionId: q.id, answer };
        const follow = opts.followUps?.[q.id];
        if (follow !== undefined) r.followUpAnswer = follow;
        else if (q.followUpCondition?.(answer))
          r.followUpAnswer = "Follow up detail for testing";
        return r;
      });

    const firstNegative = (id) =>
      byId.get(id).options.find((o) => !o.isPositive).value;
    const negatives = (ids) =>
      Object.fromEntries(ids.map((id) => [id, firstNegative(id)]));
    const radioIds = questions.filter((q) => q.options).map((q) => q.id);

    const named = [
      ["all-positive-ready-now", build({})],
      [
        "all-negative",
        build(
          { ...negatives(radioIds), ...shortText },
          { followUps: { 10: "Fear of failing" } },
        ),
      ],
      ["green-but-months-away", build({ 6: "months" })],
      ["green-almost-ready", build({ 6: "almost" })],
      ["boundary-8-positive-green", build({ ...negatives([3, 7]) })],
      ["boundary-7-positive-yellow", build({ ...negatives([3, 7, 9]) })],
      [
        "yellow-almost-with-long-followup",
        build(
          { ...negatives([1, 3, 7]), 6: "almost" },
          {
            followUps: {
              6: "I still need to finish the logo, register the business name with CAC, open a business account and print flyers for the market",
            },
          },
        ),
      ],
      [
        "yellow-almost-without-followup",
        build(
          { ...negatives([1, 3, 7]), 6: "almost" },
          { followUps: { 6: "" } },
        ),
      ],
      ["boundary-5-positive-yellow", build({ ...negatives([1, 3, 4, 7, 10]) })],
      ["boundary-4-positive-red", build({ ...negatives([1, 3, 4, 7, 9, 10]) })],
      [
        "red-months-away-short-text",
        build({ ...negatives([1, 3, 5, 6, 7, 9, 10]), ...shortText }),
      ],
      [
        "foundation-missing-payment-passion-only",
        build({ 1: "missing-payment", 7: "passion-only" }),
      ],
      [
        "foundation-missing-customers-demand-only",
        build({ 1: "missing-customers", 7: "demand-only" }),
      ],
      [
        "investment-over-1000-talked-no-payment",
        build({ 4: "over-1000", 3: "talked-no-payment" }),
      ],
      ["commitment-maybe", build({ 10: "maybe" })],
    ];

    const rand = rng(20261119);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    const random = Array.from({ length: 60 }, (_, i) => {
      const choices = {};
      for (const q of questions) {
        choices[q.id] = q.options
          ? pick(q.options).value
          : rand() < 0.7
            ? goodText[q.id]
            : shortText[q.id];
      }
      return [`random-${String(i + 1).padStart(2, "0")}`, build(choices)];
    });

    const cases = [...named, ...random].map(([name, responses]) => ({
      name,
      responses,
      expected: {
        score: calculateScore(responses),
        dimensions: calculateDimensionScores(responses),
      },
    }));

    // AI output schema, read from the analyze route without running it.
    const route = readFileSync(
      join(src, "app", "api", "analyze", "route.ts"),
      "utf8",
    );
    const schemaMatch = route.match(
      /RECOMMENDATION_SCHEMA\s*=\s*(\{[\s\S]*?\n\})\s*as const;/,
    );
    if (!schemaMatch)
      throw new Error(
        "Could not find RECOMMENDATION_SCHEMA in analyze/route.ts",
      );
    const schema = Function(`"use strict"; return (${schemaMatch[1]});`)();
    const modelMatch = route.match(/model:\s*'([^']+)'/);

    const source = sourceInfo(src);
    const out = join(outRoot, "stellar");
    writeJson(join(out, "questions.json"), {
      source,
      questions: serializedQuestions,
    });
    writeJson(join(out, "scoring.json"), {
      source,
      note: "Responses are always in question order, as the standalone form sends them.",
      cases,
    });
    writeJson(join(out, "ai-output-schema.json"), {
      source,
      originalModel: modelMatch?.[1] ?? null,
      schema,
    });
    console.log(
      `stellar: ${cases.length} scoring cases, ${questions.length} questions`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// ─────────────────────────────────────────────
// Luna
// ─────────────────────────────────────────────

async function luna(src) {
  const pdf = join(src, "src", "lib", "luna-pdf");
  const dir = stage([
    { from: join(src, "src", "types", "index.ts"), to: "types.ts" },
    {
      from: join(src, "src", "constants", "questionnaire.ts"),
      to: "questionnaire.ts",
      rewrite: typeImportFrom("@/types", "./types.ts"),
    },
    { from: join(pdf, "theme.ts"), to: "luna-pdf/theme.ts" },
    { from: join(pdf, "types.ts"), to: "luna-pdf/types.ts" },
    { from: join(pdf, "examplePlan.ts"), to: "luna-pdf/examplePlan.ts" },
  ]);

  try {
    const q = await import(pathToFileURL(join(dir, "questionnaire.ts")).href);
    const { examplePlan } = await import(
      pathToFileURL(join(dir, "luna-pdf", "examplePlan.ts")).href
    );
    const source = sourceInfo(src);
    const out = join(outRoot, "luna");

    writeJson(join(out, "questions.json"), {
      source,
      counts: {
        businessContext: q.BUSINESS_CONTEXT_QUESTIONS.length,
        questionnaire: q.QUESTIONNAIRE_QUESTIONS.length,
        total:
          q.BUSINESS_CONTEXT_QUESTIONS.length +
          q.QUESTIONNAIRE_QUESTIONS.length,
      },
      squares: q.MARKETING_SQUARES,
      businessContextQuestions: q.BUSINESS_CONTEXT_QUESTIONS,
      questionnaireQuestions: q.QUESTIONNAIRE_QUESTIONS,
    });
    writeJson(join(out, "example-plan.json"), {
      source,
      note: "The reference plan shipped in the Luna repo (test business, no client data). It shows the shape every generated plan follows.",
      plan: examplePlan,
    });

    const planTypes = readFileSync(join(pdf, "types.ts"), "utf8");
    writeFileSync(
      join(out, "plan-shape.md"),
      [
        "# Luna plan shape",
        "",
        `Copied from \`src/lib/luna-pdf/types.ts\` in ${source.remote} at \`${source.commit.slice(0, 8)}\` (${source.commitDate}). Generated by \`scripts/parity/generate-ts-tools.mjs\`; do not edit by hand.`,
        "",
        "Generation runs five Claude calls in order, each adding a slice of this `Plan`:",
        "",
        "1. Analysis (business model, market, positioning, avatar, risks), kept as context for later phases",
        "2. Core: `customerJourney`, `strategicInsights`, `risksPositioning`",
        "3. Overview: `executiveSummary`, `implementation`",
        "4. Operations: `resources`, `kpis`",
        "5. Assets: `templates`, `investmentRoi`",
        "",
        "```ts",
        planTypes.trimEnd(),
        "```",
        "",
      ].join("\n"),
    );
    console.log(
      `luna: ${q.BUSINESS_CONTEXT_QUESTIONS.length + q.QUESTIONNAIRE_QUESTIONS.length} questions, example plan written`,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const args = parseArgs(process.argv.slice(2));
if (!args.stellar && !args.luna) {
  console.error("Pass --stellar <path> and/or --luna <path>");
  process.exit(1);
}
if (args.stellar) await stellar(args.stellar);
if (args.luna) await luna(args.luna);
