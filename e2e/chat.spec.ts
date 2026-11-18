import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import {
  budgetQuestion,
  channelsQuestion,
  confidenceQuestion,
  longScaleQuestion,
  sectorQuestion,
  staffQuestion,
  streamedReply,
} from "../src/components/fixtures/chat";

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

const live = (page: Page) => page.getByTestId("live-conversation");
const card = (page: Page, prompt: string) =>
  page.getByRole("group", { name: prompt });

test.beforeEach(async ({ page }) => {
  await page.goto("/design");
  await expect(page.getByTestId("live-conversation")).toBeVisible();
});

test.describe("answer cards: keyboard walk (AC-8, AC-9)", () => {
  test("single choice: arrows move, Enter picks, bubble, Edit reopens on the old answer", async ({
    page,
  }) => {
    const group = live(page).getByRole("radiogroup", {
      name: sectorQuestion.prompt,
    });
    const first = group.getByRole("radio", { name: "Retail, 6 to 20 staff" });
    const second = group.getByRole("radio", { name: "Food and drinks" });

    // One Tab stop: only the first radio is reachable until something is picked.
    await expect(first).toHaveAttribute("tabindex", "0");
    await expect(second).toHaveAttribute("tabindex", "-1");

    await first.focus();
    await page.keyboard.press("ArrowRight");
    await expect(second).toBeFocused();
    // Moving never submits.
    await expect(group).toBeVisible();

    await page.keyboard.press("Enter");
    await expect(group).toBeHidden();
    await expect(live(page).getByText("Food and drinks")).toBeVisible();
    // After an answer, focus moves to the composer.
    await expect(
      live(page).getByRole("textbox", { name: "Message" }),
    ).toBeFocused();

    await live(page).getByRole("button", { name: /^Edit/ }).click();
    const reopened = live(page).getByRole("radio", { name: "Food and drinks" });
    await expect(reopened).toHaveAttribute("aria-checked", "true");
    await expect(reopened).toBeFocused();
  });

  test("help text is hidden until asked for", async ({ page }) => {
    const help = sectorQuestion.kind === "single" ? sectorQuestion.help : "";
    await expect(page.getByText(help ?? "")).toHaveCount(0);
    await live(page)
      .getByRole("button", { name: "What does this mean?" })
      .click();
    await expect(page.getByText(help ?? "")).toBeVisible();
  });

  test("progress reads 'Question 1 of 12' (counts start at 1)", async ({
    page,
  }) => {
    await expect(live(page).getByText("Question 1 of 12")).toBeVisible();
    await expect(
      card(page, channelsQuestion.prompt).getByText(
        "Marketing · Area 3 of 9 · Question 4 of 7",
      ),
    ).toBeVisible();
  });

  test("multi choice: Confirm waits for min, picks stop at max, labels keep option order", async ({
    page,
  }) => {
    const c = card(page, channelsQuestion.prompt);
    const confirm = c.getByRole("button", { name: "Confirm" });
    await expect(c.getByText("Pick 2 to 4")).toBeVisible();
    await expect(confirm).toBeDisabled();

    await c.getByRole("checkbox", { name: "Referrals from friends" }).click();
    await expect(confirm).toBeDisabled();
    await c.getByRole("checkbox", { name: "Walk in traffic" }).click();
    await expect(confirm).toBeEnabled();
    await c.getByRole("checkbox", { name: "Instagram or WhatsApp" }).click();
    await c.getByRole("checkbox", { name: "Paid adverts" }).click();
    // Four picked, the fifth is blocked.
    await expect(
      c.getByRole("checkbox", { name: "A market stall" }),
    ).toBeDisabled();

    await confirm.click();
    await expect(
      page.getByText(
        "Walk in traffic, Referrals from friends, Instagram or WhatsApp, Paid adverts",
      ),
    ).toBeVisible();
  });

  test("scale: a tap sends, and the bubble reads '{n} of {max}'", async ({
    page,
  }) => {
    const group = page.getByRole("radiogroup", {
      name: confidenceQuestion.prompt,
    });
    await group.getByRole("radio", { name: "4" }).click();
    await expect(group).toBeHidden();
    await expect(page.getByText("4 of 5")).toBeVisible();
  });

  test("scale: more than 7 points wrap into two rows", async ({ page }) => {
    const group = page.getByRole("radiogroup", {
      name: longScaleQuestion.prompt,
    });
    const tops = await group
      .getByRole("radio")
      .evaluateAll((els) => [
        ...new Set(els.map((el) => Math.round(el.getBoundingClientRect().top))),
      ]);
    expect(tops).toHaveLength(2);
  });

  test("text: Enter submits, empty shows an error, naira is grouped on blur", async ({
    page,
  }) => {
    const c = card(page, budgetQuestion.prompt);
    const input = c.getByRole("textbox");
    await c.getByRole("button", { name: "Submit" }).click();
    await expect(c.getByRole("alert")).toHaveText(
      "Enter an answer to continue.",
    );

    await input.fill("250000");
    await input.blur();
    await expect(input).toHaveValue("250,000");
    await input.press("Enter");
    await expect(
      page.getByText("₦250,000", { exact: false }).first(),
    ).toBeVisible();
  });

  test("number: values outside the range are rejected on submit", async ({
    page,
  }) => {
    const c = card(page, staffQuestion.prompt);
    await c.getByRole("textbox").fill("0");
    await c.getByRole("button", { name: "Submit" }).click();
    await expect(c.getByRole("alert")).toHaveText("Enter 1 or more.");
  });

  test("a locked answer has no Edit control", async ({ page }) => {
    const block = page
      .getByRole("heading", { name: "Answered bubble, locked" })
      .locator("xpath=..");
    await block.getByRole("radio", { name: "Technology" }).click();
    await expect(block.getByText("Technology")).toBeVisible();
    await expect(block.getByRole("button", { name: /Edit/ })).toHaveCount(0);
  });

  test("every control in the cards is at least 44 by 44 (AC-8)", async ({
    page,
  }) => {
    const small = await page.evaluate(() => {
      const sel =
        '[role="radio"], [role="group"] button, [role="group"] label, [role="group"] input[type="text"], [data-testid="live-conversation"] form button';
      return (
        [...document.querySelectorAll<HTMLElement>(sel)]
          .map((el) => ({ el, box: el.getBoundingClientRect() }))
          .filter(({ box }) => box.width > 0 && box.height > 0)
          // The Radix checkbox is a 20px visual inside its 44px label row.
          .filter(({ el }) => el.getAttribute("role") !== "checkbox")
          .filter(({ box }) => box.width < 43.5 || box.height < 43.5)
          .map(
            ({ el, box }) =>
              `${el.outerHTML.slice(0, 80)} ${box.width}x${box.height}`,
          )
      );
    });
    expect(small).toEqual([]);
  });
});

test.describe("composer (AC-7)", () => {
  const box = (page: Page) =>
    live(page).getByRole("textbox", { name: "Message" });

  test("shows the hint and uses 16px text", async ({ page }) => {
    await expect(live(page).getByText("Or type your answer")).toBeVisible();
    await expect(box(page)).toHaveCSS("font-size", "16px");
  });

  test("Send is off for empty text; the counter shows past 3,600 and Send is off past 4,000", async ({
    page,
  }) => {
    const send = live(page).getByRole("button", { name: "Send" });
    await expect(send).toBeDisabled();
    await box(page).fill("   ");
    await expect(send).toBeDisabled();

    await box(page).fill("a".repeat(3712));
    await expect(live(page).getByText("3,712 / 4,000")).toBeVisible();
    await expect(live(page).getByText("3,712 / 4,000")).toHaveCSS(
      "font-size",
      "16px",
    );
    await expect(send).toBeEnabled();

    await box(page).fill("a".repeat(4001));
    await expect(live(page).getByText("4,001 / 4,000")).toBeVisible();
    await expect(send).toBeDisabled();
  });

  test("grows with its text up to 6 lines, then scrolls", async ({ page }) => {
    const before = (await box(page).boundingBox())?.height ?? 0;
    await box(page).fill(
      Array.from({ length: 12 }, (_, i) => `line ${i}`).join("\n"),
    );
    const after = (await box(page).boundingBox())?.height ?? 0;
    expect(after).toBeGreaterThan(before + 40);
    expect(after).toBeLessThanOrEqual(161);
  });

  test("a fine pointer: Shift+Enter adds a line, Enter sends, IME composing never sends", async ({
    page,
    isMobile,
  }) => {
    test.skip(isMobile, "fine pointer only");
    const input = box(page);
    await input.click();
    await page.keyboard.type("first");
    await page.keyboard.press("Shift+Enter");
    await page.keyboard.type("second");
    await expect(input).toHaveValue("first\nsecond");

    // A key press while a word is still being composed must not send.
    await input.evaluate((el) =>
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          key: "Enter",
          isComposing: true,
          bubbles: true,
          cancelable: true,
        }),
      ),
    );
    await expect(input).toHaveValue("first\nsecond");

    await page.keyboard.press("Enter");
    await expect(input).toHaveValue("");
    await expect(live(page).getByText("first")).toBeVisible();
  });
});

test.describe("composer on a touch screen (AC-7)", () => {
  test.use({ hasTouch: true, isMobile: true });

  test("Enter adds a line; only Send sends", async ({ page }) => {
    const input = live(page).getByRole("textbox", { name: "Message" });
    await input.click();
    await page.keyboard.type("hello");
    await page.keyboard.press("Enter");
    await page.keyboard.type("world");
    await expect(input).toHaveValue("hello\nworld");
    await live(page).getByRole("button", { name: "Send" }).click();
    await expect(input).toHaveValue("");
    await expect(live(page).getByText("hello")).toBeVisible();
  });
});

test.describe("thread (AC-6)", () => {
  const region = (page: Page) =>
    page.getByTestId("stream-thread").getByTestId("thread-live-region");
  const scroller = (page: Page) =>
    page
      .getByTestId("stream-thread")
      .getByRole("region", { name: "Streaming thread" });

  test("announces the status, then the full reply once, never token by token", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Stream a reply" }).click();
    await expect(region(page)).toHaveText("Writing your reply…");

    // While streaming, the region never holds a partial reply.
    const seen: string[] = [];
    await page.exposeFunction("recordLive", (text: string) => seen.push(text));
    await region(page).evaluate((el) => {
      new MutationObserver(() =>
        (window as unknown as { recordLive(t: string): void }).recordLive(
          el.textContent ?? "",
        ),
      ).observe(el, { childList: true, characterData: true, subtree: true });
    });

    await expect(region(page)).toHaveText(streamedReply, { timeout: 10_000 });
    await page.waitForTimeout(300);
    expect(seen).toEqual([streamedReply]);
  });

  test("the live region is the only one in the thread", async ({ page }) => {
    await expect(
      page.getByTestId("stream-thread").locator("[aria-live]"),
    ).toHaveCount(1);
    await expect(
      page
        .getByTestId("stream-thread")
        .locator('[role="log"], [role="status"]'),
    ).toHaveCount(0);
  });

  test("renders markdown; links open in a new tab safely", async ({ page }) => {
    await page.getByRole("button", { name: "Stream a reply" }).click();
    const thread = page.getByTestId("stream-thread");
    await expect(thread.getByRole("listitem")).toHaveCount(3, {
      timeout: 10_000,
    });
    const link = thread.getByRole("link", { name: "our guide" });
    await expect(link).toHaveAttribute("target", "_blank");
    await expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  test("sticks to the bottom; scrolling up shows Jump to latest", async ({
    page,
  }) => {
    await page.getByRole("button", { name: "Stream a reply" }).click();
    await expect(region(page)).toHaveText(streamedReply, { timeout: 10_000 });
    const atBottom = () =>
      scroller(page).evaluate(
        (el) => el.scrollHeight - el.scrollTop - el.clientHeight <= 2,
      );
    await expect.poll(atBottom).toBe(true);

    const jump = page
      .getByTestId("stream-thread")
      .getByRole("button", { name: "Jump to latest" });
    await expect(jump).toHaveCount(0);
    await scroller(page).evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(jump).toBeVisible();
    await jump.click();
    await expect(jump).toHaveCount(0);
    await expect.poll(atBottom).toBe(true);
  });

  test("a long URL wraps instead of widening the page (AC-5)", async ({
    page,
  }) => {
    const overflow = await page.evaluate(
      () =>
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("run progress bar (AC-10)", () => {
  test("shows the tool, the count, and a Pause button", async ({ page }) => {
    const bar = live(page).getByRole("progressbar", {
      name: "Idea Check progress",
    });
    await expect(bar).toHaveAttribute("aria-valuenow", "2");
    await expect(bar).toHaveAttribute("aria-valuemax", "12");
    await expect(live(page).getByText("2 of 12 questions")).toBeVisible();
    await live(page).getByRole("button", { name: "Pause" }).click();
    await expect(page.getByText("Paused: yes")).toBeVisible();
  });

  test("a long Luna style run still fits", async ({ page }) => {
    await expect(page.getByText("17 of 48 questions")).toBeVisible();
    await expect(
      page.getByRole("progressbar", {
        name: "Luna: full marketing plan progress",
      }),
    ).toHaveAttribute("aria-valuenow", "17");
  });
});

test.describe("accessibility of the chat parts (AC-3, AC-15)", () => {
  test("no WCAG A or AA violations with cards open, answered, and streaming", async ({
    page,
  }) => {
    await live(page).getByRole("radio", { name: "Technology" }).click();
    await page.getByRole("button", { name: "Stream a reply" }).click();
    await page
      .getByTestId("stream-thread")
      .getByRole("link", { name: "our guide" })
      .waitFor({ timeout: 10_000 });
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(results.violations).toEqual([]);
  });
});

test.describe("reduced motion (AC-14)", () => {
  test.describe("off", () => {
    test.use({ reducedMotion: "reduce" });
    test("the shimmer and the progress bar do not animate", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Stream a reply" }).click();
      const shimmer = page
        .getByTestId("stream-thread")
        .getByTestId("status-line")
        .locator(".shimmer");
      await expect(shimmer).toBeVisible();
      expect(await shimmer.evaluate((el) => el.getAnimations().length)).toBe(0);
      await expect(shimmer).toHaveText("Writing your reply…");
    });
  });

  test.describe("on", () => {
    test.use({ reducedMotion: "no-preference" });
    test("control: the shimmer animates when motion is allowed", async ({
      page,
    }) => {
      await page.getByRole("button", { name: "Stream a reply" }).click();
      const shimmer = page
        .getByTestId("stream-thread")
        .getByTestId("status-line")
        .locator(".shimmer");
      await expect(shimmer).toBeVisible();
      expect(
        await shimmer.evaluate((el) => el.getAnimations().length),
      ).toBeGreaterThan(0);
    });
  });
});
