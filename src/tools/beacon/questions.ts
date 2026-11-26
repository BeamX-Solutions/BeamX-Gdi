/**
 * Beacon's questions (spec 0010, kept by v2 in spec 0011). The business name, then
 * the standalone's 22 questions in its form order (fixtures/parity/beacon/questions.json).
 * Name and email are not asked: the account already holds them.
 *
 * Ids and option values are stored, so they never change once shipped. Each value is
 * the label's slug (spec 0010, "Questions"); each label is the standalone string exactly,
 * which is how the parity tests map a fixture answer to its value.
 */
import type { ToolQuestion } from "../_contract";

/** The business name's length limit. */
export const BUSINESS_NAME_MAX = 100;

const YOUR_BUSINESS = "Your business";
const FINANCIAL_HEALTH = "Financial Health";
const CUSTOMER_STRENGTH = "Customer Strength";
const OPERATIONAL_MATURITY = "Operational Maturity";
const FINANCIAL_INTELLIGENCE = "Financial Intelligence";
const GROWTH_RESILIENCE = "Growth & Resilience";

export const beaconQuestions: readonly ToolQuestion[] = [
  {
    kind: "text",
    id: "business_name",
    prompt: "What is your business called?",
    input: "text",
    maxLength: BUSINESS_NAME_MAX,
    area: YOUR_BUSINESS,
    factKey: "business_name",
  },
  {
    kind: "single",
    id: "industry",
    prompt: "Which industry is your business in?",
    area: YOUR_BUSINESS,
    factKey: "industry",
    options: [
      { value: "retail-trade", label: "Retail/Trade" },
      { value: "food-and-beverage", label: "Food & Beverage" },
      { value: "professional-services", label: "Professional Services" },
      { value: "beauty-and-personal-care", label: "Beauty & Personal Care" },
      {
        value: "logistics-and-transportation",
        label: "Logistics & Transportation",
      },
      { value: "manufacturing-production", label: "Manufacturing/Production" },
      { value: "hospitality", label: "Hospitality" },
      { value: "construction-trades", label: "Construction/Trades" },
      { value: "healthcare-services", label: "Healthcare Services" },
      { value: "education-training", label: "Education/Training" },
      { value: "agriculture", label: "Agriculture" },
      { value: "other", label: "Other" },
    ],
  },
  {
    kind: "single",
    id: "years_in_business",
    prompt: "How long has the business been running?",
    area: YOUR_BUSINESS,
    factKey: "years_in_business",
    options: [
      { value: "less-than-1-year", label: "Less than 1 year" },
      { value: "1-3-years", label: "1-3 years" },
      { value: "3-5-years", label: "3-5 years" },
      { value: "5-10-years", label: "5-10 years" },
      { value: "10-plus-years", label: "10+ years" },
    ],
  },
  {
    kind: "single",
    id: "cash_flow",
    prompt: "How would you describe your cash flow most months?",
    area: FINANCIAL_HEALTH,
    options: [
      { value: "consistent-surplus", label: "Consistent surplus" },
      { value: "breaking-even", label: "Breaking even" },
      {
        value: "unpredictable-some-surplus-some-deficit",
        label: "Unpredictable (some surplus, some deficit)",
      },
      {
        value: "burning-cash-consistently",
        label: "Burning cash consistently",
      },
      { value: "dont-know", label: "Don't know" },
    ],
  },
  {
    kind: "single",
    id: "profit_margin",
    prompt: "Roughly what profit margin do you make?",
    area: FINANCIAL_HEALTH,
    options: [
      { value: "30-pct-plus", label: "30%+" },
      { value: "20-30-pct", label: "20-30%" },
      { value: "10-20-pct", label: "10-20%" },
      { value: "5-10-pct", label: "5-10%" },
      {
        value: "less-than-5-pct-or-negative",
        label: "Less than 5% or negative",
      },
      { value: "dont-know", label: "Don't know" },
    ],
  },
  {
    kind: "single",
    id: "cash_runway",
    prompt: "If revenue stopped today, how long could you keep the lights on?",
    area: FINANCIAL_HEALTH,
    options: [
      { value: "6-plus-months", label: "6+ months" },
      { value: "3-6-months", label: "3-6 months" },
      { value: "1-3-months", label: "1-3 months" },
      { value: "less-than-1-month", label: "Less than 1 month" },
      { value: "would-close-immediately", label: "Would close immediately" },
    ],
  },
  {
    kind: "single",
    id: "payment_speed",
    prompt: "How fast do customers usually pay you?",
    area: FINANCIAL_HEALTH,
    options: [
      { value: "same-day-cash-instant", label: "Same day (cash/instant)" },
      { value: "1-7-days", label: "1-7 days" },
      { value: "8-30-days", label: "8-30 days" },
      { value: "31-60-days", label: "31-60 days" },
      { value: "60-plus-days", label: "60+ days" },
    ],
  },
  {
    kind: "single",
    id: "repeat_customer_rate",
    prompt: "How many of your customers come back to buy again?",
    area: CUSTOMER_STRENGTH,
    options: [
      { value: "70-pct-plus-repeat-customers", label: "70%+ repeat customers" },
      { value: "50-70-pct-repeat", label: "50-70% repeat" },
      { value: "30-50-pct-repeat", label: "30-50% repeat" },
      { value: "10-30-pct-repeat", label: "10-30% repeat" },
      { value: "less-than-10-pct-repeat", label: "Less than 10% repeat" },
    ],
  },
  {
    kind: "single",
    id: "acquisition_channel",
    prompt: "Where do most of your new customers come from?",
    area: CUSTOMER_STRENGTH,
    options: [
      { value: "referrals-word-of-mouth", label: "Referrals/word-of-mouth" },
      {
        value: "walk-ins-location-visibility",
        label: "Walk-ins/location visibility",
      },
      { value: "organic-social-media", label: "Organic social media" },
      {
        value: "repeat-business-relationships",
        label: "Repeat business relationships",
      },
      { value: "paid-advertising", label: "Paid advertising" },
      { value: "cold-outreach", label: "Cold outreach" },
      { value: "dont-know", label: "Don't know" },
    ],
  },
  {
    kind: "single",
    id: "pricing_power",
    prompt: "If you raised prices by 10% today, what would happen?",
    area: CUSTOMER_STRENGTH,
    options: [
      {
        value: "tested-increases-successfully",
        label: "Tested increases successfully",
      },
      {
        value: "most-customers-would-stay",
        label: "Most customers would stay",
      },
      {
        value: "some-would-leave-but-still-profitable",
        label: "Some would leave but still profitable",
      },
      {
        value: "would-lose-most-customers",
        label: "Would lose most customers",
      },
      { value: "dont-know", label: "Don't know" },
    ],
  },
  {
    kind: "single",
    id: "founder_dependency",
    prompt: "How long can the business run without you?",
    area: OPERATIONAL_MATURITY,
    options: [
      {
        value: "runs-2-plus-weeks-without-me",
        label: "Runs 2+ weeks without me",
      },
      { value: "can-step-away-1-week", label: "Can step away 1 week" },
      { value: "2-3-days-max", label: "2-3 days max" },
      { value: "cant-miss-even-1-day", label: "Can't miss even 1 day" },
      { value: "must-be-there-daily", label: "Must be there daily" },
    ],
  },
  {
    kind: "single",
    id: "process_documentation",
    prompt: "How are the ways of doing things in your business recorded?",
    area: OPERATIONAL_MATURITY,
    options: [
      {
        value: "comprehensive-written-processes",
        label: "Comprehensive written processes",
      },
      {
        value: "some-key-processes-documented",
        label: "Some key processes documented",
      },
      {
        value: "trained-others-mostly-in-my-head",
        label: "Trained others, mostly in my head",
      },
      {
        value: "everything-in-my-head-only",
        label: "Everything in my head only",
      },
      { value: "no-consistent-processes", label: "No consistent processes" },
    ],
  },
  {
    kind: "single",
    id: "inventory_tracking",
    prompt: "How do you keep track of stock?",
    area: OPERATIONAL_MATURITY,
    options: [
      { value: "digital-real-time-system", label: "Digital real-time system" },
      {
        value: "regular-manual-spreadsheet",
        label: "Regular manual/spreadsheet",
      },
      { value: "weekly-physical-count", label: "Weekly physical count" },
      { value: "only-when-running-low", label: "Only when running low" },
      { value: "dont-track", label: "Don't track" },
      {
        value: "not-applicable-service-business",
        label: "Not applicable (service business)",
      },
    ],
  },
  {
    kind: "single",
    id: "expense_awareness",
    prompt: "How well do you know what you spend each month?",
    area: FINANCIAL_INTELLIGENCE,
    options: [
      {
        value: "know-exact-amounts-and-percentages",
        label: "Know exact amounts and percentages",
      },
      { value: "know-roughly", label: "Know roughly" },
      { value: "general-idea", label: "General idea" },
      { value: "would-have-to-look-up", label: "Would have to look up" },
      { value: "no-idea", label: "No idea" },
    ],
  },
  {
    kind: "single",
    id: "profit_per_product",
    prompt: "Do you know which products or services make you the most profit?",
    area: FINANCIAL_INTELLIGENCE,
    options: [
      {
        value: "know-margins-on-each-offering",
        label: "Know margins on each offering",
      },
      {
        value: "good-sense-of-whats-profitable",
        label: "Good sense of what's profitable",
      },
      {
        value: "know-revenue-only-not-profit",
        label: "Know revenue only, not profit",
      },
      { value: "havent-analyzed", label: "Haven't analyzed" },
      { value: "all-seem-about-the-same", label: "All seem about the same" },
    ],
  },
  {
    kind: "single",
    id: "pricing_strategy",
    prompt: "How do you set your prices?",
    area: FINANCIAL_INTELLIGENCE,
    options: [
      {
        value: "cost-plus-margin-plus-market-research",
        label: "Cost + margin + market research",
      },
      { value: "match-competitors", label: "Match competitors" },
      {
        value: "cost-plus-markup-no-market-analysis",
        label: "Cost + markup (no market analysis)",
      },
      { value: "what-feels-right", label: "What feels right" },
      { value: "no-strategy", label: "No strategy" },
    ],
  },
  {
    kind: "single",
    id: "business_trajectory",
    prompt: "How has revenue changed over the last year?",
    area: GROWTH_RESILIENCE,
    options: [
      { value: "growing-20-pct-plus", label: "Growing 20%+" },
      { value: "growing-5-20-pct", label: "Growing 5-20%" },
      { value: "stable-5-pct", label: "Stable (±5%)" },
      { value: "declining-5-20-pct", label: "Declining 5-20%" },
      { value: "declining-20-pct-plus", label: "Declining 20%+" },
      { value: "less-than-1-year-old", label: "Less than 1 year old" },
    ],
  },
  {
    kind: "single",
    id: "revenue_diversification",
    prompt: "How many different sources does your revenue come from?",
    area: GROWTH_RESILIENCE,
    options: [
      {
        value: "4-plus-streams-customer-types",
        label: "4+ streams/customer types",
      },
      { value: "2-3-streams", label: "2-3 streams" },
      { value: "primary-plus-side-income", label: "Primary + side income" },
      {
        value: "single-product-customer-type",
        label: "Single product/customer type",
      },
      {
        value: "dependent-on-1-2-major-customers",
        label: "Dependent on 1-2 major customers",
      },
    ],
  },
  {
    kind: "single",
    id: "digital_payments",
    prompt: "How much of your income comes in through digital payments?",
    area: GROWTH_RESILIENCE,
    options: [
      { value: "80-pct-plus-digital", label: "80%+ digital" },
      { value: "50-80-pct-digital", label: "50-80% digital" },
      { value: "20-50-pct-digital", label: "20-50% digital" },
      { value: "less-than-20-pct-digital", label: "Less than 20% digital" },
    ],
  },
  {
    kind: "single",
    id: "formal_registration",
    prompt: "Is the business registered and up to date on taxes?",
    area: GROWTH_RESILIENCE,
    options: [
      {
        value: "fully-registered-and-tax-compliant",
        label: "Fully registered and tax compliant",
      },
      {
        value: "registered-behind-on-taxes",
        label: "Registered, behind on taxes",
      },
      {
        value: "in-process-of-registering",
        label: "In process of registering",
      },
      { value: "not-registered", label: "Not registered" },
    ],
  },
  {
    kind: "single",
    id: "infrastructure",
    prompt: "How reliable are power, internet and supplies for you?",
    area: GROWTH_RESILIENCE,
    options: [
      {
        value: "consistent-power-internet-supply",
        label: "Consistent power/internet/supply",
      },
      {
        value: "mostly-reliable-with-backups",
        label: "Mostly reliable with backups",
      },
      { value: "frequent-disruptions", label: "Frequent disruptions" },
      { value: "major-challenges-daily", label: "Major challenges daily" },
    ],
  },
  {
    kind: "single",
    id: "banking_relationship",
    prompt: "What is your relationship with banks like?",
    area: GROWTH_RESILIENCE,
    options: [
      {
        value: "strong-accessed-loans-credit",
        label: "Strong, accessed loans/credit",
      },
      { value: "accounts-but-no-credit", label: "Accounts but no credit" },
      { value: "minimal-interaction", label: "Minimal interaction" },
      { value: "no-bank-relationship", label: "No bank relationship" },
    ],
  },
  {
    kind: "single",
    id: "primary_pain_point",
    prompt: "What is your biggest challenge right now?",
    area: YOUR_BUSINESS,
    options: [
      {
        value: "getting-more-customers-sales",
        label: "Getting more customers/sales",
      },
      {
        value: "managing-cash-flow-getting-paid",
        label: "Managing cash flow/getting paid",
      },
      { value: "hiring-or-managing-staff", label: "Hiring or managing staff" },
      {
        value: "keeping-costs-under-control",
        label: "Keeping costs under control",
      },
      { value: "too-busy-overwhelmed", label: "Too busy/overwhelmed" },
      {
        value: "inconsistent-quality-delivery",
        label: "Inconsistent quality/delivery",
      },
      { value: "dont-know-where-to-focus", label: "Don't know where to focus" },
      {
        value: "competition-market-changes",
        label: "Competition/market changes",
      },
      {
        value: "actually-doing-well-want-to-optimize",
        label: "Actually doing well, want to optimize",
      },
    ],
  },
];
