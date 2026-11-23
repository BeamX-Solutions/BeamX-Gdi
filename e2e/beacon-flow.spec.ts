import { expect, test, type Page } from "@playwright/test";
import { answerEveryCard, scan, signUp, TURN_MS } from "./flow-helpers";

// Spec 0010, AC-12: a guest asks how healthy their business is, gets Beacon proposed at
// 50 credits, signs up from the short balance card (a guest's starter credits never
// cover Beacon; sign up adds 50), approves, answers the 23 cards, and sees the ready
// report, which a reload keeps. Runs against a production build with the scripted fake
// model (`E2E_FAKE_AI=true`), whose report model hands back the rule advisory.

/** The ready report, wherever it shows: the side panel on desktop, the sheet on phones. */
const readyReport = (page: Page) =>
  page.getByRole("region", { name: "Your five areas" });

const availableIn = (chip: string): number =>
  Number(/Available:\s*(\d+)/.exec(chip)?.[1] ?? Number.NaN);

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

test.describe("health check in chat: the whole Beacon flow (spec 0010, AC-12)", () => {
  test.describe.configure({ timeout: 600_000 });

  test("ask, sign up for credits, approve, 23 cards, ready report, and a reload keeps it", async ({
    page,
  }) => {
    await page.goto("/");
    await send(page, "How healthy is my business?");
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();

    // Beacon is proposed at 50 credits. A guest gets at most the 30 starter credits (none
    // once the IP has had its starter grants for the day), so Approve leads to the short
    // balance card, which offers sign up.
    const proposal = page.getByRole("region", { name: "Start Beacon?" });
    await expect(proposal.getByText("This uses 50 credits.")).toBeVisible({
      timeout: TURN_MS,
    });
    await proposal.getByRole("button", { name: "Approve" }).click();
    const short = page.getByRole("region", { name: "Not enough credits" });
    await expect(short).toBeVisible({ timeout: TURN_MS });
    await expect(short.getByText(/You need \d+ credits more/)).toBeVisible();
    await scan(page);
    await signUp(page, short.getByRole("button", { name: "Sign up" }));
    await expect(page).toHaveURL(chatUrl);

    // Sign up adds 50, which covers Beacon whatever the starter grant was.
    const chip = page.getByRole("link", { name: /^Available:/ }).filter({
      visible: true,
    });
    await expect(chip).toHaveText(/Available:\s*(50|80) credits/, {
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

    // The report opens by itself and turns from the skeleton into the report, and the
    // 50 credits are charged.
    await expect(readyReport(page)).toBeVisible({ timeout: 60_000 });
    for (const name of ["What we found", "Executive Summary", "Talk to BeamX"])
      await expect(page.getByRole("region", { name })).toBeVisible();
    await scan(page);
    // On phones the report is a sheet over the header; close it to read the chip.
    const sheet = page.getByRole("dialog");
    if (await sheet.isVisible()) {
      await page.keyboard.press("Escape");
      await expect(sheet).toBeHidden();
    }
    await expect(chip).toHaveText(
      new RegExp(`Available:\\s*${before - 50} credits`),
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
