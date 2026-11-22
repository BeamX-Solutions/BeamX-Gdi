import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

// Spec 0008: the abuse limit notices render in the real chat client, read well, and
// pass axe. e2e runs without Upstash (every limit allows there, by design), so the
// server's replies are stubbed with the exact notice the route sends: a UI message
// stream holding one `data-error` part, or the sign in route's `429 guest_limit`.

const wcagTags = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"];

/** No session yet, and the guest sign in succeeds. */
const asNewGuest = async (page: Page) => {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.route("**/api/auth/sign-in/anonymous**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ token: "t", user: { id: "g1" } }),
    }),
  );
};

/** `POST /api/chat` answers with one limit notice, as `noticeStream` writes it. */
const chatAnswersWith = async (page: Page, kind: string) => {
  const events = [
    { type: "start", messageId: "0190a000-0000-7000-8000-00000000e001" },
    { type: "data-error", data: { kind, retry: false } },
    { type: "finish" },
  ];
  await page.route("**/api/chat", (route) =>
    route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/event-stream",
        "x-vercel-ai-ui-message-stream": "v1",
      },
      body:
        events.map((e) => `data: ${JSON.stringify(e)}\n\n`).join("") +
        "data: [DONE]\n\n",
    }),
  );
};

const sendTyped = async (page: Page, text: string) => {
  await page.goto("/");
  const box = page.getByRole("textbox", { name: "Message", disabled: false });
  await expect(box).toBeVisible();
  await box.fill(text);
  await box.press("Enter");
};

const notices = [
  { kind: "slow_down", title: "You're sending messages fast" },
  { kind: "chat_daily", title: "You've reached today's chat limit" },
  { kind: "chats_daily", title: "You've started a lot of chats today" },
] as const;

for (const { kind, title } of notices) {
  test(`the ${kind} notice shows, passes axe, and Got it gives the text back`, async ({
    page,
  }) => {
    await asNewGuest(page);
    await chatAnswersWith(page, kind);
    await sendTyped(page, "hello there");

    const card = page.getByRole("region", { name: title });
    // The first chat send also signs in and hydrates the client: give it room under
    // parallel workers.
    await expect(card).toBeVisible({ timeout: 15_000 });
    const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
    expect(results.violations).toEqual([]);

    await card.getByRole("button", { name: "Got it" }).click();
    await expect(card).toBeHidden();
    await expect(page.getByRole("textbox", { name: "Message" })).toHaveValue(
      "hello there",
    );
  });
}

test("a guest sign in refused by the IP cap shows the guest limit card", async ({
  page,
}) => {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.route("**/api/auth/sign-in/anonymous**", (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "guest_limit" }),
    }),
  );
  await sendTyped(page, "hello there");

  await expect(page.getByText("We couldn't start a new chat")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page).toHaveURL(/\/$/);
  const results = await new AxeBuilder({ page }).withTags(wcagTags).analyze();
  expect(results.violations).toEqual([]);
});

test("/design shows every limit notice, and Got it dismisses one", async ({
  page,
}) => {
  await page.goto("/design");
  for (const id of [
    "slow_down",
    "chat_daily",
    "chats_daily",
    "runs_daily",
    "spend_cap",
    "guest_limit",
  ])
    await expect(page.getByTestId(`notice-${id}`)).toBeVisible();
  await page
    .getByTestId("notice-runs_daily")
    .getByRole("button", { name: "Got it" })
    .click();
  await expect(page.getByTestId("gone-runs_daily")).toHaveText("Dismissed.");
});
