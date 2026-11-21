import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_UNPOOLED: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.url(),
  // "true" turns on the /design showcase. Read at build time (Cache Components).
  ENABLE_DESIGN_PAGE: z.stringbool().default(false),
  // Claude access for the report runner (spec 0005). Optional at boot: a report fails
  // with a logged error when it is missing, so dev and CI run without it.
  // An empty `ANTHROPIC_API_KEY=` line (as in .env.example) counts as unset.
  ANTHROPIC_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Upstash Redis (spec 0001): the chat turn lock and resumable streams now, rate limits
  // later. Optional at boot: without them the turn lock is off (logged), so dev and CI
  // run without Redis. A production deploy fails without both (`envSchema`).
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url().optional(),
  ),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Chat limits (spec 0007, AC-8): typed text longer than this is refused with a notice
  // before any AI call, and so is the typed message after this many in one run.
  MAX_MESSAGE_CHARS: z.coerce.number().int().positive().default(4000),
  RATE_LIMIT_MESSAGES_PER_RUN: z.coerce.number().int().positive().default(40),
  // "true" swaps every AI call for the scripted fake models in `src/lib/fake-model.ts`
  // (spec 0007), for `pnpm e2e`. Ignored on a production deploy, which refuses to boot
  // with it set (`envSchema`).
  E2E_FAKE_AI: z.stringbool().default(false),
  // Set by Vercel. `VERCEL_ENV` marks the deploy kind; `VERCEL=1` means we run on Vercel,
  // where BotID works (spec 0007). Off Vercel BotID treats every request as human.
  VERCEL_ENV: z.enum(["production", "preview", "development"]).optional(),
  VERCEL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional(),
  ),
  // Set by Vercel: the branch alias host (no scheme) on a git deploy. Better Auth trusts it
  // as an origin, since `NEXT_PUBLIC_APP_URL` falls back to the per deploy `VERCEL_URL`.
  VERCEL_BRANCH_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().optional(),
  ),
});

export type Env = z.infer<typeof schema>;

/**
 * The schema for this deploy. In production the turn lock must be real, so a missing
 * Upstash variable fails loudly instead of quietly turning the lock off. Pure.
 */
export const envSchema = (production: boolean) =>
  schema.superRefine((value, ctx) => {
    if (!production) return;
    for (const name of [
      "UPSTASH_REDIS_REST_URL",
      "UPSTASH_REDIS_REST_TOKEN",
    ] as const)
      if (value[name] === undefined)
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required in production (the chat turn lock)`,
        });
    if (value.E2E_FAKE_AI)
      ctx.addIssue({
        code: "custom",
        path: ["E2E_FAKE_AI"],
        message: "E2E_FAKE_AI must never be set on a production deploy",
      });
  });

const skip = process.env.SKIP_ENV_VALIDATION === "1";

/**
 * Preview deploys each get their own URL, so when `NEXT_PUBLIC_APP_URL` is unset the app
 * falls back to Vercel's per deploy `VERCEL_URL`. Production should set it explicitly.
 */
const vercelUrl = process.env.VERCEL_URL
  ? `https://${process.env.VERCEL_URL}`
  : undefined;
const appUrl = process.env.NEXT_PUBLIC_APP_URL || vercelUrl;

/**
 * The only place env vars are read. Required vars fail loudly at first use.
 * `SKIP_ENV_VALIDATION=1` lets `next build` run in CI without secrets.
 */
export const env: Env = skip
  ? ({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED ?? "",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      NEXT_PUBLIC_APP_URL: appUrl ?? "",
      ENABLE_DESIGN_PAGE: process.env.ENABLE_DESIGN_PAGE === "true",
      ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY || undefined,
      UPSTASH_REDIS_REST_URL: process.env.UPSTASH_REDIS_REST_URL || undefined,
      UPSTASH_REDIS_REST_TOKEN:
        process.env.UPSTASH_REDIS_REST_TOKEN || undefined,
      MAX_MESSAGE_CHARS: Number(process.env.MAX_MESSAGE_CHARS) || 4000,
      RATE_LIMIT_MESSAGES_PER_RUN:
        Number(process.env.RATE_LIMIT_MESSAGES_PER_RUN) || 40,
      E2E_FAKE_AI: process.env.E2E_FAKE_AI === "true",
      VERCEL_ENV:
        process.env.VERCEL_ENV === "production" ||
        process.env.VERCEL_ENV === "preview" ||
        process.env.VERCEL_ENV === "development"
          ? process.env.VERCEL_ENV
          : undefined,
      VERCEL: process.env.VERCEL || undefined,
      VERCEL_BRANCH_URL: process.env.VERCEL_BRANCH_URL || undefined,
    } satisfies Env)
  : envSchema(process.env.VERCEL_ENV === "production").parse({
      ...process.env,
      NEXT_PUBLIC_APP_URL: appUrl,
    });

/**
 * Whether AI calls use the scripted fake models (spec 0007). Checked at runtime: never on
 * a production deploy, whatever `E2E_FAKE_AI` says. `next start` runs with
 * `NODE_ENV=production`, so the gate is the deploy kind, not `NODE_ENV`.
 */
export const fakeAiEnabled = (e: Env = env): boolean =>
  e.E2E_FAKE_AI && e.VERCEL_ENV !== "production";
