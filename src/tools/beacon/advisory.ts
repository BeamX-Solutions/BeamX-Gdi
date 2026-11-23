/**
 * Beacon's rule based advisory (spec 0010), shared with Beacon Pro (#11). A port of
 * `build_structured_advisory` and its helpers in beamx-scorecard `main.py` that builds
 * typed sections instead of a markdown string. `advisory-markdown.ts` turns them back
 * into the original markdown, and the parity test proves it byte for byte (AC-6).
 *
 * Pure: scores and two answers in, sections out.
 */
import { z } from "zod";
import type { Answers } from "../_contract";
import { weakestFirst, type Band, type CategoryKey } from "./categories";
import type { Category, CoreScores } from "./scoring";

// ---------------------------------------------------------------------------
// Types and schema
// ---------------------------------------------------------------------------

/** Every text field's limit (a paragraph with a lead may have empty text). */
export const TEXT_MAX = 2000;

const text = z.string().min(1).max(TEXT_MAX);
const tight = z.literal(true).optional();

const lineSchema = z.object({ lead: text.optional(), text });

export type Line = z.infer<typeof lineSchema>;

export const partSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("paragraph"),
      tight,
      lead: text.optional(),
      text: z.string().max(TEXT_MAX),
    })
    .refine((p) => p.lead !== undefined || p.text.length > 0, {
      message: "A paragraph without a lead needs text.",
      path: ["text"],
    }),
  z.object({ kind: z.literal("note"), tight, text }),
  z.object({ kind: z.literal("label"), tight, text }),
  z.object({ kind: z.literal("subheading"), tight, text }),
  z.object({
    kind: z.literal("bullets"),
    tight,
    items: z.array(lineSchema).min(1),
  }),
  z.object({
    kind: z.literal("numbered"),
    tight,
    items: z.array(lineSchema).min(1),
  }),
  z.object({ kind: z.literal("rule"), tight }),
  z.object({
    kind: z.literal("link"),
    tight,
    text,
    url: z
      .string()
      .max(TEXT_MAX)
      .refine((u) => u.startsWith("https://"), "Links must be https."),
  }),
]);

export type Part = z.infer<typeof partSchema>;

const sectionSchema = z.object({
  heading: text,
  parts: z.array(partSchema).min(1).max(30),
});

export type Section = z.infer<typeof sectionSchema>;

export const advisorySchema = z.object({
  sections: z.array(sectionSchema).min(1).max(12),
});

export type Advisory = z.infer<typeof advisorySchema>;

// ---------------------------------------------------------------------------
// Part helpers
// ---------------------------------------------------------------------------

/** Joined to the previous part by one newline, as the original does. */
const close = <P extends Part>(part: P): P => ({ ...part, tight: true });

const para = (body: string, lead?: string): Part =>
  lead === undefined
    ? { kind: "paragraph", text: body }
    : { kind: "paragraph", lead, text: body };
const note = (body: string): Part => ({ kind: "note", text: body });
const label = (body: string): Part => ({ kind: "label", text: body });
const sub = (body: string): Part => ({ kind: "subheading", text: body });
const ln = (lead: string, body: string): Line => ({ lead, text: body });
const li = (body: string): Line => ({ text: body });
const bullets = (...items: Line[]): Part => ({ kind: "bullets", items });
const numbered = (...items: Line[]): Part => ({ kind: "numbered", items });
const RULE: Part = { kind: "rule" };

/** A label followed straight away by its list or paragraph. */
const block = (title: string, next: Part): readonly Part[] => [
  label(title),
  close(next),
];

/** The booking link (#16 replaces it with the real booking flow). */
export const BOOKING_URL = "https://calendly.com/beamxsolutions";
export const BOOKING_TEXT = "Book a free 30-minute strategy call";

/** Python's `f"{x}"` for the one decimal floats the original prints. */
const fmt = (x: number): string => x.toFixed(1);

/** The original's readiness level, with its emoji (the advisory keeps it). */
const levels: Readonly<Record<Band, string>> = {
  scale_ready: "🏆 Scale-Ready",
  stable_foundation: "💪 Stable Foundation",
  building_blocks: "🔨 Building Blocks",
  survival_mode: "⚠️ Survival Mode",
  red_alert: "🚨 Red Alert",
};

const gradePct = (c: Category): string => `${c.grade} (${fmt(c.percentage)}%)`;

// ---------------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------------

const executiveSummary = (s: CoreScores): Section => {
  const level = levels[s.band];
  const total = fmt(s.total);
  const { financial_health: fh, customer_strength: cs } = s.categories;
  const body = ((): readonly Part[] => {
    switch (s.band) {
      case "scale_ready":
        return [
          para(
            `Congratulations! Your business demonstrates strong fundamentals across all key dimensions. You've built a sustainable operation with ${fh.grade}-grade financial health, ${cs.grade}-grade customer relationships, and the operational systems to support growth.`,
          ),
          para(
            "You're ready for strategic expansion—whether that's new locations, product lines, strategic partnerships, or accessing growth capital. Your focus should shift from survival to optimization and scale.",
            "What this means:",
          ),
        ];
      case "stable_foundation":
        return [
          para(
            `You've built a solid, working business with stable operations and clear revenue. Your ${fmt(fh.percentage)}% financial health score and ${fmt(cs.percentage)}% customer strength indicate a sustainable foundation. However, there are specific areas that, if strengthened, will unlock significant growth potential.`,
          ),
          para(
            `You're not in crisis, but you're also not yet optimized for scale. Strategic improvements in 2-3 key areas could move you from "stable" to "thriving" within 6-12 months.`,
            "What this means:",
          ),
        ];
      case "building_blocks":
        return [
          para(
            `Your business is operational and generating revenue, but showing fragility in critical areas. With a ${total}/100 overall score, you're functioning but not yet positioned for sustainable growth.`,
          ),
          para(
            `You need focused attention on shoring up weaknesses before pursuing aggressive growth. Think "strengthen the foundation" before "build the second floor."`,
            "What this means:",
          ),
        ];
      case "survival_mode":
        return [
          para(
            `Your assessment reveals critical gaps that are likely causing significant daily stress. With a ${total}/100 score, your business is functioning but facing serious sustainability challenges.`,
          ),
          para(
            "You're in triage mode. This is not about growth right now—it's about stabilizing operations, fixing cash flow, and creating breathing room.",
            "What this means:",
          ),
        ];
      case "red_alert":
        return [
          para(
            `This assessment reveals urgent challenges that require immediate attention. With a ${total}/100 score, your business is facing existential risks. However, honest diagnosis is the first step toward recovery.`,
          ),
          para(
            "You need rapid, decisive action in the next 30-60 days. Every recommendation below is prioritized for immediate cash preservation and triage.",
            "What this means:",
          ),
        ];
      default: {
        const unreachable: never = s.band;
        return unreachable;
      }
    }
  })();
  return {
    heading: "Executive Summary",
    parts: [
      para(level, "Your Business:"),
      ...body,
      para(`${total}/100`, "Overall Score:"),
    ],
  };
};

const flagContent: Readonly<Record<string, readonly Part[]>> = {
  CASH_CRISIS: block(
    "CASH FLOW EMERGENCY",
    bullets(
      li(
        "You're burning cash or don't know your position—both are existential threats",
      ),
      ln(
        "Immediate:",
        "Create a simple daily cash tracker (cash in vs. cash out)",
      ),
      ln(
        "This week:",
        "Identify your 3 biggest cash drains and cut/defer at least one",
      ),
      ln("This month:", "Implement weekly cash flow forecasting"),
    ),
  ),
  RUNWAY_CRITICAL: block(
    "RUNWAY EXTENSION REQUIRED",
    bullets(
      li(
        "Less than 30 days of cash runway means you're one bad week from closure",
      ),
      ln("Immediate:", "List every receivable and chase payment this week"),
      ln(
        "Emergency:",
        "Negotiate payment terms with suppliers, defer non-essential expenses",
      ),
      ln(
        "Revenue injection:",
        "Flash sale, prepay discounts, or close pending deals faster",
      ),
    ),
  ),
  NO_PROFIT_VISIBILITY: block(
    "PROFIT BLINDNESS",
    bullets(
      li(
        "You can't manage what you don't measure—unknown margins = random outcomes",
      ),
      ln(
        "This week:",
        "Calculate gross profit on your top 3 products/services",
      ),
      ln("This month:", "Build a simple P&L (revenue - all costs = profit)"),
      ln("Ongoing:", "Track monthly profitability, not just revenue"),
    ),
  ),
  FOUNDER_BURNOUT_RISK: block(
    "FOUNDER DEPENDENCY CRISIS",
    bullets(
      li("If you can't miss a day, you don't own a business—you own a job"),
      ln(
        "This month:",
        "Document your daily tasks and delegate/eliminate at least 3",
      ),
      ln(
        "Strategic:",
        "Identify the ONE task only you can do, systematize everything else",
      ),
    ),
  ),
  INFORMAL_OPERATIONS: block(
    "FORMALIZATION GAP",
    bullets(
      li(
        "Operating informally locks you out of credit, partnerships, and major contracts",
      ),
      ln("This month:", "Register your business (CAC, BN, or equivalent)"),
      ln(
        "Follow-up:",
        "Get a tax ID and open a dedicated business bank account",
      ),
    ),
  ),
  NO_CUSTOMER_LOYALTY: block(
    "RETENTION CRISIS",
    bullets(
      li(
        "Less than 10% repeat rate means you're constantly refilling a leaky bucket",
      ),
      ln(
        "Immediate:",
        "Survey your last 20 customers—why did they buy? Would they return?",
      ),
      ln(
        "This month:",
        "Implement ONE retention tactic (follow-up calls, loyalty rewards, check-ins)",
      ),
    ),
  ),
};

/** Top 3 flags shown, plus a note when there are more. */
const criticalPriorities = (s: CoreScores): Section => {
  const priorities = s.flags.critical.flatMap((flag) => {
    const content = flagContent[flag];
    return content ? [content] : [];
  });
  return {
    heading: "🚨 Critical Priorities (Next 30 Days)",
    parts: [
      note(
        "These issues require immediate attention and could threaten business viability if left unaddressed.",
      ),
      ...priorities.slice(0, 3).flat(),
      ...(priorities.length > 3
        ? [
            note(
              `Note: You have ${priorities.length} critical issues flagged. Top 3 shown above.`,
            ),
          ]
        : []),
    ],
  };
};

const categoryRecommendation = (
  key: CategoryKey,
  c: Category,
): readonly Part[] => {
  const pct = fmt(c.percentage);
  const plan = (
    title: string,
    situation: string,
    steps: readonly [string, string, string, string],
    quickWin: string,
    metric: string,
  ): readonly Part[] => [
    sub(`${title} (Current: ${c.grade})`),
    para(`${pct}% score ${situation}`, "Your situation:"),
    ...block(
      "90-Day Action Plan:",
      bullets(
        ln("Week 1-2:", steps[0]),
        ln("Week 3-4:", steps[1]),
        ln("Month 2:", steps[2]),
        ln("Month 3:", steps[3]),
      ),
    ),
    para(quickWin, "Quick Win:"),
    para(metric, "Metric to Track:"),
  ];
  switch (key) {
    case "financial_health":
      return plan(
        "Strengthen Financial Health",
        "indicates cash flow, profitability, or visibility gaps.",
        [
          "Set up basic cash flow tracking (daily cash in/out)",
          "Calculate true profit margin on your top offerings",
          "Build a 30-day cash buffer by cutting non-essentials and accelerating collections",
          "Implement a weekly P&L review habit",
        ],
        "Identify and eliminate your single biggest cash leak this month.",
        "Days of cash runway (target: 90+ days)",
      );
    case "customer_strength":
      return plan(
        "Build Customer Strength",
        "suggests weak retention, expensive acquisition, or a commoditized offering.",
        [
          "Contact your best 10 customers—understand why they stay and what would make them leave",
          "Implement ONE retention mechanism (loyalty program, follow-up system, VIP treatment)",
          "Test a 10% price increase on new customers only",
          "Create a referral incentive program",
        ],
        "Send a personal thank-you to your top 20 customers this week. Ask for referrals.",
        "% repeat customer revenue (target: 50%+)",
      );
    case "operational_maturity":
      return plan(
        "Systematize Operations",
        "indicates founder dependency and weak processes.",
        [
          "Time-track your week—identify tasks only you can do vs. tasks anyone could do",
          "Document your top 3 repetitive processes (even bullet points work)",
          "Delegate or eliminate at least 5 hours/week of non-essential tasks",
          "Train one person to handle a key process without your involvement",
        ],
        "Record a 5-minute voice note explaining one recurring task. Use it to delegate next week.",
        "Days business can run without you (target: 7+ days)",
      );
    case "financial_intelligence":
      return plan(
        "Sharpen Financial Intelligence",
        "means you lack visibility into what actually drives profit.",
        [
          "List all major expenses and their % of revenue",
          "Calculate gross margin on each product/service you offer",
          "Identify your highest-margin offering and push it harder",
          "Eliminate or fix your lowest-margin offering",
        ],
        "This week, calculate (Revenue - All Costs) ÷ Revenue = Your Profit Margin. If below 15%, you have a pricing or cost problem.",
        "Gross profit margin by product line (target: know all margins)",
      );
    case "growth_resilience":
      return plan(
        "Build Growth & Resilience",
        "suggests concentration risk or a declining trajectory.",
        [
          "Analyze revenue sources—how dependent are you on 1-2 customers or products?",
          "Identify one new customer segment or revenue stream to test",
          "Pilot the new offering with 5-10 customers",
          "Evaluate and either double down or pivot",
        ],
        "If one customer represents >25% of revenue, reach out to 10 prospects in a different segment this month.",
        "Revenue concentration (target: no single customer >20% of revenue)",
      );
    default: {
      const unreachable: never = key;
      return unreachable;
    }
  }
};

/** By the `primary_pain_point` slug. */
const painPointRecommendation = (
  s: CoreScores,
  painPoint: string,
): readonly Part[] => {
  const c = s.categories;
  switch (painPoint) {
    case "getting-more-customers-sales":
      return [
        sub("Tactical Growth Plan"),
        ...block(
          "Root cause from your scores:",
          bullets(
            li(`Customer Strength: ${gradePct(c.customer_strength)}`),
            li(`Financial Intelligence: ${gradePct(c.financial_intelligence)}`),
          ),
        ),
        ...block(
          "Recommended sequence:",
          numbered(
            ln(
              "Fix retention before acquisition",
              "— if <50% repeat rate, you're filling a leaky bucket",
            ),
            ln(
              "Leverage existing customers:",
              'Ask top 20 for referrals, build testimonials, run a "bring a friend" promotion',
            ),
            ln(
              "Test low-cost channels first:",
              "Partnerships, local community, organic social proof",
            ),
            ln("Only then", "consider paid acquisition"),
          ),
        ),
        note(
          "Retention is 5-10x cheaper than acquisition. Fix the foundation first.",
        ),
      ];
    case "managing-cash-flow-getting-paid":
      return [
        sub("Cash Flow Rescue Plan"),
        ...block(
          "Current situation:",
          bullets(li(`Financial Health: ${gradePct(c.financial_health)}`)),
        ),
        ...block(
          "Immediate actions (this week):",
          numbered(
            li(
              "Call every customer with outstanding invoices >15 days — offer 5% discount for immediate payment",
            ),
            li("Negotiate longer payment terms with your top suppliers"),
            li("Audit last month's expenses — cut the bottom 20%"),
          ),
        ),
        ...block(
          "30-60 day fixes:",
          bullets(
            li("Require 30-50% deposits before starting any work"),
            li("Move to weekly invoicing instead of monthly"),
            li("Implement late payment penalties in all new contracts"),
          ),
        ),
        note(
          "Cash is oxygen. You can survive without profit temporarily — not without cash.",
        ),
      ];
    case "hiring-or-managing-staff":
      return [
        sub("Team Management Fix"),
        ...block(
          "Context from assessment:",
          bullets(
            li(`Operational Maturity: ${gradePct(c.operational_maturity)}`),
          ),
        ),
        para(
          "Staff problems are almost always systems problems, not people problems.",
          "Diagnosis:",
        ),
        ...block(
          "Solution framework:",
          numbered(
            li(
              'Before hiring more: Document what "good" looks like for each role and set clear KPIs',
            ),
            li(
              "For existing team issues: Weekly 15-min 1-on-1s — diagnose if the issue is skills (train), will (motivate), or fit (part ways)",
            ),
            li(
              "Reduce founder dependency: Train a second-in-command, batch your check-ins instead of constant monitoring",
            ),
          ),
        ),
        note(
          "If you're working 60+ hours but staff are working 30-40, you have a delegation problem, not a staffing problem.",
        ),
      ];
    case "keeping-costs-under-control":
      return [
        sub("Cost Optimization Plan"),
        ...block(
          "Current situation:",
          bullets(
            li(`Financial Intelligence: ${gradePct(c.financial_intelligence)}`),
          ),
        ),
        ...block(
          "The 80/20 audit (this week):",
          numbered(
            li("List every expense from last month"),
            li(
              "Categorize: Essential (can't operate without) / Important (would hurt to lose) / Nice-to-have (comfort, not survival)",
            ),
            li('Cut 20% from the "nice-to-have" category immediately'),
          ),
        ),
        para(
          "Renegotiate your top 3 expenses (rent, suppliers, staff structure), track cost per unit/transaction, stop doing things where cost exceeds revenue.",
          "Deeper fixes (30-60 days):",
        ),
        note(
          "Cutting costs is not the goal — improving profit margin is. Sometimes spending more in the right area increases overall profit.",
        ),
      ];
    case "too-busy-overwhelmed":
      return [
        sub("Founder Liberation Plan"),
        ...block(
          "Root cause:",
          bullets(
            li(`Operational Maturity: ${gradePct(c.operational_maturity)}`),
            li(
              "You're likely doing low-value tasks when you should focus on high-leverage ones",
            ),
          ),
        ),
        ...block(
          "The Stop, Delegate, Systemize Framework:",
          bullets(
            ln(
              "Week 1 — STOP:",
              "Tasks that don't directly generate revenue or that someone else could do 80% as well",
            ),
            ln(
              "Week 2-3 — DELEGATE:",
              "Bring in a VA or part-timer for admin, train a team member on routine customer issues",
            ),
            ln(
              "Week 4+ — SYSTEMIZE:",
              "Simple SOPs (even voice notes), batch similar tasks, set firm off-hours boundaries",
            ),
          ),
        ),
        para(
          "You work ON the business (strategy, key deals) — not IN it (daily operations).",
          "Target state:",
        ),
      ];
    case "inconsistent-quality-delivery":
      return [
        sub("Quality Control System"),
        ...block(
          "Root cause:",
          bullets(
            li(`Operational Maturity: ${gradePct(c.operational_maturity)}`),
          ),
        ),
        ...block(
          "Fix in 4 steps:",
          numbered(
            ln(
              'DEFINE "good":',
              "Write down what success looks like for each key process — even 10 bullet points",
            ),
            ln(
              "CREATE checklists:",
              "Every recurring task gets a checklist; staff check off each step before marking complete",
            ),
            ln(
              "INSPECT:",
              "Random quality checks (unannounced), review customer complaints weekly for patterns",
            ),
            ln(
              "REWARD consistency:",
              "Tie bonuses to quality metrics, not just sales volume",
            ),
          ),
        ),
        note(
          "Inconsistency kills trust. Trust is the foundation of repeat business.",
        ),
      ];
    case "dont-know-where-to-focus":
      return [
        sub("Strategic Clarity Framework"),
        ...block(
          "Your assessment gives you the answer. Priority ranking (fix in this order):",
          bullets(
            li(`Financial Health: ${gradePct(c.financial_health)}`),
            li(`Customer Strength: ${gradePct(c.customer_strength)}`),
            li(`Operational Maturity: ${gradePct(c.operational_maturity)}`),
            li(`Financial Intelligence: ${gradePct(c.financial_intelligence)}`),
            li(`Growth & Resilience: ${gradePct(c.growth_resilience)}`),
          ),
        ),
        ...block(
          "Daily decision rule:",
          bullets(
            li("If cash flow is negative → focus ONLY on cash first"),
            li("If cash flow is stable → work on your lowest-scoring category"),
            li("If growing fast → fix systems before you break"),
          ),
        ),
        note(
          "Trying to fix everything at once fixes nothing. Pick ONE thing, execute for 30 days, then reassess.",
        ),
      ];
    case "competition-market-changes":
      return [
        sub("Competitive Response Plan"),
        ...block(
          "Strategic position:",
          bullets(li(`Customer Strength: ${gradePct(c.customer_strength)}`)),
        ),
        para(
          "Competition is usually a symptom. The disease is commoditized offering, weak customer relationships, or competing on price alone.",
          "Reality check:",
        ),
        ...block(
          "3-Part Strategy:",
          numbered(
            ln(
              "DIFFERENTIATE:",
              "What can you do that competitors can't or won't? (Faster delivery, better service, expertise, guarantees)",
            ),
            ln(
              "DEEPEN loyalty:",
              "Make it expensive — emotionally and logistically — for customers to switch",
            ),
            ln(
              "DOMINATE a niche:",
              "Better to own 80% of a small market than 2% of a large one",
            ),
          ),
        ),
        note(
          "If you raised prices 15% tomorrow and would lose most customers, you're commoditized. Fix that before worrying about competition.",
        ),
      ];
    case "actually-doing-well-want-to-optimize":
      return [
        sub("Optimization Playbook"),
        para(`${fmt(s.total)}/100 — ${levels[s.band]}`, "Current performance:"),
        ...block(
          "Optimization priorities (in order):",
          numbered(
            ln(
              "Margin expansion:",
              "Push highest-margin offerings harder, eliminate lowest-margin ones, test 5-10% price increases on new customers",
            ),
            ln(
              "Customer lifetime value:",
              "Increase purchase frequency (subscriptions, memberships), upsell/cross-sell to existing base",
            ),
            ln(
              "Operational leverage:",
              "Document and delegate to free 10+ hours/week, reinvest that time into strategy",
            ),
            ln(
              "Strategic positioning:",
              "Build a board of advisors, explore alliances and partnership opportunities",
            ),
          ),
        ),
      ];
    default:
      return [];
  }
};

/** Only 6 of the 12 industries have an insight, as in the original. By slug. */
const industryInsights: Readonly<Record<string, readonly Part[]>> = {
  "retail-trade": [
    sub("Industry Insight: Retail/Trade"),
    para(
      "Inventory turnover = (Cost of Goods Sold) ÷ (Average Inventory Value). Target: 4-12x/year. Dead inventory is dead cash — discount and move it.",
      "Key metric:",
    ),
    para(
      "Customer experience and location are your moats. Invest in staff training and store presentation.",
      "Competitive edge:",
    ),
  ],
  "food-and-beverage": [
    sub("Industry Insight: Food & Beverage"),
    para(
      "Food cost % (target: 28-35%), Labor cost % (target: 25-35%), Table turnover rate.",
      "Key metrics:",
    ),
    para(
      "Track waste religiously — spoilage kills margins. Use menu engineering to push high-margin items. Consider delivery or catering to diversify revenue.",
      "Survival tactics:",
    ),
    para(
      "Consistency and word-of-mouth. One bad experience can cost you 10 customers.",
      "Competitive edge:",
    ),
  ],
  "professional-services": [
    sub("Industry Insight: Professional Services"),
    para(
      "Utilization rate — target 60-75% of time on billable work. Below that and you're over-delivering on admin. Above and you're likely burning out.",
      "Key metric:",
    ),
    para(
      "Value-based pricing beats hourly rates. Package your services (productize). Raise prices 10-15% annually for existing clients.",
      "Pricing strategy:",
    ),
    para(
      "Expertise and documented results. Build case studies and thought leadership content.",
      "Competitive edge:",
    ),
  ],
  "logistics-and-transportation": [
    sub("Industry Insight: Logistics & Transportation"),
    para(
      "Load/trip utilization, cost per km/mile, on-time delivery rate.",
      "Key metrics:",
    ),
    para(
      "Backhaul revenue (return trips shouldn't be empty), route optimization (fuel is your #2 cost after labor), preventive maintenance (breakdowns kill margins).",
      "Profit levers:",
    ),
    para(
      "Reliability and speed. In logistics, trust trumps price.",
      "Competitive edge:",
    ),
  ],
  "beauty-and-personal-care": [
    sub("Industry Insight: Beauty & Personal Care"),
    para(
      "Rebooking rate (target: 60%+), retail-to-service revenue ratio, average spend per visit.",
      "Key metrics:",
    ),
    para(
      "Automated booking reminders, loyalty stamp cards, product retail upsells at checkout.",
      "Retention tactics:",
    ),
    para(
      "Relationship and results. Clients follow individual stylists and therapists, not brands.",
      "Competitive edge:",
    ),
  ],
  "manufacturing-production": [
    sub("Industry Insight: Manufacturing/Production"),
    para(
      "Production yield rate, cost per unit, equipment downtime %.",
      "Key metrics:",
    ),
    para(
      "Reduce waste through process standardization, negotiate bulk input pricing, explore contract manufacturing for others during low seasons.",
      "Profit levers:",
    ),
    para("Quality consistency and delivery reliability.", "Competitive edge:"),
  ],
};

const strategicRecommendations = (s: CoreScores, answers: Answers): Section => {
  const [first, second] = weakestFirst(s.categories);
  const painPoint = answers.primary_pain_point;
  const industry = answers.industry;
  return {
    heading: "Strategic Recommendations",
    parts: [
      note("Focus areas to strengthen your business over the next 90 days."),
      ...(first ? categoryRecommendation(first[0], first[1]) : []),
      ...(second && second[1].percentage < 60
        ? categoryRecommendation(second[0], second[1])
        : []),
      ...painPointRecommendation(
        s,
        typeof painPoint === "string" ? painPoint : "",
      ),
      ...((typeof industry === "string"
        ? industryInsights[industry]
        : undefined) ?? []),
    ],
  };
};

const opportunityContent: Readonly<Record<string, readonly Part[]>> = {
  PRICING_POWER: [
    label("Pricing Power Advantage"),
    close(
      para(
        "You've demonstrated the ability to raise prices without losing customers. This is rare.",
      ),
    ),
    close(
      bullets(
        li("Test another 5-10% increase on new customers only"),
        li('Create a "premium tier" offering at 30-50% higher price point'),
        li(
          "An extra 5% margin on the same revenue can mean 25-50% more profit",
        ),
      ),
    ),
  ],
  STRONG_RETENTION: [
    label("Customer Loyalty Strength"),
    close(
      para(
        "70%+ repeat customers is exceptional — most businesses struggle to hit 40%.",
      ),
    ),
    close(
      bullets(
        li("Launch a formal referral program to monetize your advocates"),
        li("Create a VIP tier for top customers"),
        li(
          "Survey them to understand what keeps them loyal, then systematically do more of it",
        ),
      ),
    ),
  ],
  ORGANIC_GROWTH: [
    label("Organic Growth Engine"),
    close(
      para(
        "Referrals and word-of-mouth are your primary channel — the most sustainable and cost-effective one available.",
      ),
    ),
    close(
      bullets(
        li(
          "Systematize referrals: ask every happy customer for 2-3 introductions",
        ),
        li("Build strategic partnerships with complementary businesses"),
        li(
          "Amplify social proof through reviews, testimonials, and before/afters",
        ),
      ),
    ),
  ],
  SYSTEMS_READY: [
    label("Systems & Documentation"),
    close(
      para(
        "Comprehensive process documentation puts you ahead of 90% of SMEs at your stage.",
      ),
    ),
    close(
      bullets(
        li(
          "You're ready to scale — hire, franchise, or partner — without breaking the business",
        ),
        li("Use documentation to onboard new staff in days, not months"),
        li(
          "Documented businesses are worth 2-3x more in any acquisition or investment conversation",
        ),
      ),
    ),
  ],
  FINANCIAL_DISCIPLINE: [
    label("Financial Discipline"),
    close(
      para(
        "Strong financial management (80%+ score) is the foundation for everything else.",
      ),
    ),
    close(
      bullets(
        li(
          "You can confidently take calculated risks: new locations, products, or key hires",
        ),
        li(
          "Approach banks or investors for growth capital with credible, trackable financials",
        ),
        li(
          "Negotiate better terms with suppliers based on your track record of timely payment",
        ),
      ),
    ),
  ],
};

/** In the original's fixed order, whatever order the flags are in. */
const opportunityOrder = [
  "PRICING_POWER",
  "STRONG_RETENTION",
  "ORGANIC_GROWTH",
  "SYSTEMS_READY",
  "FINANCIAL_DISCIPLINE",
] as const;

const growthOpportunities = (s: CoreScores): Section => ({
  heading: "Growth Opportunities",
  parts: [
    note("You have specific advantages — here's how to maximize them:"),
    ...opportunityOrder
      .filter((flag) => s.flags.opportunities.includes(flag))
      .flatMap((flag) => opportunityContent[flag] ?? []),
  ],
});

const nextSteps = (s: CoreScores): Section => {
  const tier = s.total >= 70 ? "high" : s.total >= 50 ? "mid" : "low";
  const actions = {
    high: {
      steps: [
        "Schedule a 2-3 hour strategic planning session to map your 6-month roadmap",
        "Review your top opportunities from this assessment and pick ONE to execute",
        "Build or refine your financial dashboard — track the metrics that matter most",
      ],
      focus:
        "Your business is stable enough to think strategically. Pick ONE growth lever from the opportunities above and run a pilot test within 30 days.",
      helpLead: "For Stable & Scale-Ready Businesses:",
      help: "Strategic advisory for growth planning, advanced analytics, partnership and investor readiness preparation.",
      recommended: "Strategic Advisory Retainer or Growth Acceleration Package",
    },
    mid: {
      steps: [
        "Address your #1 critical priority (if flagged) before anything else",
        "Set up basic financial tracking — cash flow and P&L at minimum",
        "Choose ONE weakness to fix and commit to it for the next 30 days",
        "Schedule a 15-minute weekly progress check-in with yourself every Friday",
      ],
      focus:
        "Stabilize your weakest category. Don't chase growth until you've shored up the foundation. Consistency beats intensity.",
      helpLead: "For Building Businesses:",
      help: "Financial visibility, process systematization, marketing efficiency audits, team productivity frameworks.",
      recommended: "90-Day Business Transformation Program",
    },
    low: {
      steps: [
        "CASH FIRST — if you have <30 days runway, everything else waits",
        "Cut non-essentials to reduce burn by at least 20%",
        "Call every late-paying customer today",
        "Seek outside perspective — you need a fresh set of eyes to turn this around",
      ],
      focus:
        "Survival mode. Extend runway and stabilize operations. Stop the bleeding before any growth moves.",
      helpLead: "For Survival-Mode Businesses:",
      help: "Emergency cash flow rescue planning, rapid diagnostic consulting, margin analysis and quick-win identification.",
      recommended: "Business Rescue Intensive (4-week program)",
    },
  }[tier];
  return {
    heading: "Your Next Steps",
    parts: [
      sub("Immediate Actions (This Week):"),
      close(numbered(...actions.steps.map(li))),
      sub("30-Day Focus:"),
      close(para(actions.focus)),
      RULE,
      sub("How BeamX Can Help"),
      para(`Based on your ${levels[s.band]} assessment:`),
      para(actions.help, actions.helpLead),
      para(actions.recommended, "Recommended:"),
      { kind: "link", text: BOOKING_TEXT, url: BOOKING_URL },
    ],
  };
};

/**
 * The rule based advisory (spec 0010). Reads the scores plus the `industry` and
 * `primary_pain_point` answers (by slug).
 */
export const buildAdvisory = (s: CoreScores, answers: Answers): Advisory => ({
  sections: [
    executiveSummary(s),
    ...(s.flags.critical.length > 0 ? [criticalPriorities(s)] : []),
    strategicRecommendations(s, answers),
    ...(s.flags.opportunities.length > 0 ? [growthOpportunities(s)] : []),
    nextSteps(s),
  ],
});
