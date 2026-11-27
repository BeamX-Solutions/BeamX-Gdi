import { expect, test, type Page } from "@playwright/test";
import {
  answerEveryCard,
  expectPdfDownload,
  scan,
  signUp,
  TURN_MS,
} from "./flow-helpers";

// Spec 0010, AC-12 and spec 0011, AC-16: a guest asks how healthy their business is,
// gets Beacon proposed at 150 credits, signs up from the short balance card (a guest's
// starter credits never cover Beacon; sign up adds 150), approves, answers the 23
// cards, and sees the score and the advisory sections, which a reload keeps. Runs
// against a production build with the scripted fake model (`E2E_FAKE_AI=true`).

/** A report's budget: the fake model is instant, a real advisory takes about 30 seconds. */
const REPORT_MS = 240_000;

/**
 * The ready report, wherever it shows: the side panel on desktop, the sheet on phones.
 * The score preview also shows "Your five areas" while the advisory is written, so the
 * ready report is the one with an advisory section.
 */
const readyReport = (page: Page) =>
  page
    .getByTestId("report-view")
    .getByRole("region", { name: "Executive Summary" });

const availableIn = (chip: string): number =>
  Number(/Available:\s*(\d+)/.exec(chip)?.[1] ?? Number.NaN);

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("health check in chat: the whole Beacon flow (spec 0010, AC-12; spec 0011, AC-16)", () => {
  test.describe.configure({ timeout: 600_000 });

  test("ask, sign up, approve, 23 cards, score then advisory, and a reload keeps it", async ({
    page,
  }) => {
    await page.goto("/");
    await send(page, "How healthy is my business?");
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();

    // Beacon is proposed at 150 credits. A guest gets at most the 30 starter credits, so
    // Approve leads to the short balance card, which offers sign up.
    const proposal = page.getByRole("region", { name: "Start Beacon?" });
    await expect(proposal.getByText("This uses 150 credits.")).toBeVisible({
      timeout: TURN_MS,
    });
    await proposal.getByRole("button", { name: "Approve" }).click();
    const short = page.getByRole("region", { name: "Not enough credits" });
    await expect(short).toBeVisible({ timeout: TURN_MS });
    await expect(short.getByText(/You need \d+ credits more/)).toBeVisible();
    await scan(page);
    await signUp(page, short.getByRole("button", { name: "Sign up" }));
    await expect(page).toHaveURL(chatUrl);

    // Sign up adds 150, which covers Beacon whatever the starter grant was (spec 0004).
    await page.reload();
    const chip = page.getByRole("link", { name: /^Available:/ }).filter({
      visible: true,
    });
    await expect(chip).toHaveText(/Available:\s*(150|180) credits/, {
      timeout: TURN_MS,
    });
    const before = availableIn(await chip.innerText());

    // Asked again, Beacon comes with its approval card, now covered.
    await send(page, "How healthy is my business?");
    const again = page.getByRole("region", { name: "Start Beacon?" }).last();
    await expect(
      again.getByText(`You have ${before} credits available.`),
    ).toBeVisible({ timeout: TURN_MS });
    await again.getByRole("button", { name: "Approve" }).click();

    // The business name plus Beacon's 22 questions.
    expect(await answerEveryCard(page, 30)).toBe(23);

    // The report opens by itself, the score first, then the advisory, and the 150
    // credits are charged.
    await expect(readyReport(page)).toBeVisible({ timeout: REPORT_MS });
    for (const name of [
      "Executive Summary",
      "Strategic Recommendations",
      "Your Next Steps",
    ])
      await expect(page.getByRole("region", { name })).toBeVisible({
        timeout: REPORT_MS,
      });
    await scan(page);

    // Spec 0015, AC-5, AC-6: an account downloads the PDF and emails it to itself. Off
    // Vercel with no Resend key the email is printed to the server terminal.
    const share = await expectPdfDownload(page, "Beacon");
    await share.getByRole("button", { name: "Email me this report" }).click();
    await expect(share.getByText(/^Sent to \w\*\*\*@/)).toBeVisible({
      timeout: TURN_MS,
    });
    await scan(page);
    // On phones the report is a sheet over the header; close it to read the chip.
    const sheet = page.getByRole("dialog");
    if (await sheet.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
    await expect(chip).toHaveText(
      new RegExp(`Available:\\s*${before - 150} credits`),
      { timeout: TURN_MS },
    );
    await scan(page);

    // A reload keeps the thread and the report.
    await page.goto(chatUrl);
    const viewReport = page.getByRole("button", { name: /View report/ });
    await expect(viewReport).toBeVisible({ timeout: TURN_MS });
    if (!(await readyReport(page).isVisible())) await viewReport.click();
    await expect(readyReport(page)).toBeVisible({ timeout: TURN_MS });
    await scan(page);
  });
});
