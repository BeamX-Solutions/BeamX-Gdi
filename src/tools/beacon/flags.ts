/**
 * Plain labels for Beacon's flag codes (spec 0011, AC-12). Scores store the codes the
 * standalone uses (`CASH_CRISIS`); clients and the Pro prompt see these labels. A code
 * without a label falls back to its words in sentence case.
 */
const flagLabels: Readonly<Record<string, string>> = {
  CASH_CRISIS: "Cash crisis",
  RUNWAY_CRITICAL: "Less than a month of cash runway",
  NO_PROFIT_VISIBILITY: "No clear view of profit",
  FOUNDER_BURNOUT_RISK: "Founder burnout risk",
  INFORMAL_OPERATIONS: "Business not registered",
  NO_CUSTOMER_LOYALTY: "Few repeat customers",
  PRICING_POWER: "Pricing power",
  STRONG_RETENTION: "Strong customer retention",
  ORGANIC_GROWTH: "Organic growth through referrals and repeat business",
  SYSTEMS_READY: "Documented systems, ready to scale",
  FINANCIAL_DISCIPLINE: "Financial discipline",
};

export const flagLabel = (code: string): string => {
  const known = flagLabels[code];
  if (known !== undefined) return known;
  const words = code.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
};
