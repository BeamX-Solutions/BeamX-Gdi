import { z } from "zod";

/** A positive whole number from env with a default; an empty line counts as unset. */
const limit = (fallback: number) =>
  z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().positive().default(fallback),
  );

/** `limit` read by hand for the `SKIP_ENV_VALIDATION` path. */
const rawLimit = (v: string | undefined, fallback: number): number => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : fallback;
};

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
  // Upstash Redis (spec 0001): the chat turn lock, resumable streams and the abuse limits
  // (spec 0008). Optional at boot: without them the turn lock is off (logged), so dev and CI
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
  // Abuse and AI cost guards (spec 0008, AC-10). Daily counts reset at Lagos midnight.
  // The cap is dollars of AI spend a Lagos day; once reached, guests pause (AC-2).
  AI_DAILY_SPEND_CAP_USD: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().positive().default(20),
  ),
  // Chat requests a minute, per user and per IP (AC-7). Card taps (answers, prefill,
  // retry), which never call the AI, have their own looser user window (AC-12).
  LIMIT_BURST_PER_USER: limit(10),
  LIMIT_BURST_CARDS_PER_USER: limit(30),
  LIMIT_BURST_PER_IP: limit(60),
  // A guest's typed messages with no run in progress, and new chats, a day (AC-5, AC-6).
  LIMIT_CHAT_PER_GUEST: limit(30),
  LIMIT_CHATS_PER_GUEST: limit(20),
  // Guest tool runs started a day, per guest and per IP (AC-4).
  LIMIT_RUNS_PER_GUEST: limit(3),
  LIMIT_RUNS_PER_IP: limit(20),
  // New guests a day from one IP (AC-8).
  LIMIT_GUESTS_PER_IP: limit(30),
  // Vercel Cron's bearer token for `/api/cron/billing` (spec 0004). Without it the cron
  // route refuses every call. Required in production.
  CRON_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(16).optional(),
  ),
  // Keys the sign up grant's email hash (spec 0004, AC-11). Never rotate it without a
  // plan: a new key lets every old email claim the grant again. Required in production;
  // without it the sign up grant is skipped (logged), everything else still works.
  BILLING_HASH_SECRET: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(32).optional(),
  ),
  // Paystack (spec 0004): the checkout's initialize and verify calls and the webhook
  // signature check. Optional at boot, like `RESEND_API_KEY`: without it buying credits
  // answers `paystack_unavailable` and the webhook refuses every call. A test key
  // (`sk_test_...`) on Preview and local, the live key only on Production.
  PAYSTACK_SECRET_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Resend (spec 0009): the 6 digit code emails for sign up and password reset. Both are
  // required in production; in dev without a key the code is logged to the console.
  RESEND_API_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // The sender, e.g. `BeamX <no-reply@beamxsolutions.com>`.
  EMAIL_FROM: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(3).optional(),
  ),
  // Book a consultation (spec 0016). The Calendly page the booking widget shows.
  CALENDLY_URL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.url().default("https://calendly.com/beamxsolutions"),
  ),
  // The webhook subscription's signing key. Optional at boot: without it the webhook
  // answers 503 and bookings are not confirmed in the chat.
  CALENDLY_WEBHOOK_SIGNING_KEY: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(8).optional(),
  ),
  // A Calendly personal access token, read only by `pnpm calendly:subscribe`.
  CALENDLY_API_TOKEN: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.string().min(1).optional(),
  ),
  // Where BeamX gets each booking with the client's reports. Without it that email is
  // skipped and logged.
  CONSULTATION_NOTIFY_EMAIL: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.email().optional(),
  ),
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
    if (value.CRON_SECRET === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["CRON_SECRET"],
        message:
          "CRON_SECRET is required in production (the daily billing job)",
      });
    if (value.BILLING_HASH_SECRET === undefined)
      ctx.addIssue({
        code: "custom",
        path: ["BILLING_HASH_SECRET"],
        message:
          "BILLING_HASH_SECRET is required in production (the sign up grant)",
      });
    for (const name of ["RESEND_API_KEY", "EMAIL_FROM"] as const)
      if (value[name] === undefined)
        ctx.addIssue({
          code: "custom",
          path: [name],
          message: `${name} is required in production (the sign up code emails)`,
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
      AI_DAILY_SPEND_CAP_USD: rawLimit(process.env.AI_DAILY_SPEND_CAP_USD, 20),
      LIMIT_BURST_PER_USER: rawLimit(process.env.LIMIT_BURST_PER_USER, 10),
      LIMIT_BURST_CARDS_PER_USER: rawLimit(
        process.env.LIMIT_BURST_CARDS_PER_USER,
        30,
      ),
      LIMIT_BURST_PER_IP: rawLimit(process.env.LIMIT_BURST_PER_IP, 60),
      LIMIT_CHAT_PER_GUEST: rawLimit(process.env.LIMIT_CHAT_PER_GUEST, 30),
      LIMIT_CHATS_PER_GUEST: rawLimit(process.env.LIMIT_CHATS_PER_GUEST, 20),
      LIMIT_RUNS_PER_GUEST: rawLimit(process.env.LIMIT_RUNS_PER_GUEST, 3),
      LIMIT_RUNS_PER_IP: rawLimit(process.env.LIMIT_RUNS_PER_IP, 20),
      LIMIT_GUESTS_PER_IP: rawLimit(process.env.LIMIT_GUESTS_PER_IP, 30),
      CRON_SECRET: process.env.CRON_SECRET || undefined,
      BILLING_HASH_SECRET: process.env.BILLING_HASH_SECRET || undefined,
      PAYSTACK_SECRET_KEY: process.env.PAYSTACK_SECRET_KEY || undefined,
      RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
      EMAIL_FROM: process.env.EMAIL_FROM || undefined,
      CALENDLY_URL:
        process.env.CALENDLY_URL || "https://calendly.com/beamxsolutions",
      CALENDLY_WEBHOOK_SIGNING_KEY:
        process.env.CALENDLY_WEBHOOK_SIGNING_KEY || undefined,
      CALENDLY_API_TOKEN: process.env.CALENDLY_API_TOKEN || undefined,
      CONSULTATION_NOTIFY_EMAIL:
        process.env.CONSULTATION_NOTIFY_EMAIL || undefined,
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
