import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  DATABASE_URL_UNPOOLED: z.url(),
  BETTER_AUTH_SECRET: z.string().min(32),
  NEXT_PUBLIC_APP_URL: z.url(),
  // "true" turns on the /design showcase. Read at build time (Cache Components).
  ENABLE_DESIGN_PAGE: z.stringbool().default(false),
});

export type Env = z.infer<typeof schema>;

const skip = process.env.SKIP_ENV_VALIDATION === "1";

/**
 * The only place env vars are read. Required vars fail loudly at first use.
 * `SKIP_ENV_VALIDATION=1` lets `next build` run in CI without secrets.
 */
export const env: Env = skip
  ? ({
      DATABASE_URL: process.env.DATABASE_URL ?? "",
      DATABASE_URL_UNPOOLED: process.env.DATABASE_URL_UNPOOLED ?? "",
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "",
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL ?? "",
      ENABLE_DESIGN_PAGE: process.env.ENABLE_DESIGN_PAGE === "true",
    } satisfies Env)
  : schema.parse(process.env);
