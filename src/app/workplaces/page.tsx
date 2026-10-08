import { Refusal } from "@/lib/actors.ts";
import { pageCtx } from "@/lib/http.ts";
import { listWorkplaces, overdueRegistrations } from "@/lib/workplaces.ts";
import { SignInFirst, Table, orRefusal } from "../table.tsx";

export default async function WorkplacesPage() {
  const ctx = await pageCtx();
  if (!ctx) return <SignInFirst />;
  const workplaces = orRefusal(() => listWorkplaces(ctx));
  if (workplaces instanceof Refusal) return <p>{workplaces.message}</p>;
  return (
    <main>
      <h1>Workplaces</h1>
      <Table
        rows={workplaces}
        columns={[
          ["location", "State or country"],
          ["first_hire_date", "First hire"],
          ["registration_status", "Registration"],
          ["registration_deadline", "Deadline"],
          ["status_set_on", "Status set"],
          ["has_account_reference", "Account ref", (w) => (w.has_account_reference ? "on file" : "")],
          ["entered_by", "Entered by"],
        ]}
      />
      <h2>Registrations open past their deadline, or with no deadline set, as of {ctx.today}</h2>
      <Table
        rows={overdueRegistrations(ctx, ctx.today)}
        columns={[
          ["location", "State or country"],
          ["registration_deadline", "Deadline", (w) => String(w.registration_deadline ?? "no deadline set")],
          ["days_past", "Days past"],
          ["registration_status", "Registration"],
        ]}
      />
    </main>
  );
}
