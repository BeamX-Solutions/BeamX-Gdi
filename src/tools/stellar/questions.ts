/**
 * Stellar's questions (spec 0005), ported from the original `lib/questions.ts`
 * (fixtures/parity/stellar/questions.json). Ids and option values are stored, so they
 * never change once shipped.
 */
import type { Answers, ToolQuestion } from "../_contract";

/** Every Stellar text answer, including the follow ups (spec 0005). */
export const STELLAR_TEXT_MAX = 500;

const isOneOf =
  (questionId: string, values: readonly string[]) =>
  (answers: Answers): boolean => {
    const value = answers[questionId];
    return typeof value === "string" && values.includes(value);
  };

const followUp = (
  id: string,
  prompt: string,
  parentId: string,
  triggers: readonly string[],
): ToolQuestion => ({
  kind: "text",
  id,
  prompt,
  input: "text",
  maxLength: STELLAR_TEXT_MAX,
  placeholder: "Please elaborate...",
  when: isOneOf(parentId, triggers),
});

export const stellarQuestions: readonly ToolQuestion[] = [
  {
    kind: "single",
    id: "foundation",
    prompt: "The Foundation: do you have all three of these?",
    options: [
      {
        value: "all-three",
        label:
          "I have a product/service to sell, people willing to pay, and means to receive payment.",
      },
      {
        value: "missing-product",
        label: "I don't have a clear product or service",
      },
      {
        value: "missing-customers",
        label: "I don't have people willing to pay for my product or service",
      },
      {
        value: "missing-payment",
        label:
          "I have not set up bank accounts/payment gateways to receive money",
      },
      { value: "missing-multiple", label: "I am missing multiple elements" },
    ],
  },
  {
    kind: "text",
    id: "value_creation",
    prompt:
      'Complete this sentence: "I help _____ [who] achieve _____ [what result] by _____ [how]"',
    input: "text",
    maxLength: STELLAR_TEXT_MAX,
    placeholder:
      "e.g., I help small business owners increase sales by implementing proven digital marketing strategies",
  },
  {
    kind: "single",
    id: "market_validation",
    prompt:
      "Have you talked to at least 10 potential customers who said they'd pay for this?",
    options: [
      { value: "yes-confirmed", label: "Yes, and they confirmed they'd buy" },
      {
        value: "talked-no-payment",
        label: "I talked to people but didn't ask about payment",
      },
      { value: "no-validation", label: "No, haven't validated yet" },
    ],
  },
  {
    kind: "single",
    id: "investment",
    prompt: "How much money do you think you need to start?",
    options: [
      { value: "under-100", label: "Less than $100" },
      { value: "100-500", label: "$100-$500" },
      { value: "500-1000", label: "$500-$1,000" },
      { value: "over-1000", label: "More than $1,000" },
    ],
  },
  followUp(
    "investment_detail",
    "What do you think you need to spend money on?",
    "investment",
    ["500-1000", "over-1000"],
  ),
  {
    kind: "single",
    id: "skills",
    prompt:
      'Can you answer YES to: "People already ask me for help with this"?',
    options: [
      { value: "yes-regularly", label: "Yes, regularly" },
      { value: "sometimes", label: "Sometimes" },
      { value: "no", label: "No" },
    ],
  },
  followUp(
    "skills_detail",
    "What skill do people actually ask you about?",
    "skills",
    ["no"],
  ),
  {
    kind: "single",
    id: "speed",
    prompt:
      "Can you make your first sale within 7 days with what you have right now?",
    options: [
      { value: "yes-ready", label: "Yes, I'm ready" },
      { value: "almost", label: "Almost - just need a few things" },
      { value: "months", label: "No, I need months to prepare" },
    ],
  },
  followUp(
    "speed_detail",
    "What still stands between you and your first sale?",
    "speed",
    ["almost", "months"],
  ),
  {
    kind: "single",
    id: "passion_market_fit",
    prompt:
      "Does your idea connect something you love with something people will pay for?",
    options: [
      { value: "both", label: "Yes - It's my passion AND people want it" },
      {
        value: "passion-only",
        label: "It's my passion, but not sure about demand",
      },
      {
        value: "demand-only",
        label: "People want it, but I'm not passionate",
      },
      { value: "neither", label: "Neither - just seems like a good idea" },
    ],
  },
  {
    kind: "text",
    id: "competitors",
    prompt: "Who are your competitors?",
    help: "Direct or indirect, their name and website",
    input: "text",
    maxLength: STELLAR_TEXT_MAX,
    placeholder: "e.g., Acme Inc (acme.com), Beta Corp (betacorp.io)",
  },
  {
    kind: "single",
    id: "learning",
    prompt: "How will you learn what you don't know?",
    options: [
      {
        value: "start-imperfect",
        label: "Start imperfectly and figure it out along the way",
      },
      {
        value: "hire-complement",
        label: "Will hire people who will complement my skill",
      },
      {
        value: "courses-first",
        label: "Need to take courses and read books first",
      },
      {
        value: "perfect-first",
        label: "Must have everything perfect before starting",
      },
    ],
  },
  {
    kind: "single",
    id: "commitment",
    prompt:
      "Will you take one action in the next 24 hours to move this forward?",
    options: [
      { value: "yes", label: "Yes (I'll specify what)" },
      { value: "maybe", label: "Maybe" },
      { value: "no", label: "No" },
    ],
  },
  followUp(
    "commitment_detail",
    "What will you do in the next 24 hours, or what is holding you back?",
    "commitment",
    ["yes", "no"],
  ),
];
