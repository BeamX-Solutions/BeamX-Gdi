/**
 * The words of the privacy notice and the terms of use (spec 0017, AC-1 to AC-3), as typed
 * content so the pages stay static and each version lives in one place (`config.ts`).
 * Pure: values that live elsewhere (prices, retention) come in as arguments.
 *
 * A draft for a lawyer's review before launch, not legal advice.
 */
import { LEGAL, type LegalConfig } from "./config";

export type LegalBlock =
  | { readonly kind: "p"; readonly text: string }
  | { readonly kind: "list"; readonly items: readonly string[] };

export type LegalSection = {
  readonly heading: string;
  readonly blocks: readonly LegalBlock[];
};

export type LegalDocument = {
  readonly title: string;
  readonly intro: string;
  readonly version: string;
  readonly updated: string;
  readonly sections: readonly LegalSection[];
};

const p = (text: string): LegalBlock => ({ kind: "p", text });
const list = (...items: string[]): LegalBlock => ({ kind: "list", items });

/** "BeamX Workspace (beam-x-gdi.vercel.app)", or just the name with no app host. */
const workspace = (appHost: string | null): string =>
  appHost === null ? "BeamX Workspace" : `BeamX Workspace (${appHost})`;

export type PrivacyFacts = {
  /** The deploy's app host (`appHostOf(NEXT_PUBLIC_APP_URL)`), or null. */
  readonly appHost: string | null;
  /** Days without use before a guest's data is deleted. */
  readonly guestDeleteDays: number;
  /** Months without use before credits expire. */
  readonly creditExpiryMonths: number;
};

export const privacyNotice = (
  facts: PrivacyFacts,
  legal: LegalConfig = LEGAL,
): LegalDocument => ({
  title: "Privacy notice",
  intro:
    "This notice explains what BeamX Workspace collects when you use it, why, who helps us run it, how long we keep it, and the choices you have.",
  version: legal.privacyVersion,
  updated: legal.privacyUpdated,
  sections: [
    {
      heading: "Who we are",
      blocks: [
        p(
          `${workspace(facts.appHost)} is run by ${legal.company}, ${legal.address}. We decide how your data is used, so we are its controller under Nigeria's Data Protection Act 2023 and, for clients in Europe and the UK, the GDPR.`,
        ),
        p(
          `For any question about your data, or to use any right below, email ${legal.privacyEmail}.`,
        ),
      ],
    },
    {
      heading: "What we collect",
      blocks: [
        list(
          "Your chat messages with the assistant.",
          "Your answers to each tool's questions, and the reports written from them.",
          "Your business profile: facts about your business that the tools remember so you are not asked twice.",
          "If you create an account: your email address, your first name, and a securely hashed password.",
          "Credit and payment records: credits bought, held and spent, and each payment's amount, status and date. Paystack handles your card; we never see or store card details.",
          "Strategy call bookings: the time you booked and the booking's reference.",
          "Your IP address, used briefly to stop abuse (for example, too many requests from one address).",
        ),
      ],
    },
    {
      heading: "Why we use it",
      blocks: [
        list(
          "To run the tools you ask for and write your reports. This is the service you ask us for, so the lawful basis is our contract with you.",
          "To bill credits and keep payment records, for the contract and because the law requires records of payments.",
          "To protect the service from abuse and runaway costs, which is our legitimate interest.",
          "To arrange a strategy call when you book one.",
        ),
        p(
          "We do not sell your data, use it for advertising, or use it to train AI models.",
        ),
      ],
    },
    {
      heading: "Who helps us run it",
      blocks: [
        p(
          "These companies process data for us, only to provide their part of the service:",
        ),
        list(
          "Anthropic, for the AI that reads your messages and answers and writes your reports. This processing happens outside Nigeria, mainly in the United States.",
          "Neon, for our database, stored in Frankfurt, Germany.",
          "Vercel, which hosts the app, with its servers in Frankfurt.",
          "Upstash, for short lived counters that enforce usage limits, in Frankfurt.",
          "Resend, which sends our emails (sign in codes and reports you ask us to email).",
          "Paystack, which takes payments for credits.",
          "Calendly, which handles strategy call bookings.",
        ),
        p(
          "Where data leaves Nigeria, we rely on these companies' contractual data protection commitments.",
        ),
      ],
    },
    {
      heading: "How long we keep it",
      blocks: [
        list(
          `If you use BeamX as a guest without an account, your chats, reports and profile are deleted after ${facts.guestDeleteDays} days without use.`,
          "With an account, we keep your data until you delete your account.",
          `Unused credits expire after ${facts.creditExpiryMonths} months without use; we remind you before.`,
          "Payment records are kept for as long as tax and accounting law requires, even after you delete your account, but no longer linked to you.",
        ),
      ],
    },
    {
      heading: "What your browser stores",
      blocks: [
        list(
          "A sign in cookie that keeps you signed in, as a guest or with an account.",
          "A bot check from Vercel that protects sign in and chat from automated abuse.",
          "Your theme choice (light or dark) and prompts you have dismissed, kept on your device only.",
        ),
        p(
          "These are strictly necessary for the app to work, so they need no consent. We use no analytics or advertising cookies. If you open the booking page for a strategy call, Calendly sets its own cookies under its own policy.",
        ),
      ],
    },
    {
      heading: "Your rights",
      blocks: [
        p("Under Nigeria's Data Protection Act 2023 and the GDPR you can:"),
        list(
          "Get a copy of your data: use Download my data in the account menu for a file of everything we hold about you.",
          "Correct it: edit or remove any fact on your business profile page.",
          "Delete it: use Delete account in the account menu. Your chats, reports, profile and credits go at once.",
          "Object to or ask us to limit a use of your data, by emailing us.",
          "Complain to the Nigeria Data Protection Commission (ndpc.gov.ng), or to your local data protection authority if you live outside Nigeria.",
        ),
      ],
    },
    {
      heading: "Changes to this notice",
      blocks: [
        p(
          "If we change this notice, we update the date and version at the top. For a change that matters, we tell you in the app first.",
        ),
      ],
    },
  ],
});

export type TermsFacts = {
  /** The deploy's app host (`appHostOf(NEXT_PUBLIC_APP_URL)`), or null. */
  readonly appHost: string | null;
  /** Each tool's name and credit price, from the tool modules. */
  readonly tools: readonly {
    readonly name: string;
    readonly credits: number;
  }[];
  readonly ngnPerCredit: number;
  readonly freeChatPerDay: { readonly guest: number; readonly account: number };
  readonly creditExpiryMonths: number;
};

const naira = (n: number): string => `₦${n.toLocaleString("en-NG")}`;

export const termsOfUse = (
  facts: TermsFacts,
  legal: LegalConfig = LEGAL,
): LegalDocument => ({
  title: "Terms of use",
  intro: `These terms are an agreement between you and ${legal.company} for your use of ${workspace(facts.appHost)}. By chatting with BeamX or creating an account, you agree to them.`,
  version: legal.termsVersion,
  updated: legal.termsUpdated,
  sections: [
    {
      heading: "The service",
      blocks: [
        p(
          "BeamX Workspace is a chat with an AI assistant that runs BeamX business tools for you, writes reports from your answers, and can book a strategy call with the BeamX team. You can use it as a guest or with a free account.",
        ),
      ],
    },
    {
      heading: "Credits",
      blocks: [
        p(
          `Tool runs are paid for with credits. One credit costs ${naira(facts.ngnPerCredit)}. Current prices:`,
        ),
        list(
          ...facts.tools.map((t) => `${t.name}: ${t.credits} credits a run.`),
        ),
        list(
          `Chatting is free up to ${facts.freeChatPerDay.guest} messages a day as a guest, or ${facts.freeChatPerDay.account} with an account; beyond that each reply costs a small number of credits.`,
          "The assistant always asks before spending credits. Credits are held when a run starts and charged only when the report is delivered.",
          "A run that fails costs nothing: its held credits are released.",
          "Credits are non refundable once a report has been delivered, and cannot be exchanged for cash.",
          `Credits expire after ${facts.creditExpiryMonths} months without any use.`,
          "We may change prices; a change never affects a run already started.",
        ),
      ],
    },
    {
      heading: "Acceptable use",
      blocks: [
        p("You agree not to:"),
        list(
          "Break the law, or use BeamX to harm others.",
          "Share data about other people that you have no right to share.",
          "Try to get around usage limits, credits or security, or overload the service.",
          "Use automated tools to access the service, or copy or resell it.",
          "Try to make the assistant produce harmful, deceptive or unlawful content.",
        ),
      ],
    },
    {
      heading: "Reports are guidance, not advice",
      blocks: [
        p(
          "Reports and answers are general guidance to help you think about your business. They are not financial, legal, tax, investment or other professional advice. Check important decisions with a qualified professional.",
        ),
      ],
    },
    {
      heading: "About the AI",
      blocks: [
        p(
          "Reports and replies are written by AI from what you tell it. AI can be wrong, incomplete or out of date, even when it sounds sure. Results depend on the answers you give, so check anything you rely on.",
        ),
      ],
    },
    {
      heading: "Your content",
      blocks: [
        p(
          "Your answers, chats and reports stay yours. You let us store and process them only to provide the service, as our privacy notice explains.",
        ),
      ],
    },
    {
      heading: "Ending your use",
      blocks: [
        p(
          "You can stop at any time and delete your account from the account menu. We may suspend or close an account that breaks these terms, and we tell you why unless the law stops us. Unused credits on an account closed for breaking these terms are lost.",
        ),
      ],
    },
    {
      heading: "Our liability",
      blocks: [
        p(
          "We work to keep BeamX running and accurate, but we provide it as it is, without promising it is always available or error free. As far as the law allows, we are not liable for indirect losses, lost profits, or decisions you make based on a report. Our total liability to you is limited to what you paid us for credits in the 12 months before the claim. Nothing here limits liability that cannot be limited by law.",
        ),
      ],
    },
    {
      heading: "Changes to these terms",
      blocks: [
        p(
          "If we change these terms, we update the date and version at the top and ask you to accept the new terms in the app. Continuing to use BeamX after that means you accept them.",
        ),
      ],
    },
    {
      heading: "Governing law",
      blocks: [
        p(
          `These terms are governed by the laws of the Federal Republic of Nigeria, and Nigerian courts have jurisdiction. Questions about these terms: ${legal.privacyEmail}.`,
        ),
      ],
    },
  ],
});
