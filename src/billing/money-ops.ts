/**
 * Pure helpers for the account grants and the staff money operations (spec 0004,
 * milestone 4): the sign up grant's keyed email hash, the Luna CSV, and the
 * `credits:adjust` arguments. No I/O: the query layer and the scripts call these.
 */
import { createHmac } from "node:crypto";
import { z } from "zod";
import { err, ok, type Result } from "@/lib/result";

/** How every email is compared: lowercased and trimmed (AC-11, AC-16). */
export const normalizeEmail = (email: string): string =>
  email.trim().toLowerCase();

/**
 * `signup_grant_claim.email_hash` (AC-11): HMAC SHA256 of the normalized email with
 * `BILLING_HASH_SECRET`, hex. No readable email is kept, and the hash can't be reversed
 * without the server key.
 */
export const signupEmailHash = (email: string, secret: string): string =>
  createHmac("sha256", secret).update(normalizeEmail(email)).digest("hex");

export type LunaRow = {
  readonly email: string;
  readonly lunaCredits: number;
  readonly credits: number;
};

export type CsvProblem = { readonly line: number; readonly reason: string };

const lunaRowSchema = z.object({
  email: z.email(),
  lunaCredits: z.coerce.number().int().positive(),
});

/**
 * Parses the Luna export, `email,luna_credits` with a header line, into import rows at
 * `rate` workspace credits per Luna credit (AC-16). All or nothing: any bad line (a bad
 * email, a non positive or non whole amount, a repeated email, a wrong column count)
 * returns every problem with its line number and no rows, so nothing is half imported.
 */
export const parseLunaCsv = (
  text: string,
  rate: number,
): Result<readonly LunaRow[], readonly CsvProblem[]> => {
  const lines = text
    .split(/\r?\n/)
    .map((raw, i) => ({ raw: raw.trim(), line: i + 1 }))
    .filter((l) => l.raw !== "");
  const [header, ...body] = lines;
  if (
    header === undefined ||
    header.raw.toLowerCase().replace(/\s/g, "") !== "email,luna_credits"
  )
    return err([{ line: 1, reason: "header must be email,luna_credits" }]);
  const seen = new Set<string>();
  const problems: CsvProblem[] = [];
  const rows: LunaRow[] = [];
  for (const { raw, line } of body) {
    const cells = raw.split(",").map((c) => c.trim());
    if (cells.length !== 2) {
      problems.push({ line, reason: "expected 2 columns" });
      continue;
    }
    const parsed = lunaRowSchema.safeParse({
      email: cells[0],
      lunaCredits: cells[1],
    });
    if (!parsed.success) {
      problems.push({
        line,
        reason:
          parsed.error.issues[0]?.path[0] === "email"
            ? "invalid email"
            : "luna_credits must be a whole number above 0",
      });
      continue;
    }
    const email = normalizeEmail(parsed.data.email);
    if (seen.has(email)) {
      problems.push({ line, reason: "email appears twice" });
      continue;
    }
    seen.add(email);
    rows.push({
      email,
      lunaCredits: parsed.data.lunaCredits,
      credits: parsed.data.lunaCredits * rate,
    });
  }
  return problems.length > 0 ? err(problems) : ok(rows);
};

export type AdjustArgs = {
  readonly email: string;
  readonly amount: number;
  readonly reason: string;
  readonly actor: string;
  readonly yes: boolean;
};

const adjustSchema = z.object({
  email: z.email(),
  amount: z.coerce
    .number()
    .int()
    .refine((n) => n !== 0, "amount must not be 0"),
  reason: z.string().trim().min(3, "--reason is required"),
  actor: z.email("--actor must be a staff email"),
});

/**
 * `pnpm credits:adjust <email> <amount> --reason <text> --actor <email> [--yes]`
 * (AC-17). Every value is required; the amount is a signed whole number, never 0.
 */
export const parseAdjustArgs = (
  argv: readonly string[],
): Result<AdjustArgs, string> => {
  const positional: string[] = [];
  const flags: Record<string, string> = {};
  let yes = false;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i] ?? "";
    if (a === "--yes" || a === "-y") yes = true;
    else if (a === "--reason" || a === "--actor") {
      const value = argv[i + 1];
      if (value === undefined) return err(`${a} needs a value`);
      flags[a.slice(2)] = value;
      i++;
    } else if (a.startsWith("--")) return err(`unknown flag ${a}`);
    else positional.push(a);
  }
  if (positional.length !== 2)
    return err(
      "usage: pnpm credits:adjust <email> <amount> --reason <text> --actor <email> [--yes]",
    );
  const parsed = adjustSchema.safeParse({
    email: positional[0],
    amount: positional[1],
    reason: flags.reason ?? "",
    actor: flags.actor ?? "",
  });
  if (!parsed.success)
    return err(parsed.error.issues[0]?.message ?? "invalid arguments");
  return ok({
    email: normalizeEmail(parsed.data.email),
    amount: parsed.data.amount,
    reason: parsed.data.reason,
    actor: normalizeEmail(parsed.data.actor),
    yes,
  });
};
