/**
 * Shared steps for the whole flow tests (spec 0007 Stellar, spec 0010 Beacon): reading
 * the emailed sign up code, the axe scan, answering every card, and signing up.
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { neon } from "@neondatabase/serverless";
import { expect, type Locator, type Page } from "@playwright/test";

// The sign up step reads the emailed code from the database the server uses: CI sets
// DATABASE_URL in the job, a local run takes it from `.env`.
if (!process.env.DATABASE_URL && existsSync(".env"))
  process.loadEnvFile(".env");

/** One turn's budget: generous, since a laptop far from Frankfurt waits on Redis and the DB. */
export const TURN_MS = 60_000;

/**
 * The 6 digit code Better Auth stored for this email's sign up (spec 0009). The email
 * itself is printed to the server's terminal off Vercel; the code row is `<otp>:<tries>`.
 */
export const emailedCode = async (email: string): Promise<string> => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is needed to read the sign up code");
  const rows = await neon(url)`
    select value from verification
    where identifier = ${`sign-in-otp-${email}`}
    order by created_at desc limit 1`;
  const value: unknown = rows[0]?.value;
  if (typeof value !== "string") throw new Error("No sign up code was stored");
  return value.split(":")[0] ?? "";
};

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

export const scan = async (page: Page) => {
  // Let open animations (a dialog's fade in) finish, or axe measures half faded text.
  // Endless ones, like the shimmer, never finish, so they are skipped.
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((a) => a.effect?.getComputedTiming().endTime !== Infinity)
        .map((a) => a.finished.catch(() => undefined)),
    ),
  );
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations).toEqual([]);
};

/**
 * Answers whatever card is live until the run ends: the first option on a choice card,
 * a short sentence on a text card. Follows the cards rather than a fixed list, so it
 * works for any tool. Returns how many cards it answered.
 */
export const answerEveryCard = async (
  page: Page,
  limit: number,
): Promise<number> => {
  // The run is over once the view report card or the report itself shows. On phones the
  // report opens as a full screen sheet, which hides the thread behind it.
  const ended = page
    .getByRole("button", { name: /View report/ })
    .or(page.getByRole("dialog"));
  const idle = page.getByRole("textbox", { name: "Message", disabled: false });
  for (let answered = 0; answered < limit; answered++) {
    const radio = page.getByRole("radio").first();
    const text = page.getByRole("group").getByRole("textbox").first();
    await expect(radio.or(text).or(ended).first()).toBeVisible({
      timeout: TURN_MS,
    });
    if (await ended.first().isVisible()) return answered;
    if (await radio.isVisible()) {
      await radio.click();
    } else {
      await text.fill(
        "I help market traders sell more by taking orders online.",
      );
      await page.getByRole("button", { name: "Submit" }).click();
    }
    // The tap is its own turn; wait for it to land before reading the next card.
    await expect(idle.or(ended).first()).toBeVisible({ timeout: TURN_MS });
  }
  throw new Error(`The run did not end after ${limit} answers`);
};

/**
 * Fills the sign up dialog that `opener` opens, enters the emailed code, and waits for
 * the account menu. Checks each dialog step with axe. Returns the new account's email.
 */
export const signUp = async (page: Page, opener: Locator): Promise<string> => {
  await opener.click();
  const details = page.getByRole("dialog", { name: "Create your account" });
  await expect(details).toBeVisible();
  await scan(page);
  const email = `e2e-${crypto.randomUUID()}@signup.test`;
  await details.getByLabel("First name").fill("Ada");
  await details.getByLabel("Email").fill(email);
  await details
    .getByLabel("Password", { exact: true })
    .fill(`pw-${crypto.randomUUID()}`);
  await details.getByRole("button", { name: "Continue" }).click();

  const codeStep = page.getByRole("dialog", { name: "Check your email" });
  await expect(codeStep).toBeVisible({ timeout: TURN_MS });
  await scan(page);
  await codeStep.getByLabel("Code").fill(await emailedCode(email));
  await codeStep.getByRole("button", { name: "Create account" }).click();

  await expect(page.getByRole("button", { name: "Account menu" })).toBeVisible({
    timeout: TURN_MS,
  });
  await expect(page.getByRole("dialog")).toBeHidden();
  return email;
};

/**
 * A staff grant through the real script (spec 0004, AC-17), so a test account can afford a run.
 * On Windows, Node can crash on exit after the script's work is done (a libuv
 * assertion), so success is read from the script's "Done." line, not its exit code.
 */
export const grant = (email: string, amount: number) => {
  const args = [
    "node_modules/tsx/dist/cli.mjs",
    "--env-file-if-exists=.env",
    "scripts/credits/adjust.ts",
    email,
    String(amount),
    "--reason",
    "e2e top up",
    "--actor",
    "e2e@beamx.test",
    "--yes",
  ];
  const output = (() => {
    try {
      return execFileSync(process.execPath, args, { encoding: "utf8" });
    } catch (e) {
      const stdout = (e as { stdout?: unknown }).stdout;
      return typeof stdout === "string" ? stdout : "";
    }
  })();
  expect(output).toContain("Done. Balance");
};
