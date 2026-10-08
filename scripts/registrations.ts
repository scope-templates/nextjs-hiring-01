// Lists workplaces whose registration deadline has passed, or is not set, without a completed status.
// Usage: npm run registrations [-- --as-of YYYY-MM-DD]
import { audit, loadActor } from "../src/lib/actors.ts";
import { openDb } from "../src/lib/db.ts";
import { isoDate } from "../src/lib/hiring.ts";
import { overdueRegistrations } from "../src/lib/workplaces.ts";

const flag = process.argv.indexOf("--as-of");
const asOf = isoDate.parse(flag > 0 ? process.argv[flag + 1] : new Date().toISOString().slice(0, 10));
const db = openDb(process.env.HIRING_DB ?? "hiring.db");
const ctx = { db, actor: loadActor(db, "monthly-close", asOf), today: asOf };

const rows = overdueRegistrations(ctx, asOf);
console.log(`Registrations open as of ${asOf}`);
for (const r of rows) {
  const deadline = r.registration_deadline
    ? `deadline ${r.registration_deadline} (${r.days_past} days past)`
    : "no deadline set";
  const status = `${r.registration_status} ${r.status_set_on <= asOf ? "since" : "on"} ${r.status_set_on}`;
  console.log(`${r.location.padEnd(6)} ${deadline}  status ${status}  first hire ${r.first_hire_date}`);
}
console.log(`${rows.length} workplace${rows.length === 1 ? "" : "s"}`);
audit(ctx, "report.run", "report", "registrations", `as of ${asOf}`);
