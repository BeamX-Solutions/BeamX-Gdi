import { createHmac } from "node:crypto";
import { expect, test } from "@playwright/test";
import { scan, TURN_MS } from "./flow-helpers";

// Spec 0016, AC-1, AC-3 to AC-5, AC-8: a guest asks for a strategy call, opens Calendly
// in a dialog, books, sees "Booked" at once, then the signed webhook confirms it, and a
// reload keeps the booked card and the chat's confirmation. Calendly itself is stubbed:
// its page is served at the real origin, so the embed's message passes the origin check.

// Matches `CALENDLY_WEBHOOK_SIGNING_KEY` in playwright.config.ts.
const KEY = "e2e-calendly-signing-key";

/** Calendly's embed, reduced to the booked message it posts to the app. */
const CALENDLY_STUB = `<!doctype html><html lang="en"><title>Calendly</title>
<button id="book">Confirm booking</button>
<script>
document.getElementById("book").onclick = () =>
  parent.postMessage({ event: "calendly.event_scheduled", payload: {} }, "*");
</script></html>`;

const signed = (body: unknown) => {
  const raw = JSON.stringify(body);
  const t = Math.floor(Date.now() / 1000);
  const v1 = createHmac("sha256", KEY).update(`${t}.${raw}`).digest("hex");
  return { raw, header: `t=${t},v1=${v1}` };
};

test.describe("book a strategy call in chat (spec 0016)", () => {
  test.describe.configure({ timeout: 180_000 });

  test("offer, book in the dialog, the webhook confirms, a reload keeps it", async ({
    page,
  }) => {
    await page.route("https://calendly.com/**", (route) =>
      route.fulfill({ contentType: "text/html", body: CALENDLY_STUB }),
    );
    await page.goto("/");
    const box = page.getByRole("textbox", { name: "Message", disabled: false });
    await expect(box).toBeVisible({ timeout: TURN_MS });
    await box.fill("Can I book a strategy call?");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page).toHaveURL(/\/c\/[0-9a-f-]{36}$/, { timeout: TURN_MS });
    const chatUrl = page.url();

    // AC-1: the card, free, no approval.
    const card = page.getByRole("region", {
      name: "Book a free strategy call",
    });
    await expect(card).toBeVisible({ timeout: TURN_MS });
    await scan(page);

    // AC-3: Book a time opens Calendly with our id; booking closes the dialog.
    await card.getByRole("button", { name: "Book a time" }).click();
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    const frame = dialog.getByTestId("calendly-frame");
    const src = (await frame.getAttribute("src")) ?? "";
    const consultationId = new URL(src).searchParams.get("utm_content");
    expect(consultationId).toMatch(/^[0-9a-f-]{36}$/);
    await scan(page);
    await page
      .frameLocator('[data-testid="calendly-frame"]')
      .getByRole("button", { name: "Confirm booking" })
      .click();
    await expect(dialog).toBeHidden();
    await expect(
      card.getByText("Booked. Calendly has emailed you the details."),
    ).toBeVisible();

    // AC-4, AC-5: Calendly's signed webhook moves it to booked; the card's poll sees it.
    const { raw, header } = signed({
      event: "invitee.created",
      payload: {
        uri: `https://api.calendly.com/scheduled_events/E2E/invitees/${consultationId}`,
        name: "E2E Client",
        email: "e2e-client@example.com",
        event: "https://api.calendly.com/scheduled_events/E2E",
        scheduled_event: { start_time: "2026-12-02T09:00:00.000000Z" },
        tracking: { utm_content: consultationId },
      },
    });
    const bad = await page.request.post("/api/webhooks/calendly", {
      data: raw,
      headers: {
        "content-type": "application/json",
        "calendly-webhook-signature": "t=1,v1=00",
      },
    });
    expect(bad.status()).toBe(401);
    const hook = await page.request.post("/api/webhooks/calendly", {
      data: raw,
      headers: {
        "content-type": "application/json",
        "calendly-webhook-signature": header,
      },
    });
    expect(hook.status()).toBe(200);
    await expect(
      card.getByText("Booked for Wed 2 Dec at 10:00 (Lagos time)."),
    ).toBeVisible({ timeout: 15_000 });

    // AC-8: a reload keeps the booked card and the chat's confirmation (AC-5).
    await page.goto(chatUrl);
    await expect(
      page.getByText("Booked for Wed 2 Dec at 10:00 (Lagos time)."),
    ).toBeVisible({ timeout: TURN_MS });
    await expect(
      page.getByText(
        "You're booked for a free strategy call on Wed 2 Dec at 10:00 (Lagos time).",
        { exact: false },
      ),
    ).toBeVisible();
    await scan(page);
  });
});
