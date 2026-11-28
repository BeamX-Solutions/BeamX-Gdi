import { render } from "@react-email/components";
import { describe, expect, it } from "vitest";
import { codeEmailText } from "./copy";
import { consultationEmailText } from "./consultation-copy";
import { EmailFooter } from "./footer";
import { footerText, policyUrls } from "./footer-copy";
import { reportEmailText } from "./report-copy";

// The policy footer of every email (spec 0017, AC-4): links follow the sending deploy's
// app URL (`NEXT_PUBLIC_APP_URL`), so production emails point at production.

const APP = "https://beam-x-gdi.vercel.app";

describe("policyUrls", () => {
  it("links the policies on the given app URL", () => {
    expect(policyUrls(APP)).toEqual({
      privacy: "https://beam-x-gdi.vercel.app/privacy",
      terms: "https://beam-x-gdi.vercel.app/terms",
    });
  });

  it("drops a trailing slash so the path never doubles", () => {
    expect(policyUrls(`${APP}/`).privacy).toBe(
      "https://beam-x-gdi.vercel.app/privacy",
    );
  });
});

describe("email policy footer (AC-4)", () => {
  it("ends every plain text email with both links", () => {
    const texts = [
      codeEmailText("sign-up", "123456", APP),
      reportEmailText(
        { toolName: "Stellar", headline: null, chatUrl: null },
        APP,
      ),
      consultationEmailText(
        {
          kind: "canceled",
          clientName: null,
          clientEmail: null,
          callTime: null,
          profile: [],
          reports: [],
        },
        APP,
      ),
    ];
    for (const text of texts) {
      expect(text.endsWith(footerText(APP))).toBe(true);
      expect(text).toContain(`${APP}/privacy`);
      expect(text).toContain(`${APP}/terms`);
    }
  });

  it("links both policies in the HTML footer", async () => {
    const html = await render(EmailFooter({ appUrl: APP }));
    expect(html).toContain(`href="${APP}/privacy"`);
    expect(html).toContain(`href="${APP}/terms"`);
  });
});
