import { execFileSync } from "node:child_process";
import { expect, test, type Page } from "@playwright/test";
import { answerEveryCard, scan, signUp, TURN_MS } from "./flow-helpers";

// Spec 0011, AC-16: a client who finished Beacon asks for something deeper, approves the
// Beacon Pro card that names the reused Beacon answers, answers no cards, and sees the
// Pro report (header, flags and the advisory sections); a reload keeps it. Runs against
// a production build with the scripted fake model (`E2E_FAKE_AI=true`).

/** A report's budget: the fake model is instant, a real advisory takes a minute or two. */
const REPORT_MS = 240_000;

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

/** Closes the phone report sheet, if one is open, so the thread is reachable. */
const closeSheet = async (page: Page) => {
  const sheet = page.getByRole("dialog");
  if (await sheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
};

/**
 * A staff grant through the real script (spec 0004, AC-17), so Pro's 150 is covered.
 * On Windows, Node can crash on exit after the script's work is done (a libuv
 * assertion), so success is read from the script's "Done." line, not its exit code.
 */
const grant = (email: string, amount: number) => {
  const args = [
    "node_modules/tsx/dist/cli.mjs",
    "--env-file-if-exists=.env",
    "scripts/credits/adjust.ts",
    email,
    String(amount),
    "--reason",
    "e2e Beacon Pro",
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

test.describe("Beacon Pro in chat: reuse the Beacon answers (spec 0011, AC-16)", () => {
  test.describe.configure({ timeout: 600_000 });

  test("finish Beacon, ask for deeper, approve the reuse card, no cards, Pro report, reload keeps it", async ({
    page,
  }) => {
    await page.goto("/");
    await send(page, "How healthy is my business?");
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();

    // A guest never has Beacon's 50: sign up from the short balance card.
    const proposal = page.getByRole("region", { name: "Start Beacon?" });
    await proposal
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });
    const short = page.getByRole("region", { name: "Not enough credits" });
    await expect(short).toBeVisible({ timeout: TURN_MS });
    const email = await signUp(
      page,
      short.getByRole("button", { name: "Sign up" }),
    );
    await expect(page).toHaveURL(chatUrl);
    grant(email, 200);

    await send(page, "How healthy is my business?");
    await page
      .getByRole("region", { name: "Start Beacon?" })
      .last()
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });
    expect(await answerEveryCard(page, 30)).toBe(23);
    await expect(
      page.getByRole("region", { name: "Executive Summary" }),
    ).toBeVisible({ timeout: REPORT_MS });
    await closeSheet(page);

    // Pro is proposed with the reuse line naming the Beacon answers.
    await send(page, "I want something deeper");
    const pro = page.getByRole("region", { name: "Start Beacon Pro?" });
    await expect(pro.getByText("This uses 150 credits.")).toBeVisible({
      timeout: TURN_MS,
    });
    await expect(pro.getByText(/Uses your Beacon answers from/)).toBeVisible();
    await scan(page);
    await pro.getByRole("button", { name: "Approve" }).click();

    // No question cards: the Pro report opens by itself.
    const proReport = page
      .getByTestId("report-view")
      .filter({ hasText: "Beacon Pro" });
    await expect(proReport).toBeVisible({ timeout: REPORT_MS });
    for (const name of [
      "Your five areas",
      "Executive Summary",
      "Strategic Recommendations",
      "Your Next Steps",
    ])
      await expect(proReport.getByRole("region", { name })).toBeVisible();
    await expect(page.getByRole("radio")).toHaveCount(0);
    await scan(page);

    // A reload keeps the Pro report.
    await page.goto(chatUrl);
    const view = page.getByRole("button", { name: /View report/ }).last();
    await expect(view).toBeVisible({ timeout: TURN_MS });
    if (!(await proReport.isVisible())) await view.click();
    await expect(proReport).toBeVisible({ timeout: TURN_MS });
  });
});
