import { z } from "zod";

/**
 * Billing settings (spec 0004). Prices of tool runs live on each tool module; everything
 * else lives here. A change affects new holds only, never a hold already placed (AC-18).
 */
const packSchema = z.object({
  id: z.string().min(1),
  credits: z.int().positive(),
  /** Naira, VAT inclusive. Paystack is charged `priceNgn * 100` kobo. */
  priceNgn: z.int().positive(),
});

const billingConfigSchema = z.object({
  ngnPerCredit: z.int().positive(),
  grants: z.object({
    starter: z.int().nonnegative(),
    signup: z.int().nonnegative(),
    guestPerIpPerDay: z.int().nonnegative(),
  }),
  packs: z.array(packSchema).min(1),
  chat: z.object({
    freePerDay: z.object({
      account: z.int().nonnegative(),
      guest: z.int().nonnegative(),
    }),
    markup: z.number().positive(),
    ceilingCredits: z.int().positive(),
    usdToNgn: z.number().positive(),
    dayTimeZone: z.string().min(1),
  }),
  holdIdleDays: z.int().positive(),
  chatHoldStaleMinutes: z.int().positive(),
  expiry: z.object({
    inactiveMonths: z.int().positive(),
    warnDays: z.int().nonnegative(),
    enforce: z.boolean(),
  }),
  luna: z.object({ rate: z.int().positive() }),
});

export type BillingConfig = z.infer<typeof billingConfigSchema>;
export type Pack = z.infer<typeof packSchema>;

export const billingConfig: BillingConfig = billingConfigSchema.parse({
  ngnPerCredit: 100,
  grants: { starter: 30, signup: 150, guestPerIpPerDay: 3 },
  packs: [
    { id: "p100", credits: 100, priceNgn: 10_000 },
    { id: "p300", credits: 300, priceNgn: 27_000 },
    { id: "p1000", credits: 1000, priceNgn: 85_000 },
  ],
  chat: {
    freePerDay: { account: 10, guest: 5 },
    markup: 3,
    ceilingCredits: 3,
    usdToNgn: 1700,
    dayTimeZone: "Africa/Lagos",
  },
  holdIdleDays: 30,
  chatHoldStaleMinutes: 15,
  // Not enforced until the slice 5 email reminder ships (spec 0004, AC-15).
  expiry: { inactiveMonths: 12, warnDays: 30, enforce: false },
  luna: { rate: 10 },
});
