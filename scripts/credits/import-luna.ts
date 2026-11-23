/**
 * `pnpm credits:import-luna <csv> [--yes]` (spec 0004, AC-16): loads the Luna export
 * (`email,luna_credits`) into `luna_credit_import` at `luna.rate` workspace credits per
 * Luna credit. All or nothing: any bad line is reported and nothing is imported. An email
 * already imported is skipped, never changed. Each balance is granted once, as
 * `luna_import`, when a verified user with that email signs up or next uses credits.
 * Points at whatever DATABASE_URL is set (`.env` by default).
 */
import { readFile } from "node:fs/promises";
import { billingConfig } from "@/billing/config";
import { parseLunaCsv } from "@/billing/money-ops";
import * as credits from "@/db/queries/credits";
import { confirm } from "./confirm";

const main = async (): Promise<number> => {
  const argv = process.argv.slice(2);
  const yes = argv.includes("--yes") || argv.includes("-y");
  const files = argv.filter((a) => !a.startsWith("-"));
  const [file] = files;
  if (file === undefined || files.length !== 1) {
    console.error("usage: pnpm credits:import-luna <csv> [--yes]");
    return 2;
  }
  const parsed = parseLunaCsv(
    await readFile(file, "utf8"),
    billingConfig.luna.rate,
  );
  if (!parsed.ok) {
    console.error(`Nothing imported. ${parsed.error.length} invalid line(s):`);
    for (const p of parsed.error)
      console.error(`  line ${p.line}: ${p.reason}`);
    return 1;
  }
  const rows = parsed.value;
  const total = rows.reduce((sum, r) => sum + r.credits, 0);
  console.log(
    `${rows.length} row(s), ${total} workspace credits in all (x${billingConfig.luna.rate}).`,
  );
  if (!yes && !(await confirm("Import them?"))) {
    console.log("Cancelled, nothing imported.");
    return 1;
  }
  const { imported, skipped } = await credits.importLunaCredits(rows);
  console.log(`Imported ${imported}, skipped ${skipped} (already imported).`);
  return 0;
};

main().then(
  (code) => process.exit(code),
  (e: unknown) => {
    console.error(e);
    process.exit(1);
  },
);
