import { expect, test } from "@playwright/test";

// Spec 0007: when the guest sign in on the first send cannot reach the server, the chat
// shows the "We could not start your chat" card instead of silently doing nothing.
// The session lookup is stubbed as empty and the sign in request is aborted, so this
// needs no database.

test("a network error on the first sign in shows the sign in failure card", async ({
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
    route.abort("internetdisconnected"),
  );

  await page.goto("/");
  const starter = page.getByRole("button", { name: "I have a business idea" });
  await expect(starter).toBeEnabled();
  await starter.click();

  await expect(page.getByText("We could not start your chat")).toBeVisible();
  // Nothing was created, so the URL stays on the empty chat.
  await expect(page).toHaveURL(/\/$/);
  // The guest can try again once the card is up.
  await expect(
    page.getByRole("textbox", { name: "Message", disabled: false }),
  ).toBeVisible();
});
