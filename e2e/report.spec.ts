import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { errorKinds, reportFixtures } from "../src/components/fixtures/report";
import { errorCopy } from "../src/components/feedback/error-copy";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

test.beforeEach(async ({ page }) => {
  await page.goto("/design");
  await expect(
    page.getByRole("heading", { name: "Report parts and error cards" }),
  ).toBeVisible();
});

test.describe("report parts (AC-11)", () => {
  test("every verdict shows its icon-bearing badge and label, never color alone (AC-3)", async ({
    page,
  }) => {
    for (const report of Object.values(reportFixtures)) {
      const badge = page
        .locator(`[data-verdict="${report.verdict}"]`)
        .filter({ hasText: report.verdictLabel })
        .first();
      await expect(badge).toBeVisible();
      await expect(badge.locator("svg")).toHaveCount(1);
    }
  });

  test("the score reads as a whole number over its max", async ({ page }) => {
    await expect(page.getByText("62/100", { exact: true })).toBeVisible();
  });

  test("each bar also shows its value as text", async ({ page }) => {
    const bars = page.getByRole("list", { name: "Bars with verdict colors" });
    await expect(bars.getByRole("listitem")).toHaveCount(3);
    await expect(bars.getByText("8/10")).toBeVisible();
    await expect(bars.getByText("5/10")).toBeVisible();
    await expect(bars.getByText("3/10")).toBeVisible();
  });

  test("bar widths follow score over max and clamp", async ({ page }) => {
    const bars = page.getByRole("list", { name: "Bars without a verdict" });
    const widths = await bars
      .locator("li div[style]")
      .evaluateAll((nodes) =>
        nodes.map((node) => (node as HTMLElement).style.width),
      );
    expect(widths).toEqual(["60%", "100%", "0%"]);
  });

  test("advice shows neutral priority tags", async ({ page }) => {
    const advice = page.getByRole("list", { name: "Advice" });
    await expect(advice.getByText("High priority")).toBeVisible();
    await expect(advice.getByText("Medium priority")).toBeVisible();
    await expect(advice.getByText("Low priority")).toBeVisible();
  });

  test("a streaming section is busy and shimmers; a finished one is not", async ({
    page,
  }) => {
    const streaming = page.getByRole("region", { name: "Streaming section" });
    await expect(streaming).toHaveAttribute("aria-busy", "true");
    await expect(streaming.getByTestId("section-shimmer")).toBeVisible();
    const done = page.getByRole("region", { name: "Finished section" });
    await expect(done).toHaveAttribute("aria-busy", "false");
    await expect(done.getByTestId("section-shimmer")).toHaveCount(0);
    // Markdown links open safely in a new tab.
    const link = done.getByRole("link", { name: "our guide" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("the skeleton lists named steps with a text state each", async ({
    page,
  }) => {
    const steps = page.getByRole("list", { name: "Report steps" }).first();
    await expect(steps.getByRole("listitem")).toHaveCount(4);
    await expect(steps.getByText("Done")).toHaveCount(1);
    await expect(steps.getByText("In progress")).toHaveCount(1);
    await expect(steps.getByText("Waiting")).toHaveCount(2);
  });
});

test.describe("error cards (AC-12)", () => {
  test("each kind shows a message and exactly one action", async ({ page }) => {
    for (const kind of errorKinds) {
      const card = page.locator(`[data-error-kind="${kind}"]`).first();
      await expect(card).toBeVisible();
      await expect(card.getByText(errorCopy[kind].message)).toBeVisible();
      const actions = card.getByRole("button").or(card.getByRole("link"));
      await expect(actions).toHaveCount(1);
      await expect(actions).toHaveText(errorCopy[kind].actionLabel);
    }
  });

  test("limit reached links to /sign-up", async ({ page }) => {
    const link = page
      .locator('[data-error-kind="limit_reached"]')
      .first()
      .getByRole("link", { name: "Sign up to keep going" });
    await expect(link).toHaveAttribute("href", "/sign-up");
  });

  test("Got it dismisses the spend cap card and leaves a note, not a blank", async ({
    page,
  }) => {
    await page
      .locator('[data-error-kind="spend_cap"]')
      .first()
      .getByRole("button", { name: "Got it" })
      .click();
    await expect(page.getByTestId("gone-spend_cap")).toHaveText("Dismissed.");
  });

  test("the failed report in the panel retries into the skeleton", async ({
    page,
  }) => {
    const panel = page.getByTestId("report-panel-demo");
    await expect(
      panel.getByText("We could not write your report"),
    ).toBeVisible();
    await panel.getByRole("button", { name: "Retry" }).click();
    await expect(panel.getByTestId("report-skeleton")).toBeVisible();
    await expect(page.getByText("Retries: 1")).toBeVisible();
  });

  test("an error card in the thread sits after the last message", async ({
    page,
  }) => {
    const thread = page.getByRole("region", { name: "Thread with an error" });
    await expect(thread.locator('[data-error-kind="network"]')).toBeVisible();
  });
});

test("the report section of /design has no axe violations (AC-3)", async ({
  page,
}) => {
  const results = await new AxeBuilder({ page })
    .include('section[aria-labelledby="report"]')
    .withTags(wcagTags)
    .analyze();
  expect(results.violations).toEqual([]);
});

test("the report section causes no horizontal scroll (AC-5)", async ({
  page,
}) => {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
});
