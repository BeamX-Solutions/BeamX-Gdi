import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { FAKE_REPLIES, FAKE_STELLAR_ANALYSIS } from "../src/lib/fake-model";

// Spec 0007, AC-12: one guest goes from the first message to a ready Stellar report and
// back after a reload, against a production build with the scripted fake model
// (`E2E_FAKE_AI=true`, set on the test server in playwright.config.ts). Every project
// starts with no cookies, so each run is a brand new guest. It writes to the database
// the server points at (a throwaway Neon branch in CI).

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const scan = async (page: Page) => {
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
    await expect(page.getByText(FAKE_REPLIES.approved)).toBeVisible({
      timeout: TURN_MS,
    });

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
  });
});
