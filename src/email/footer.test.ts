import { describe, expect, it } from "vitest";
import { codeEmailText } from "./copy";
import { consultationEmailText } from "./consultation-copy";
import { policyUrls } from "./footer-copy";
import { reportEmailText } from "./report-copy";

describe("email policy footer (spec 0017, AC-4)", () => {
  it("links the live policies on the app's domain", () => {
    expect(policyUrls.privacy).toBe("https://app.beamxsolutions.com/privacy");
    expect(policyUrls.terms).toBe("https://app.beamxsolutions.com/terms");
  });

  it("ends every plain text email with both links", () => {
    const texts = [
      codeEmailText("sign-up", "123456"),
      reportEmailText({ toolName: "Stellar", headline: null, chatUrl: null }),
      consultationEmailText({
        kind: "canceled",
        clientName: null,
        clientEmail: null,
        callTime: null,
        profile: [],
        reports: [],
      }),
    ];
    for (const text of texts) {
      expect(text).toContain(policyUrls.privacy);
      expect(text).toContain(policyUrls.terms);
    }
  });
});
