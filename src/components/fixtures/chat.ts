import type {
  QuestionProgress,
  QuestionView,
} from "@/components/answer-cards/types";
import type { MessageView } from "@/components/workspace/types";

export const sectorQuestion: QuestionView = {
  kind: "single",
  id: "sector",
  prompt: "What kind of business is it?",
  help: "Pick the group that earns you the most money today. You can change it before your results are scored.",
  options: [
    { value: "retail", label: "Retail, 6 to 20 staff" },
    { value: "food", label: "Food and drinks" },
    { value: "services", label: "Professional services" },
    { value: "tech", label: "Technology" },
    { value: "other", label: "Something else" },
  ],
};

export const channelsQuestion: QuestionView = {
  kind: "multi",
  id: "channels",
  prompt: "How do customers find you today?",
  options: [
    { value: "walk-in", label: "Walk in traffic" },
    { value: "referrals", label: "Referrals from friends" },
    { value: "social", label: "Instagram or WhatsApp" },
    { value: "ads", label: "Paid adverts" },
    { value: "market", label: "A market stall" },
  ],
  min: 2,
  max: 4,
};

export const confidenceQuestion: QuestionView = {
  kind: "scale",
  id: "confidence",
  prompt: "How confident are you that customers will pay for this?",
  help: "1 means you have no proof yet. 5 means people have already paid you.",
  min: 1,
  max: 5,
  minLabel: "No proof yet",
  maxLabel: "Already paid",
};

export const longScaleQuestion: QuestionView = {
  kind: "scale",
  id: "likelihood",
  prompt: "How likely are you to recommend us to a friend?",
  min: 0,
  max: 10,
  minLabel: "Not at all likely",
  maxLabel: "Extremely likely",
};

export const descriptionQuestion: QuestionView = {
  kind: "text",
  id: "description",
  prompt: "Describe your idea in one or two sentences.",
  input: "text",
  placeholder: "A bakery that delivers fresh bread before 7am",
};

export const staffQuestion: QuestionView = {
  kind: "text",
  id: "staff",
  prompt: "How many people work in the business?",
  input: "number",
  minValue: 1,
  maxValue: 5000,
};

export const budgetQuestion: QuestionView = {
  kind: "text",
  id: "budget",
  prompt: "How much can you put in to start?",
  input: "money",
  minValue: 1000,
  placeholder: "250,000",
};

export const lunaProgress: QuestionProgress = {
  area: { index: 3, total: 9, name: "Marketing" },
  question: { index: 4, total: 7 },
};

export const plainProgress: QuestionProgress = {
  question: { index: 1, total: 12 },
};

export const openingMessages: readonly MessageView[] = [
  {
    id: "m1",
    role: "user",
    markdown: "I have a business idea",
    streaming: false,
  },
  {
    id: "m2",
    role: "assistant",
    markdown:
      "Great. I will walk you through the **Idea Check**. Tap an answer, or type if you prefer.",
    streaming: false,
  },
];

export const longUrlMessage: MessageView = {
  id: "m-long",
  role: "assistant",
  markdown:
    "Here is my source: https://example.com/a/very/long/path/that/keeps/going/and/going/with-no-spaces-at-all/0123456789012345678901234567890123456789012345678901234567890123456789012345678901234567890123456789",
  streaming: false,
};

/** The reply the streaming demo types out, in chunks. */
export const streamedReply =
  "Your idea has **real demand** in your area. Three things stand out:\n\n" +
  "- Customers already pay for a worse option\n" +
  "- Your start up cost is low\n" +
  "- Delivery is the part to test first\n\n" +
  "Read more in [our guide](https://example.com/guide).";
