import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { scan, signUp, TURN_MS } from "./flow-helpers";

// Spec 0017: the policy pages, the links to them (AC-1, AC-4), and Download my data for
// a guest and an account (AC-7, AC-8). Runs against a production build with the
// scripted fake model (`E2E_FAKE_AI=true`).

const send = async (page: Page, text: string) => {
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible({ timeout: TURN_MS });
  await box.fill(text);
  await page.getByRole("button", { name: "Send" }).click();
};

/** Opens the menu, downloads, and returns the parsed file and its name. */
const download = async (page: Page, menu: string) => {
  await page.getByRole("button", { name: menu }).click();
  const [file] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("menuitem", { name: "Download my data" }).click(),
  ]);
  const path = await file.path();
  return {
    name: file.suggestedFilename(),
    data: JSON.parse(await readFile(path, "utf8")) as {
      readonly format: string;
      readonly user: { readonly guest: boolean; readonly email: string | null };
      readonly conversations: readonly { readonly id: string }[];
      readonly policyAcceptances: readonly { readonly policy: string }[];
    },
  };
};

test.describe("policy pages (AC-1)", () => {
  for (const [path, title, other] of [
    ["/privacy", "Privacy notice", "Terms of use"],
    ["/terms", "Terms of use", "Privacy notice"],
  ] as const)
    test(`${path} shows its date and version and links the other policy`, async ({
      page,
    }) => {
      await page.goto(path);
      await expect(
        page.getByRole("heading", { level: 1, name: title }),
      ).toBeVisible();
      await expect(page.getByText(/Last updated .* · Version /)).toBeVisible();
      await expect(page.getByRole("link", { name: other })).toBeVisible();
      await scan(page);
    });
});

test.describe("policy links and Download my data (AC-4, AC-7, AC-8)", () => {
  test.describe.configure({ timeout: 300_000 });

  test("a guest sees the composer notice, the menu links, and downloads their chat", async ({
    page,
  }) => {
    await page.goto("/");
    const notice = page.getByText("By chatting you agree to our");
    await expect(notice).toBeVisible();
    await expect(notice.getByRole("link", { name: "Terms" })).toHaveAttribute(
      "href",
      "/terms",
    );
    await expect(
      notice.getByRole("link", { name: "Privacy notice" }),
    ).toHaveAttribute("href", "/privacy");

    // Before the first send there is no guest, so only the policy links.
    await page.getByRole("button", { name: "More options" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Privacy notice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Terms of use" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Download my data" }),
    ).toHaveCount(0);
    // Scanned closed: an open Radix menu hides the rest of the page from axe on purpose.
    await page.keyboard.press("Escape");
    await scan(page);

    await send(page, "Hello");
    await expect(page).toHaveURL(/\/c\/([0-9a-f-]{36})$/, { timeout: TURN_MS });
    const chatId = page.url().split("/c/")[1];

    const { name, data } = await download(page, "More options");
    expect(name).toMatch(/^beamx-data-\d{4}-\d{2}-\d{2}\.json$/);
    expect(data.format).toBe("beamx-data-export/1");
    expect(data.user).toMatchObject({ guest: true, email: null });
    expect(data.conversations.map((c) => c.id)).toContain(chatId);
  });

  test("sign up names the policies, records them, and the account downloads them", async ({
    page,
  }) => {
    await page.goto("/");
    await page.getByRole("button", { name: "Sign in" }).click();
    const dialog = page.getByRole("dialog", { name: "Create your account" });
    await expect(
      dialog.getByText("By creating an account you agree to our"),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    const email = await signUp(
      page,
      page.getByRole("button", { name: "Sign in" }),
    );

    await page.getByRole("button", { name: "Account menu" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Privacy notice" }),
    ).toBeVisible();
    await expect(
      page.getByRole("menuitem", { name: "Terms of use" }),
    ).toBeVisible();
    await page.keyboard.press("Escape");

    // A new account accepted the current terms, so a fresh load shows no updated terms
    // card (the server decides it per request).
    await page.reload();
    await expect(
      page.getByRole("button", { name: "Account menu" }),
    ).toBeVisible({
      timeout: TURN_MS,
    });
    await expect(page.getByTestId("terms-update-card")).toHaveCount(0);

    const { data } = await download(page, "Account menu");
    expect(data.user).toMatchObject({ guest: false, email });
    expect(data.policyAcceptances.map((p) => p.policy).sort()).toEqual([
      "privacy",
      "terms",
    ]);
  });
});
