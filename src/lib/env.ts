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
  // Upstash Redis (spec 0001): the chat turn lock now, rate limits and resumable streams
  // later. Optional at boot: without them the turn lock is off (logged), so dev and CI
  // run without Redis. Production must set both.
  UPSTASH_REDIS_REST_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url().optional(),
  ),
  UPSTASH_REDIS_REST_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
});

export type Env = z.infer<typeof schema>;

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
    } satisfies Env)
  : schema.parse({ ...process.env, NEXT_PUBLIC_APP_URL: appUrl });
