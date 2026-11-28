import { describe, expect, it } from "vitest";
import {
  assertLegalReady,
  currentVersion,
  LEGAL,
  PLACEHOLDER,
  placeholderFields,
  termsOutdated,
  type LegalConfig,
} from "./config";
import { privacyNotice, termsOfUse } from "./content";

const filled: LegalConfig = {
  ...LEGAL,
  company: "BeamX Solutions Ltd",
  address: "1 Example Street, Lagos",
  privacyEmail: "privacy@beamxsolutions.com",
};

const allText = (doc: ReturnType<typeof privacyNotice>): string =>
  [
    doc.intro,
    ...doc.sections.flatMap((s) => [
      s.heading,
      ...s.blocks.flatMap((b) => (b.kind === "p" ? [b.text] : b.items)),
    ]),
  ].join("\n");

describe("LEGAL placeholders (AC-9)", () => {
  // Reads `process.env` by hand: this is the test the spec asks for, run with the deploy's
  // `VERCEL_ENV`, not app code (which reads env through `src/lib/env.ts`).
  it.runIf(process.env.VERCEL_ENV === "production")(
    "holds no placeholder on a production deploy",
    () => {
      expect(placeholderFields(LEGAL)).toEqual([]);
    },
  );

  it("finds each field that still holds a placeholder", () => {
    expect(placeholderFields(filled)).toEqual([]);
    expect(
      placeholderFields({ ...filled, address: `${PLACEHOLDER} address` }),
    ).toEqual(["address"]);
  });

  it("fails a production build with placeholders, and nothing else", () => {
    const unnamed = { ...filled, company: PLACEHOLDER };
    expect(() => assertLegalReady("production", unnamed)).toThrow(/company/);
    expect(() => assertLegalReady("production", filled)).not.toThrow();
    expect(() => assertLegalReady("preview", unnamed)).not.toThrow();
    expect(() => assertLegalReady(undefined, unnamed)).not.toThrow();
  });
});

describe("currentVersion (AC-5)", () => {
  it("reads each policy's version from LEGAL", () => {
    expect(currentVersion("terms")).toBe(LEGAL.termsVersion);
    expect(currentVersion("privacy")).toBe(LEGAL.privacyVersion);
  });
});

describe("termsOutdated (AC-6)", () => {
  it("shows the card for no accepted version or an old one", () => {
    expect(termsOutdated(null)).toBe(true);
    expect(termsOutdated("2000-01-01")).toBe(true);
    expect(termsOutdated(LEGAL.termsVersion)).toBe(false);
  });
});

describe("privacy notice content (AC-2)", () => {
  const text = allText(
    privacyNotice({ guestDeleteDays: 30, creditExpiryMonths: 12 }, filled),
  );

  it("names the company, its address and the privacy email", () => {
    expect(text).toContain("BeamX Solutions Ltd");
    expect(text).toContain("1 Example Street, Lagos");
    expect(text).toContain("privacy@beamxsolutions.com");
  });

  it("names every processor and that AI runs outside Nigeria", () => {
    for (const name of [
      "Anthropic",
      "Neon",
      "Vercel",
      "Upstash",
      "Resend",
      "Paystack",
      "Calendly",
    ])
      expect(text).toContain(name);
    expect(text).toContain("outside Nigeria");
  });

  it("quotes the retention it is given and the rights", () => {
    expect(text).toContain("after 30 days without use");
    expect(text).toContain("after 12 months without use");
    expect(text).toContain("Data Protection Act 2023");
    expect(text).toContain("GDPR");
    expect(text).toContain("Nigeria Data Protection Commission");
  });

  it("carries the privacy version and date", () => {
    const doc = privacyNotice(
      { guestDeleteDays: 30, creditExpiryMonths: 12 },
      filled,
    );
    expect(doc.version).toBe(filled.privacyVersion);
    expect(doc.updated).toBe(filled.privacyUpdated);
  });
});

describe("terms content (AC-3)", () => {
  const doc = termsOfUse(
    {
      tools: [
        { name: "Stellar", credits: 30 },
        { name: "Luna", credits: 500 },
      ],
      ngnPerCredit: 100,
      freeChatPerDay: { guest: 5, account: 10 },
      creditExpiryMonths: 12,
    },
    filled,
  );
  const text = allText(doc);

  it("lists each tool's price from the facts it is given", () => {
    expect(text).toContain("Stellar: 30 credits a run.");
    expect(text).toContain("Luna: 500 credits a run.");
    expect(text).toContain("₦100");
  });

  it("covers refunds, failed runs, advice, AI limits and Nigerian law", () => {
    expect(text).toContain("non refundable once a report has been delivered");
    expect(text).toContain("A run that fails costs nothing");
    expect(text).toContain("not financial, legal");
    expect(text).toContain("AI can be wrong");
    expect(text).toContain("laws of the Federal Republic of Nigeria");
    expect(doc.version).toBe(filled.termsVersion);
  });
});
