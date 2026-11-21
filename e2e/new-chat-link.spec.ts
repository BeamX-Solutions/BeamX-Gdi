import { expect, test } from "@playwright/test";

// The real chat's "New chat" opens the empty chat at "/", never the design only shell
// demo (which 404s in production). The session lookup is stubbed as empty, so this
// needs no database.

test("New chat on the real chat goes to the empty chat", async ({
  page,
  viewport,
}) => {
  await page.route("**/api/auth/get-session**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: "null",
    }),
  );
  await page.goto("/");
  // On phones the rail only renders inside the history drawer.
  if ((viewport?.width ?? 0) < 1024)
    await page.getByRole("button", { name: "Open chat history" }).click();
  const link = page.getByRole("link", { name: "New chat" });
  await expect(link).toHaveAttribute("href", "/");
});
