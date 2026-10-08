import { Refusal } from "@/lib/actors.ts";
import { invoiceGaps, listAgreements } from "@/lib/contractors.ts";
import { pageCtx } from "@/lib/http.ts";
import { SignInFirst, Table, money, orRefusal } from "../table.tsx";

export default async function ContractorsPage() {
  const ctx = await pageCtx();
  if (!ctx) return <SignInFirst />;
  const agreements = orRefusal(() => listAgreements(ctx));
  if (agreements instanceof Refusal) return <p>{agreements.message}</p>;
  return (
    <main>
      <h1>Contractors</h1>
      <Table
        rows={agreements}
        columns={[
          ["person_name", "Contractor"],
          ["country", "Country"],
          ["rate", "Monthly rate", (a) => money(a.rate, a.currency)],
          ["invoice_day", "Invoice day"],
          ["starts_on", "Starts"],
          ["ends_on", "Ends"],
          ["document_ref", "Agreement"],
        ]}
      />
      <h2>Open invoice months as of {ctx.today}</h2>
      <Table
        rows={invoiceGaps(ctx, ctx.today)}
        columns={[
          ["month", "Month"],
          ["person_name", "Contractor"],
          ["gap", "State", (g) => (g.gap === "no_invoice" ? `no invoice received (due ${g.due_on})` : "unpaid")],
          ["received_on", "Received"],
        ]}
      />
    </main>
  );
}
