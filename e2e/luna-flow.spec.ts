import { expect, test, type Page } from "@playwright/test";
import { answerEveryCard, grant, scan, signUp, TURN_MS } from "./flow-helpers";

// Spec 0013, AC-13: a client asks for a marketing plan, gets Luna proposed at 500 credits,
// answers part of the questionnaire, leaves, comes back to the chat and finishes, and the
// plan is written one phase per call (the panel continues each partial report) until the
// ready plan shows; a reload keeps it. Scripted fake model (`E2E_FAKE_AI=true`).

const PLAN_MS = 240_000;

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

/** The ready plan, wherever it shows: the side panel or the phone sheet. */
const readyPlan = (page: Page) =>
  page
    .getByTestId("report-view")
    .getByRole("region", { name: "Investment and ROI" });

test.describe("Luna marketing plan (spec 0013)", () => {
  test.describe.configure({ timeout: 900_000 });

  test("ask, leave midway, come back, finish 50 cards, five phases, ready plan", async ({
    page,
  }) => {
    await page.goto("/");
    await send(page, "I need a marketing plan for my restaurant");
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();

    const proposal = page.getByRole("region", { name: "Start Luna?" });
    await expect(proposal.getByText("This uses 500 credits.")).toBeVisible({
      timeout: TURN_MS,
    });
    await proposal.getByRole("button", { name: "Approve" }).click();
    const short = page.getByRole("region", { name: "Not enough credits" });
    await expect(short).toBeVisible({ timeout: TURN_MS });
    const email = await signUp(
      page,
      short.getByRole("button", { name: "Sign up" }),
    );
    grant(email, 600);

    await send(page, "I need a marketing plan for my restaurant");
    await page
      .getByRole("region", { name: "Start Luna?" })
      .last()
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });

    // Answer the business questions and the first squares, then leave the chat.
    const first = await answerEveryCard(page, 15, true);
    expect(first).toBe(15);
    await page.goto("/");
    await page.goto(chatUrl);

    // Back in the chat, the open card is waiting; nothing answered is asked again.
    const rest = await answerEveryCard(page, 50);
    expect(first + rest).toBe(50);

    // Five phases, one call each: the panel moves the report on until the plan shows.
    await expect(readyPlan(page)).toBeVisible({ timeout: PLAN_MS });
    for (const name of [
      "Executive Summary",
      "The Customer Journey",
      "Key Performance Indicators",
    ])
      await expect(page.getByRole("region", { name })).toBeVisible();
    await scan(page);

    await page.goto(chatUrl);
    const view = page.getByRole("button", { name: /View report/ }).last();
    await expect(view).toBeVisible({ timeout: TURN_MS });
    if (!(await readyPlan(page).isVisible())) await view.click();
    await expect(readyPlan(page)).toBeVisible({ timeout: TURN_MS });
  });
});
