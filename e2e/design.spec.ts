import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.describe("/design", () => {
  test("has no WCAG 2.2 A or AA violations (AC-3)", async ({ page }) => {
    await page.goto("/design");
    await expect(
      page.getByRole("heading", { name: "BeamX design system", level: 1 }),
    ).toBeVisible();
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(results.violations).toEqual([]);
  });

  test("follows the device theme with no wrong first paint (AC-2)", async ({
    page,
    colorScheme,
  }) => {
    await page.goto("/design");
    const expectDark = colorScheme === "dark";
    await expect(page.locator("html")).toHaveClass(
      expectDark ? /(^|\s)dark(\s|$)/ : /^((?!\bdark\b).)*$/,
    );
  });

  test("keeps a picked theme across a reload (AC-2)", async ({ page }) => {
    // Force the opposite of the device so the stored choice is what we see.
    await page.goto("/design");
    await page.getByRole("button", { name: "Theme" }).click();
    await page.getByRole("menuitemradio", { name: "Dark" }).click();
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);

    // Before any script runs, the init script must already set the class.
    await page.reload({ waitUntil: "commit" });
    await page.waitForFunction(() =>
      document.documentElement.classList.contains("dark"),
    );
    await expect(page.locator("html")).toHaveClass(/(^|\s)dark(\s|$)/);
    expect(
      await page.evaluate(() => window.localStorage.getItem("theme")),
    ).toBe("dark");
  });

  test("has no horizontal scroll at the test width (AC-5)", async ({
    page,
  }) => {
    await page.goto("/design");
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});
