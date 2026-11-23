/**
 * `pnpm credits:adjust <email> <amount> --reason <text> --actor <email> [--yes]`
 * (spec 0004, AC-17): a staff grant or correction, written as one `adjustment` ledger
 * entry with its reason and actor. Shows the change and asks first. Refuses a change that
 * would leave the balance below what is held. Points at whatever DATABASE_URL is set
 * (`.env` by default): export the production URL only on purpose.
 */
import { billingConfig } from "@/billing/config";
import { parseAdjustArgs } from "@/billing/money-ops";
import * as credits from "@/db/queries/credits";
import { confirm } from "./confirm";

const main = async (): Promise<number> => {
  const args = parseAdjustArgs(process.argv.slice(2));
  if (!args.ok) {
    console.error(args.error);
    return 2;
  }
  const { email, amount, reason, actor, yes } = args.value;
  const userId = await credits.userIdByEmail(email);
  if (userId === null) {
    console.error("user_not_found: no user with that email");
    return 1;
  }
  const before = await credits.getSummary(userId);
  const opening =
    before === null
      ? `No credit account yet: one is opened first with the ${billingConfig.grants.starter} credit starter grant.\n`
      : "";
  const current = before ?? {
    balance: billingConfig.grants.starter,
    held: 0,
  };
  console.log(
    `${opening}User ${userId}: balance ${current.balance}, held ${current.held}.\n` +
      `Adjust by ${amount > 0 ? "+" : ""}${amount} to ${current.balance + amount}. Reason: "${reason}". Actor: ${actor}.`,
  );
  if (!yes && !(await confirm("Write this adjustment?"))) {
    console.log("Cancelled, nothing written.");
    return 1;
  }
  if (before === null)
    await credits.ensureAccount(userId, billingConfig.grants.starter);
  const result = await credits.adjust(userId, amount, reason, actor);
  if (!result.ok) {
    switch (result.error.code) {
      case "user_not_found":
        console.error("user_not_found: no credit account");
        return 1;
      case "would_go_below_held":
        console.error(
          `would_go_below_held: balance ${result.error.balance}, held ${result.error.held}. Nothing written.`,
        );
        return 1;
      default: {
        const unreachable: never = result.error;
        return unreachable;
      }
    }
  }
  console.log(
    `Done. Balance ${result.value.balance}, held ${result.value.held}.`,
  );
  return 0;
};

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
