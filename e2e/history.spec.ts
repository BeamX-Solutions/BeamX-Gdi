import { expect, test, type Page } from "@playwright/test";
import { scan, TURN_MS } from "./flow-helpers";

// Feature #14: two chats appear in the history rail, newest first, and opening one
// continues it. Scripted fake model; no credits needed.

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

/** The rail, wherever it shows: the side column on desktop, the drawer on phones. */
const openRail = async (page: Page) => {
  const drawer = page.getByRole("button", { name: "Open chat history" });
  if (await drawer.isVisible()) await drawer.click();
  return page.getByRole("navigation", { name: "Recent chats" });
};

test("chats show in the history rail and reopen", async ({ page }) => {
  await page.goto("/");
  await send(page, "Hello there, first chat");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
  const firstUrl = page.url();
  await expect(page.getByText(/I can check a business idea/)).toBeVisible({
    timeout: TURN_MS,
  });

  await page.goto("/");
  await send(page, "Hello again, second chat");
  await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
  await expect(
    page.getByText(/I can check a business idea/).last(),
  ).toBeVisible({ timeout: TURN_MS });

  const rail = await openRail(page);
  const links = rail.getByRole("link");
  await expect(links.first()).toHaveText(/Hello again, second chat/, {
    timeout: TURN_MS,
  });
  await expect(
    rail.getByRole("link", { name: /Hello there, first chat/ }),
  ).toBeVisible();
  await expect(rail.locator('[aria-current="page"]')).toHaveText(
    /Hello again, second chat/,
  );
  await scan(page);

  await rail.getByRole("link", { name: /Hello there, first chat/ }).click();
  await expect(page).toHaveURL(firstUrl, { timeout: TURN_MS });
  await expect(page.getByText("Hello there, first chat").first()).toBeVisible();
});
