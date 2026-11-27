import { expect, test, type Page } from "@playwright/test";
import { FAKE_REPLIES, FAKE_STELLAR_ANALYSIS } from "../src/lib/fake-model";
import {
  answerEveryCard,
  expectPdfDownload,
  scan,
  signUp,
  TURN_MS,
} from "./flow-helpers";

// Spec 0007, AC-12: one guest goes from the first message to a ready Stellar report and
// back after a reload, against a production build with the scripted fake model
// (`E2E_FAKE_AI=true`, set on the test server in playwright.config.ts). Every project
// starts with no cookies, so each run is a brand new guest. It writes to the database
// the server points at (a throwaway Neon branch in CI).

/** The report body, wherever it shows: the side panel on desktop, the sheet on phones. */
const reportText = (page: Page) =>
  page.getByText(FAKE_STELLAR_ANALYSIS.riskAssessment);

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
    const answered = await answerEveryCard(page, 20);
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

    // Spec 0015, AC-6: a guest can download the PDF; emailing it needs an account.
    const share = await expectPdfDownload(page, "Stellar");
    await expect(
      share.getByRole("button", { name: "Email me this report" }),
    ).toHaveCount(0);
    await expect(
      share.getByRole("button", { name: "Create a free account" }),
    ).toBeVisible();

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

    // AC-1, AC-2, AC-6: Sign up opens the dialog over the same chat; the emailed code
    // creates the account, and the toast says the work is saved.
    await signUp(page, save.getByRole("button", { name: "Sign up" }));
    await expect(
      page.getByText("You're signed in. Your work is saved.").first(),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(page).toHaveURL(chatUrl);
    await expect(
      page.getByRole("button", { name: "Account menu" }),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(save).toHaveCount(0);
    await expect(viewReport.or(reportText(page)).first()).toBeVisible();
  });
});
