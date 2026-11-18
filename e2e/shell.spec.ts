import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const isPhone = (width: number) => width < 1024;

test.describe("workspace shell", () => {
  test("has no WCAG A or AA violations", async ({ page }) => {
    await page.goto("/design/shell");
    await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(results.violations).toEqual([]);
  });

  test("never scrolls sideways, even with a very long URL (AC-5)", async ({
    page,
  }) => {
    await page.goto("/design/shell");
    await expect(page.getByRole("button", { name: "Theme" })).toBeVisible();
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    // The long URL wraps inside its bubble instead of being clipped by a scroller.
    const clipped = await page.evaluate(
      () =>
        [...document.querySelectorAll("main p")].filter(
          (el) => el.scrollWidth > el.clientWidth + 1,
        ).length,
    );
    expect(clipped).toBe(0);
  });

  test("phone: View report opens a sheet; Escape closes it and returns focus (AC-5)", async ({
    page,
    viewport,
  }) => {
    test.skip(!isPhone(viewport?.width ?? 0), "phone layout only");
    await page.goto("/design/shell");
    const card = page.getByRole("button", { name: /View report/ });
    await card.click();
    const sheet = page.getByRole("dialog", { name: "Idea check report" });
    await expect(sheet).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(card).toBeFocused();
    // Only one layout tree: the desktop panel and rail do not exist on phones.
    await expect(
      page.getByRole("separator", { name: "Resize report panel" }),
    ).toHaveCount(0);
  });

  test("phone: the history drawer opens from the menu button (AC-5)", async ({
    page,
    viewport,
  }) => {
    test.skip(!isPhone(viewport?.width ?? 0), "phone layout only");
    await page.goto("/design/shell");
    await page.getByRole("button", { name: "Open chat history" }).click();
    await expect(
      page.getByRole("dialog", { name: "Chat history" }),
    ).toBeVisible();
  });

  test("desktop: panel resizes with the arrow keys and respects its limits (AC-4)", async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport?.width ?? 0), "desktop layout only");
    await page.goto("/design/shell");
    const handle = page.getByRole("separator", { name: "Resize report panel" });
    const panel = page.getByRole("region", { name: "Idea check report" });
    await expect(handle).toBeVisible();
    const before = (await panel.boundingBox())?.width ?? 0;
    // Rail collapses on its own below 1280px; at 1280 it stays open: main is 1024 wide.
    expect(before).toBeGreaterThan(360);
    await handle.focus();
    await page.keyboard.press("ArrowLeft");
    const grown = (await panel.boundingBox())?.width ?? 0;
    expect(grown).toBeGreaterThan(before);
    for (let i = 0; i < 80; i++) await page.keyboard.press("ArrowRight");
    const smallest = (await panel.boundingBox())?.width ?? 0;
    expect(smallest).toBeGreaterThanOrEqual(359);
    for (let i = 0; i < 200; i++) await page.keyboard.press("ArrowLeft");
    const widest = (await panel.boundingBox())?.width ?? 0;
    const main = (await page.getByRole("main").boundingBox())?.width ?? 0;
    expect(widest).toBeLessThanOrEqual((main + widest) * 0.6 + 1);
  });

  test("desktop: no report means no panel and a centered chat column (AC-4)", async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport?.width ?? 0), "desktop layout only");
    await page.goto("/design/shell");
    await page.getByRole("button", { name: "Remove report" }).click();
    await expect(
      page.getByRole("separator", { name: "Resize report panel" }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("region", { name: "Idea check report" }),
    ).toHaveCount(0);
    const box = await page.getByRole("main").boundingBox();
    expect(box?.width ?? 0).toBeLessThanOrEqual(768 + 1);
  });

  test("desktop: the history rail collapses and expands (AC-4)", async ({
    page,
    viewport,
  }) => {
    test.skip(isPhone(viewport?.width ?? 0), "desktop layout only");
    await page.goto("/design/shell");
    const rail = page.getByRole("complementary", { name: "Chat history" });
    await expect(rail).toBeVisible();
    expect((await rail.boundingBox())?.width).toBe(256);
    await page.getByRole("button", { name: "Collapse history" }).click();
    expect((await rail.boundingBox())?.width).toBe(56);
  });
});
