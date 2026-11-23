import { existsSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { neon } from "@neondatabase/serverless";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_REPLIES, FAKE_STELLAR_ANALYSIS } from "../src/lib/fake-model";

// Spec 0007, AC-12: one guest goes from the first message to a ready Stellar report and
// back after a reload, against a production build with the scripted fake model
// (`E2E_FAKE_AI=true`, set on the test server in playwright.config.ts). Every project
// starts with no cookies, so each run is a brand new guest. It writes to the database
// the server points at (a throwaway Neon branch in CI).

// The sign up step reads the emailed code from the database the server uses: CI sets
// DATABASE_URL in the job, a local run takes it from `.env`.
if (!process.env.DATABASE_URL && existsSync(".env"))
  process.loadEnvFile(".env");

/**
 * The 6 digit code Better Auth stored for this email's sign up (spec 0009). The email
 * itself is printed to the server's terminal off Vercel; the code row is `<otp>:<tries>`.
 */
const emailedCode = async (email: string): Promise<string> => {
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

const scan = async (page: Page) => {
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

/** One turn's budget: generous, since a laptop far from Frankfurt waits on Redis and the DB. */
const TURN_MS = 60_000;

/** The report body, wherever it shows: the side panel on desktop, the sheet on phones. */
const reportText = (page: Page) =>
  page.getByText(FAKE_STELLAR_ANALYSIS.riskAssessment);

/**
 * Answers whatever card is live until the run ends. Stellar asks 11 questions, plus a
 * follow up for some answers, so the loop follows the cards rather than a fixed list.
 */
const answerEveryCard = async (page: Page) => {
  // The run is over once the view report card or the report itself shows. On phones the
  // report opens as a full screen sheet, which hides the thread behind it.
  const ended = page
    .getByRole("button", { name: /View report/ })
    .or(page.getByRole("dialog"));
  const idle = page.getByRole("textbox", { name: "Message", disabled: false });
  for (let answered = 0; answered < 20; answered++) {
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
  throw new Error("The run did not end after 20 answers");
};

test.describe("validate an idea in chat: the whole flow (AC-12)", () => {
  test.describe.configure({ timeout: 600_000 });

  test("first message, approve, every card, ready report, and a reload keeps it", async ({
    page,
  }) => {
    // AC-1: an empty chat with starter prompts; nothing is created until the first send.
    await page.goto("/");
    const starter = page.getByRole("button", {
      name: "I have a business idea",
    });
    await expect(starter).toBeEnabled();
    await expect(page.getByTestId("credit-chip")).toHaveCount(0);
    await scan(page);

    // AC-1, AC-3: the first send signs the guest in, moves to /c/[id], and gets the
    // Stellar confirm card for 30 credits.
    await starter.click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();
    await expect(page.getByText(/30 credits/).first()).toBeVisible({
      timeout: TURN_MS,
    });

    // AC-3: approving holds the credits and opens the first card.
    await page.getByRole("button", { name: "Approve" }).click();
    // Scoped to the reply bubbles: the screen reader live region repeats the finished
    // reply, so a page wide text match finds it twice once the announcement lands.
    await expect(
      page.locator('[data-from="assistant"]').getByText(FAKE_REPLIES.approved),
    ).toBeVisible({ timeout: TURN_MS });

    // AC-4: every card answered completes the run.
    const answered = await answerEveryCard(page);
    expect(answered).toBeGreaterThanOrEqual(11);

    // AC-4: the report opens by itself and turns from the skeleton into the report.
    await expect(reportText(page)).toBeVisible({ timeout: 60_000 });
    // AC-9: the 30 credits are charged, so the chip drops to 0.
    await expect(page.getByTestId("credit-chip")).toHaveText(
      /Available:\s*0 credits/,
      { timeout: TURN_MS },
    );
    await scan(page);

    // AC-5: a reload keeps the thread and the report.
    await page.goto(chatUrl);
    const viewReport = page.getByRole("button", { name: /View report/ });
    await expect(viewReport).toBeVisible({ timeout: TURN_MS });
    await expect(page.getByTestId("credit-chip")).toHaveText(
      /Available:\s*0 credits/,
    );
    if (!(await reportText(page).isVisible())) await viewReport.click();
    await expect(reportText(page)).toBeVisible({ timeout: TURN_MS });
    await scan(page);

    // Spec 0009, AC-1: the guest's ready report brings the save prompt into the thread.
    // On phones the report is a sheet over the thread; close it first.
    const sheet = page.getByRole("dialog");
    if (await sheet.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
    const save = page.getByRole("region", { name: "Save your report" });
    await expect(save).toBeVisible({ timeout: TURN_MS });
    await scan(page);

    // AC-1, AC-2: Sign up opens the dialog on sign up, over the same chat.
    await save.getByRole("button", { name: "Sign up" }).click();
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

    // AC-2: the code from the email creates the account, then the password is set.
    const codeStep = page.getByRole("dialog", { name: "Check your email" });
    await expect(codeStep).toBeVisible({ timeout: TURN_MS });
    await scan(page);
    await codeStep.getByLabel("Code").fill(await emailedCode(email));
    await codeStep.getByRole("button", { name: "Create account" }).click();

    // AC-6: signed in on the same chat, the toast says the work is saved, the report is
    // still there, and the save prompt is gone for good.
    await expect(
      page.getByText("You're signed in. Your work is saved.").first(),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(page.getByRole("dialog")).toBeHidden();
    await expect(page).toHaveURL(chatUrl);
    await expect(
      page.getByRole("button", { name: "Account menu" }),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(save).toHaveCount(0);
    await expect(viewReport.or(reportText(page)).first()).toBeVisible();
  });
});
