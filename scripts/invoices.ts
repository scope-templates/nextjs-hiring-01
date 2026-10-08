// Lists contractor months with no invoice received, or received and unpaid.
// Usage: npm run invoices [-- --as-of YYYY-MM-DD]
import { audit, loadActor } from "../src/lib/actors.ts";
import { invoiceGaps } from "../src/lib/contractors.ts";
import { openDb } from "../src/lib/db.ts";
import { isoDate } from "../src/lib/hiring.ts";

const flag = process.argv.indexOf("--as-of");
const asOf = isoDate.parse(flag > 0 ? process.argv[flag + 1] : new Date().toISOString().slice(0, 10));
const db = openDb(process.env.HIRING_DB ?? "hiring.db");
const ctx = { db, actor: loadActor(db, "monthly-close", asOf), today: asOf };

const gaps = invoiceGaps(ctx, asOf);
console.log(`Contractor invoice months open as of ${asOf}`);
for (const g of gaps) {
  const state =
    g.gap === "no_invoice" ? `no invoice received (due ${g.due_on})` : `received ${g.received_on}, unpaid`;
  console.log(`${g.month}  ${g.person_id} ${g.person_name.padEnd(20)} ${state}`);
}
console.log(`${gaps.length} contractor month${gaps.length === 1 ? "" : "s"}`);
audit(ctx, "report.run", "report", "invoices", `as of ${asOf}`);
