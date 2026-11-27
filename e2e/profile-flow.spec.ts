import { expect, test, type Page } from "@playwright/test";
import { answerEveryCard, grant, scan, signUp, TURN_MS } from "./flow-helpers";

// Spec 0012, AC-5 to AC-9: a client finishes Beacon, starts Beacon again in a new chat
// and gets the business name, industry and years from their profile on the prefill
// card, then sees and edits the profile on /profile. Runs against a production build
// with the scripted fake model (`E2E_FAKE_AI=true`).

const REPORT_MS = 240_000;

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

const closeSheet = async (page: Page) => {
  const sheet = page.getByRole("dialog");
  if (await sheet.isVisible()) {
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
  }
};

test.describe("business profile (spec 0012)", () => {
  test.describe.configure({ timeout: 600_000 });

  test("Beacon fills the profile, a second Beacon offers it, and /profile edits it", async ({
    page,
  }) => {
    // Sign up from the short balance card, then a staff top up covers two Beacons.
    await page.goto("/");
    await send(page, "How healthy is my business?");
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    await page
      .getByRole("region", { name: "Start Beacon?" })
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });
    const short = page.getByRole("region", { name: "Not enough credits" });
    await expect(short).toBeVisible({ timeout: TURN_MS });
    const email = await signUp(
      page,
      short.getByRole("button", { name: "Sign up" }),
    );
    grant(email, 400);

    // The first Beacon: every card answered by hand.
    await send(page, "How healthy is my business?");
    await page
      .getByRole("region", { name: "Start Beacon?" })
      .last()
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });
    expect(await answerEveryCard(page, 30)).toBe(23);
    await expect(
      page
        .getByTestId("report-view")
        .getByRole("region", { name: "Executive Summary" }),
    ).toBeVisible({ timeout: REPORT_MS });
    await closeSheet(page);

    // A second Beacon in a new chat: the profile fills the prefill card.
    await page.goto("/");
    await send(page, "How healthy is my business?");
    await page
      .getByRole("region", { name: "Start Beacon?" })
      .getByRole("button", { name: "Approve" })
      .click({ timeout: TURN_MS });
    const prefill = page.getByRole("region", { name: "From your profile" });
    await expect(prefill).toBeVisible({ timeout: TURN_MS });
    await expect(prefill.getByText("Retail/Trade")).toBeVisible();
    await expect(prefill.getByText("Less than 1 year")).toBeVisible();
    // The card shows while the turn is still ending, with its buttons disabled (and
    // faded). Scan once they are usable, or axe measures them mid fade.
    for (const button of await prefill.getByRole("button").all())
      await expect(button).toBeEnabled({ timeout: TURN_MS });
    await scan(page);

    // The profile page shows the facts and where they came from, and edits one.
    await page.goto("/profile");
    const list = page.getByTestId("profile-list");
    await expect(list).toBeVisible({ timeout: TURN_MS });
    await expect(list.getByText("Retail and trade")).toBeVisible();
    await expect(list.getByText(/^From Beacon, /).first()).toBeVisible();
    await scan(page);

    await list.getByRole("button", { name: "Edit Industry" }).click();
    await list.getByRole("radio", { name: "Restaurants" }).click();
    await expect(list.getByText("Restaurants")).toBeVisible({
      timeout: TURN_MS,
    });
    await expect(list.getByText(/^You edited this, /)).toBeVisible();

    await list
      .getByRole("button", { name: "Remove Years in business" })
      .click();
    await expect(list.getByText("Less than 1 year")).toBeHidden({
      timeout: TURN_MS,
    });
    await scan(page);
  });
});
