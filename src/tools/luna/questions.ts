/**
 * Luna's questions (spec 0013, AC-1, AC-2): the 12 business context questions, then the
 * 38 questionnaire questions across 9 squares, in the standalone's order
 * (fixtures/parity/luna/questions.json, standalone commit 6da7b691).
 * Generated from that fixture; edit by hand only with care, since ids and option values
 * are stored and never change once shipped. Option values are slugs of the standalone
 * strings (industry keeps its own slugs, labelled from the standalone's industry list).
 */
import type { ToolQuestion } from "../_contract";

export const SHORT_TEXT_MAX = 200;
export const LONG_TEXT_MAX = 1000;

const YOUR_BUSINESS = "Your business";

/** The 9 squares, in order. */
export const SQUARES = [
  "Target Market & Customer Avatar",
  "Value Proposition & Messaging",
  "Media Channels & Reach",
  "Lead Capture & Acquisition",
  "Lead Nurturing & Relationship Building",
  "Sales Conversion & Closing",
  "Customer Experience & Delivery",
  "Lifetime Value & Growth",
  "Referral System & Advocacy",
] as const;

export const lunaQuestionList: readonly ToolQuestion[] = [
  {
    kind: "text",
    id: "business-name",
    prompt: "What is your business name?",
    help: "This will be included in your marketing plan and communications.",
    area: YOUR_BUSINESS,
    input: "text",
    maxLength: SHORT_TEXT_MAX,
    placeholder: "Enter your business name...",
  },
  {
    kind: "text",
    id: "business-website",
    prompt: "What is your website URL? (Optional)",
    help: "We'll include this in your marketing plan and send it with your plan details.",
    area: YOUR_BUSINESS,
    input: "text",
    maxLength: SHORT_TEXT_MAX,
    placeholder: "https://www.example.com",
    optional: true,
  },
  {
    kind: "single",
    id: "industry",
    prompt: "What industry best describes your business?",
    help: "Select the industry that most closely matches your business model and target market.",
    area: YOUR_BUSINESS,
    options: [
      { value: "professional-services", label: "Professional Services" },
      { value: "healthcare", label: "Healthcare & Medical" },
      { value: "ecommerce", label: "E-commerce & Retail" },
      { value: "restaurants", label: "Restaurants & Food Service" },
      { value: "b2b-software", label: "B2B Software & SaaS" },
      { value: "real-estate", label: "Real Estate" },
      { value: "fitness", label: "Fitness & Wellness" },
      { value: "home-services", label: "Home Services" },
      { value: "manufacturing", label: "Manufacturing" },
      { value: "education", label: "Education & Training" },
      { value: "financial-services", label: "Financial Services" },
      { value: "nonprofit", label: "Nonprofit & Charity" },
      { value: "travel", label: "Travel & Aviation" },
      { value: "technology", label: "Technology" },
      { value: "retail", label: "Retail" },
      { value: "logistics", label: "Logistics" },
      { value: "media-entertainment", label: "Media & Entertainment" },
      { value: "hospitality", label: "Hospitality" },
    ],
  },
  {
    kind: "single",
    id: "business-model",
    prompt: "What is your primary business model?",
    help: "B2B serves businesses, B2C serves consumers, B2B2C serves businesses that serve consumers, Marketplace connects buyers and sellers.",
    area: YOUR_BUSINESS,
    options: [
      { value: "b2b", label: "B2B" },
      { value: "b2c", label: "B2C" },
      { value: "b2b2c", label: "B2B2C" },
      { value: "marketplace", label: "Marketplace" },
    ],
  },
  {
    kind: "single",
    id: "company-size",
    prompt: "How many employees does your company have?",
    area: YOUR_BUSINESS,
    options: [
      { value: "just-me-1", label: "Just me (1)" },
      { value: "2-5-employees", label: "2-5 employees" },
      { value: "6-20-employees", label: "6-20 employees" },
      { value: "21-50-employees", label: "21-50 employees" },
      { value: "50-plus-employees", label: "50+ employees" },
    ],
  },
  {
    kind: "single",
    id: "years-in-operation",
    prompt: "How long has your business been operating?",
    area: YOUR_BUSINESS,
    options: [
      { value: "pre-launch", label: "Pre-launch" },
      { value: "less-than-1-year", label: "Less than 1 year" },
      { value: "1-2-years", label: "1-2 years" },
      { value: "3-5-years", label: "3-5 years" },
      { value: "6-10-years", label: "6-10 years" },
      { value: "10-plus-years", label: "10+ years" },
    ],
  },
  {
    kind: "single",
    id: "geographic-scope",
    prompt: "What is your primary geographic market?",
    area: YOUR_BUSINESS,
    options: [
      { value: "local-city", label: "Local/City" },
      { value: "regional-state", label: "Regional/State" },
      { value: "national", label: "National" },
      { value: "international", label: "International" },
    ],
  },
  {
    kind: "multi",
    id: "primary-challenges",
    prompt:
      "What are your biggest business challenges? (Select all that apply)",
    area: YOUR_BUSINESS,
    options: [
      { value: "finding-new-customers", label: "Finding new customers" },
      {
        value: "converting-leads-to-sales",
        label: "Converting leads to sales",
      },
      {
        value: "increasing-prices-profitability",
        label: "Increasing prices/profitability",
      },
      {
        value: "standing-out-from-competition",
        label: "Standing out from competition",
      },
      { value: "building-brand-awareness", label: "Building brand awareness" },
      {
        value: "generating-consistent-revenue",
        label: "Generating consistent revenue",
      },
      {
        value: "rising-operational-costs-and-cash-flow-management",
        label: "Rising operational costs & cash flow management",
      },
      {
        value: "hiring-and-retaining-talent",
        label: "Hiring and retaining talent",
      },
      { value: "scaling-operations", label: "Scaling operations" },
      {
        value: "digital-marketing-effectiveness",
        label: "Digital marketing effectiveness",
      },
      {
        value: "adopting-and-managing-artificial-intelligence-ai",
        label: "Adopting and Managing Artificial Intelligence (AI)",
      },
      { value: "retaining-customers", label: "Retaining customers" },
      {
        value: "currency-volatility-and-forex-issues",
        label: "Currency volatility & forex issues",
      },
    ],
    min: 1,
    max: 13,
  },
  {
    kind: "single",
    id: "marketing-maturity",
    prompt: "How would you rate your current marketing expertise?",
    area: YOUR_BUSINESS,
    options: [
      {
        value: "beginner-just-getting-started",
        label: "Beginner (just getting started)",
      },
      {
        value: "intermediate-some-experience",
        label: "Intermediate (some experience)",
      },
      {
        value: "advanced-very-experienced",
        label: "Advanced (very experienced)",
      },
    ],
  },
  {
    kind: "single",
    id: "marketing-budget",
    prompt: "What is your monthly marketing budget range?",
    area: YOUR_BUSINESS,
    options: [
      { value: "ngn-0-ngn-500-000", label: "₦0-₦500,000" },
      { value: "ngn-500-000-ngn-2-000-000", label: "₦500,000-₦2,000,000" },
      { value: "ngn-2-000-000-ngn-5-000-000", label: "₦2,000,000-₦5,000,000" },
      {
        value: "ngn-5-000-000-ngn-10-000-000",
        label: "₦5,000,000-₦10,000,000",
      },
      { value: "ngn-10-000-000-plus", label: "₦10,000,000+" },
    ],
  },
  {
    kind: "single",
    id: "time-availability",
    prompt: "How much time can you dedicate to marketing activities per week?",
    area: YOUR_BUSINESS,
    options: [
      { value: "1-2-hours", label: "1-2 hours" },
      { value: "3-5-hours", label: "3-5 hours" },
      { value: "6-10-hours", label: "6-10 hours" },
      { value: "11-20-hours", label: "11-20 hours" },
      { value: "20-plus-hours", label: "20+ hours" },
    ],
  },
  {
    kind: "multi",
    id: "business-goals",
    prompt:
      "What are your primary business goals for the next 12 months? (Select all that apply)",
    area: YOUR_BUSINESS,
    options: [
      {
        value: "increase-revenue-by-25-50-pct",
        label: "Increase revenue by 25-50%",
      },
      {
        value: "increase-revenue-by-50-100-pct",
        label: "Increase revenue by 50-100%",
      },
      {
        value: "increase-revenue-by-100-pct-plus",
        label: "Increase revenue by 100%+",
      },
      { value: "improve-profit-margins", label: "Improve profit margins" },
      { value: "expand-to-new-markets", label: "Expand to new markets" },
      {
        value: "launch-new-products-services",
        label: "Launch new products/services",
      },
      {
        value: "build-stronger-brand-recognition",
        label: "Build stronger brand recognition",
      },
      {
        value: "improve-customer-retention",
        label: "Improve customer retention",
      },
      { value: "streamline-operations", label: "Streamline operations" },
      { value: "hire-more-team-members", label: "Hire more team members" },
      {
        value: "acquire-new-users-customers",
        label: "Acquire new users/customers",
      },
    ],
    min: 1,
    max: 11,
  },
  {
    kind: "multi",
    id: "target-demographics-age",
    prompt: "What is the age range of your ideal customers? (Select up to 2)",
    area: SQUARES[0],
    options: [
      { value: "18-24", label: "18-24" },
      { value: "25-34", label: "25-34" },
      { value: "35-44", label: "35-44" },
      { value: "45-54", label: "45-54" },
      { value: "55-64", label: "55-64" },
      { value: "65-plus", label: "65+" },
      { value: "mixed-varies", label: "Mixed/Varies" },
    ],
    min: 1,
    max: 2,
  },
  {
    kind: "single",
    id: "target-demographics-income",
    prompt: "What is the income level of your ideal customers?",
    area: SQUARES[0],
    options: [
      { value: "under-ngn-30m", label: "Under ₦30M" },
      { value: "ngn-30m-ngn-50m", label: "₦30M-₦50M" },
      { value: "ngn-50m-ngn-75m", label: "₦50M-₦75M" },
      { value: "ngn-75m-ngn-100m", label: "₦75M-₦100M" },
      { value: "ngn-100m-ngn-150m", label: "₦100M-₦150M" },
      { value: "ngn-150m-plus", label: "₦150M+" },
      { value: "varies-business-budget", label: "Varies/Business budget" },
    ],
  },
  {
    kind: "text",
    id: "target-location",
    prompt: "Where are your ideal customers located?",
    area: SQUARES[0],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Describe the geographic location, lifestyle, or work environment of your ideal customers...",
    multiline: true,
  },
  {
    kind: "text",
    id: "customer-pain-points",
    prompt:
      "What are the top 3 biggest problems or frustrations your ideal customers face?",
    help: "Think about the challenges that keep your customers awake at night or cause them daily frustration.",
    area: SQUARES[0],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder: "List the specific problems your product/service solves...",
    multiline: true,
  },
  {
    kind: "text",
    id: "customer-goals",
    prompt: "What are your ideal customers trying to achieve?",
    area: SQUARES[0],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder: "Describe their goals, dreams, and desired outcomes...",
    multiline: true,
  },
  {
    kind: "text",
    id: "customer-buying-behavior",
    prompt: "How do your customers typically make purchasing decisions?",
    area: SQUARES[0],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Describe their research process, decision factors, and buying timeline...",
    multiline: true,
  },
  {
    kind: "multi",
    id: "current-customer-sources",
    prompt: "Where do you currently find your best customers?",
    area: SQUARES[0],
    options: [
      {
        value: "referrals-from-existing-customers",
        label: "Referrals from existing customers",
      },
      { value: "google-search-results", label: "Google search results" },
      {
        value: "social-media-facebook-instagram-etc",
        label: "Social media (Facebook, Instagram, etc.)",
      },
      { value: "linkedin", label: "LinkedIn" },
      {
        value: "industry-events-networking",
        label: "Industry events/networking",
      },
      {
        value: "direct-outreach-cold-calling",
        label: "Direct outreach/cold calling",
      },
      {
        value: "partnerships-with-other-businesses",
        label: "Partnerships with other businesses",
      },
      { value: "online-directories", label: "Online directories" },
      { value: "print-advertising", label: "Print advertising" },
      { value: "radio-tv-advertising", label: "Radio/TV advertising" },
      { value: "content-marketing-blog", label: "Content marketing/blog" },
      { value: "email-marketing", label: "Email marketing" },
      { value: "other", label: "Other" },
    ],
    min: 1,
    max: 13,
  },
  {
    kind: "text",
    id: "core-problem-solved",
    prompt:
      "In one clear sentence, what is the main problem your business solves?",
    help: "This should be clear, specific, and focused on the customer's perspective.",
    area: SQUARES[1],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "We help [target customer] solve [specific problem] by [solution approach]...",
    multiline: true,
  },
  {
    kind: "text",
    id: "unique-advantages",
    prompt:
      "What makes you different from your competitors? List your top 3 unique advantages.",
    area: SQUARES[1],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder: "List what sets you apart from alternatives in your market...",
    multiline: true,
  },
  {
    kind: "text",
    id: "tangible-benefits",
    prompt:
      "What specific, measurable results do customers get from your product/service?",
    area: SQUARES[1],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "List concrete outcomes like time saved, money earned, problems eliminated...",
    multiline: true,
  },
  {
    kind: "text",
    id: "emotional-benefits",
    prompt: "How does your product/service make customers feel?",
    area: SQUARES[1],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Describe the emotional outcomes: confidence, peace of mind, excitement, etc...",
    multiline: true,
  },
  {
    kind: "multi",
    id: "proof-points",
    prompt: "What evidence do you have that your solution works?",
    area: SQUARES[1],
    options: [
      { value: "customer-testimonials", label: "Customer testimonials" },
      {
        value: "case-studies-with-results",
        label: "Case studies with results",
      },
      { value: "industry-certifications", label: "Industry certifications" },
      { value: "awards-or-recognition", label: "Awards or recognition" },
      { value: "years-of-experience", label: "Years of experience" },
      {
        value: "number-of-satisfied-customers",
        label: "Number of satisfied customers",
      },
      {
        value: "measurable-success-metrics",
        label: "Measurable success metrics",
      },
      { value: "guarantee-or-warranty", label: "Guarantee or warranty" },
      {
        value: "scientific-studies-or-research",
        label: "Scientific studies or research",
      },
      { value: "media-coverage-or-press", label: "Media coverage or press" },
      { value: "professional-credentials", label: "Professional credentials" },
      { value: "other", label: "Other" },
    ],
    min: 1,
    max: 12,
  },
  {
    kind: "text",
    id: "current-marketing-channels",
    prompt:
      "Which marketing channels are you currently using? Rate their effectiveness (1-10).",
    help: "Rate each channel you use from 1 (not effective) to 10 (very effective)",
    area: SQUARES[2],
    input: "text",
    maxLength: SHORT_TEXT_MAX,
  },
  {
    kind: "multi",
    id: "digital-marketing-preferences",
    prompt: "Which digital marketing channels are most interesting to you?",
    area: SQUARES[2],
    options: [
      {
        value: "search-engine-optimization-seo",
        label: "Search Engine Optimization (SEO)",
      },
      {
        value: "google-ads-search-and-display",
        label: "Google Ads (Search & Display)",
      },
      {
        value: "facebook-and-instagram-ads",
        label: "Facebook & Instagram Ads",
      },
      { value: "linkedin-marketing", label: "LinkedIn Marketing" },
      { value: "youtube-marketing", label: "YouTube Marketing" },
      { value: "email-marketing", label: "Email Marketing" },
      {
        value: "content-marketing-blogging",
        label: "Content Marketing/Blogging",
      },
      { value: "podcast-advertising", label: "Podcast Advertising" },
      { value: "influencer-marketing", label: "Influencer Marketing" },
      { value: "affiliate-marketing", label: "Affiliate Marketing" },
      { value: "webinars", label: "Webinars" },
      {
        value: "online-communities-forums",
        label: "Online Communities/Forums",
      },
    ],
    min: 1,
    max: 12,
  },
  {
    kind: "multi",
    id: "content-creation-capacity",
    prompt:
      "What types of content can you realistically create on a regular basis?",
    area: SQUARES[2],
    options: [
      {
        value: "written-blog-posts-articles",
        label: "Written blog posts/articles",
      },
      { value: "social-media-posts", label: "Social media posts" },
      {
        value: "videos-talking-head-style",
        label: "Videos (talking head style)",
      },
      { value: "videos-produced-edited", label: "Videos (produced/edited)" },
      { value: "podcasts-audio-content", label: "Podcasts/audio content" },
      {
        value: "infographics-visual-content",
        label: "Infographics/visual content",
      },
      { value: "photography", label: "Photography" },
      { value: "live-streaming", label: "Live streaming" },
      { value: "webinars-presentations", label: "Webinars/presentations" },
      { value: "email-newsletters", label: "Email newsletters" },
      { value: "case-studies", label: "Case studies" },
      { value: "white-papers-guides", label: "White papers/guides" },
    ],
    min: 1,
    max: 12,
  },
  {
    kind: "multi",
    id: "current-lead-generation",
    prompt: "How do you currently capture leads and contact information?",
    area: SQUARES[3],
    options: [
      { value: "website-contact-forms", label: "Website contact forms" },
      { value: "free-consultation-offers", label: "Free consultation offers" },
      { value: "newsletter-signups", label: "Newsletter signups" },
      {
        value: "downloadable-resources-pdfs-guides",
        label: "Downloadable resources (PDFs, guides)",
      },
      {
        value: "free-tools-or-calculators",
        label: "Free tools or calculators",
      },
      { value: "webinar-registrations", label: "Webinar registrations" },
      {
        value: "contest-or-giveaway-entries",
        label: "Contest or giveaway entries",
      },
      { value: "event-registrations", label: "Event registrations" },
      { value: "social-media-engagement", label: "Social media engagement" },
      { value: "referral-requests", label: "Referral requests" },
      { value: "cold-outreach-responses", label: "Cold outreach responses" },
      {
        value: "trade-show-networking-follow-up",
        label: "Trade show/networking follow-up",
      },
    ],
    min: 1,
    max: 12,
  },
  {
    kind: "text",
    id: "lead-magnets",
    prompt:
      "What valuable free resource could you offer to attract potential customers?",
    help: "Think about what would be so valuable your ideal customer would gladly give their email address for it.",
    area: SQUARES[3],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Examples: Free guide, checklist, consultation, trial, assessment, template...",
    multiline: true,
  },
  {
    kind: "single",
    id: "website-optimization",
    prompt:
      "How would you rate your current website's ability to convert visitors into leads?",
    area: SQUARES[3],
    options: [
      { value: "excellent-8-10", label: "Excellent (8-10)" },
      { value: "good-6-7", label: "Good (6-7)" },
      { value: "average-4-5", label: "Average (4-5)" },
      { value: "poor-1-3", label: "Poor (1-3)" },
      { value: "i-don-t-have-a-website", label: "I don't have a website" },
    ],
  },
  {
    kind: "text",
    id: "follow-up-process",
    prompt: "Describe your current process for following up with new leads.",
    area: SQUARES[4],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "What happens after someone shows interest? How quickly and how often do you follow up?",
    multiline: true,
  },
  {
    kind: "single",
    id: "email-marketing-current",
    prompt: "Do you currently use email marketing?",
    area: SQUARES[4],
    options: [
      {
        value: "yes-regularly-with-automated-sequences",
        label: "Yes, regularly with automated sequences",
      },
      {
        value: "yes-but-only-occasional-newsletters",
        label: "Yes, but only occasional newsletters",
      },
      { value: "rarely-or-inconsistently", label: "Rarely or inconsistently" },
      { value: "no-not-at-all", label: "No, not at all" },
    ],
  },
  {
    kind: "text",
    id: "educational-content",
    prompt:
      "What educational content could you share to build trust with potential customers?",
    area: SQUARES[4],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Examples: Industry insights, how-to guides, tips, case studies, trend analysis...",
    multiline: true,
  },
  {
    kind: "single",
    id: "relationship-timeline",
    prompt:
      "How long does it typically take for a prospect to become a customer?",
    area: SQUARES[4],
    options: [
      { value: "same-day", label: "Same day" },
      { value: "1-7-days", label: "1-7 days" },
      { value: "1-4-weeks", label: "1-4 weeks" },
      { value: "1-3-months", label: "1-3 months" },
      { value: "3-6-months", label: "3-6 months" },
      { value: "6-plus-months", label: "6+ months" },
    ],
  },
  {
    kind: "text",
    id: "sales-process",
    prompt:
      "Describe your current sales process from first contact to closed deal.",
    area: SQUARES[5],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Walk through each step: initial contact, discovery, proposal, negotiation, closing...",
    multiline: true,
  },
  {
    kind: "text",
    id: "common-objections",
    prompt:
      "What are the most common objections or concerns potential customers raise?",
    area: SQUARES[5],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "List the reasons people hesitate or say no, and how you currently address them...",
    multiline: true,
  },
  {
    kind: "single",
    id: "pricing-strategy",
    prompt: "How do you typically present pricing to potential customers?",
    area: SQUARES[5],
    options: [
      { value: "single-price-option", label: "Single price option" },
      { value: "multiple-packages-tiers", label: "Multiple packages/tiers" },
      { value: "custom-quotes-only", label: "Custom quotes only" },
      { value: "price-varies-by-project", label: "Price varies by project" },
      { value: "negotiable-pricing", label: "Negotiable pricing" },
    ],
  },
  {
    kind: "single",
    id: "conversion-rate",
    prompt:
      "Approximately what percentage of qualified prospects become paying customers?",
    area: SQUARES[5],
    options: [
      { value: "less-than-10-pct", label: "Less than 10%" },
      { value: "10-25-pct", label: "10-25%" },
      { value: "25-50-pct", label: "25-50%" },
      { value: "50-75-pct", label: "50-75%" },
      { value: "75-pct-plus", label: "75%+" },
      { value: "i-m-not-sure", label: "I'm not sure" },
    ],
  },
  {
    kind: "text",
    id: "delivery-method",
    prompt: "How do you deliver your product or service to customers?",
    area: SQUARES[6],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Describe your fulfillment, delivery, or service delivery process...",
    multiline: true,
  },
  {
    kind: "text",
    id: "onboarding-process",
    prompt: "What is your process for getting new customers started?",
    area: SQUARES[6],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "How do you ensure customers have a great experience from day one?",
    multiline: true,
  },
  {
    kind: "multi",
    id: "customer-support",
    prompt: "How do customers get help or support when they need it?",
    area: SQUARES[6],
    options: [
      { value: "email-support", label: "Email support" },
      { value: "phone-support", label: "Phone support" },
      { value: "live-chat", label: "Live chat" },
      { value: "knowledge-base-faq", label: "Knowledge base/FAQ" },
      { value: "video-tutorials", label: "Video tutorials" },
      { value: "in-person-meetings", label: "In-person meetings" },
      { value: "online-training-sessions", label: "Online training sessions" },
      { value: "community-forum", label: "Community forum" },
      {
        value: "dedicated-account-manager",
        label: "Dedicated account manager",
      },
      { value: "self-service-portal", label: "Self-service portal" },
    ],
    min: 1,
    max: 10,
  },
  {
    kind: "text",
    id: "customer-feedback",
    prompt: "How do you collect and use customer feedback?",
    area: SQUARES[6],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder: "Describe how you gather feedback and what you do with it...",
    multiline: true,
  },
  {
    kind: "single",
    id: "repeat-business",
    prompt: "What percentage of your customers make repeat purchases or renew?",
    area: SQUARES[7],
    options: [
      { value: "less-than-25-pct", label: "Less than 25%" },
      { value: "25-50-pct", label: "25-50%" },
      { value: "50-75-pct", label: "50-75%" },
      { value: "75-90-pct", label: "75-90%" },
      { value: "90-pct-plus", label: "90%+" },
      {
        value: "not-applicable-one-time-purchase",
        label: "Not applicable (one-time purchase)",
      },
    ],
  },
  {
    kind: "text",
    id: "upsell-opportunities",
    prompt:
      "What additional products or services could you offer existing customers?",
    area: SQUARES[7],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "List complementary offerings, upgrades, or premium services...",
    multiline: true,
  },
  {
    kind: "text",
    id: "customer-retention",
    prompt: "What do you do to keep customers engaged and prevent churn?",
    area: SQUARES[7],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Describe your retention strategies, loyalty programs, or ongoing engagement...",
    multiline: true,
  },
  {
    kind: "single",
    id: "average-customer-value",
    prompt: "What is the approximate lifetime value of your average customer?",
    area: SQUARES[7],
    options: [
      { value: "under-ngn-500-000", label: "Under ₦500,000" },
      { value: "ngn-500-000-ngn-2-000-000", label: "₦500,000-₦2,000,000" },
      {
        value: "ngn-2-000-000-ngn-10-000-000",
        label: "₦2,000,000-₦10,000,000",
      },
      {
        value: "ngn-10-000-000-ngn-50-000-000",
        label: "₦10,000,000-₦50,000,000",
      },
      { value: "ngn-50-000-000-plus", label: "₦50,000,000+" },
      { value: "i-m-not-sure", label: "I'm not sure" },
    ],
  },
  {
    kind: "single",
    id: "current-referrals",
    prompt: "What percentage of your new customers come from referrals?",
    area: SQUARES[8],
    options: [
      { value: "less-than-10-pct", label: "Less than 10%" },
      { value: "10-25-pct", label: "10-25%" },
      { value: "25-50-pct", label: "25-50%" },
      { value: "50-75-pct", label: "50-75%" },
      { value: "75-pct-plus", label: "75%+" },
      { value: "i-m-not-sure", label: "I'm not sure" },
    ],
  },
  {
    kind: "single",
    id: "referral-process",
    prompt:
      "Do you have a formal process for requesting referrals from satisfied customers?",
    area: SQUARES[8],
    options: [
      { value: "yes-systematic-process", label: "Yes, systematic process" },
      { value: "sometimes-ask-informally", label: "Sometimes ask informally" },
      { value: "rarely-ask-for-referrals", label: "Rarely ask for referrals" },
      { value: "never-ask-for-referrals", label: "Never ask for referrals" },
    ],
  },
  {
    kind: "multi",
    id: "referral-incentives",
    prompt: "What could you offer as referral incentives?",
    area: SQUARES[8],
    options: [
      {
        value: "monetary-reward-commission",
        label: "Monetary reward/commission",
      },
      {
        value: "discount-on-future-purchases",
        label: "Discount on future purchases",
      },
      { value: "free-product-or-service", label: "Free product or service" },
      { value: "gift-cards-or-prizes", label: "Gift cards or prizes" },
      {
        value: "exclusive-access-or-perks",
        label: "Exclusive access or perks",
      },
      {
        value: "recognition-or-public-thanks",
        label: "Recognition or public thanks",
      },
      { value: "reciprocal-referrals", label: "Reciprocal referrals" },
      { value: "donation-to-charity", label: "Donation to charity" },
      { value: "nothing-formal", label: "Nothing formal" },
      { value: "other", label: "Other" },
    ],
    min: 1,
    max: 10,
  },
  {
    kind: "text",
    id: "customer-advocacy",
    prompt: "How could your happiest customers help promote your business?",
    area: SQUARES[8],
    input: "text",
    maxLength: LONG_TEXT_MAX,
    placeholder:
      "Examples: testimonials, case studies, reviews, social media posts, speaking opportunities...",
    multiline: true,
  },
];
