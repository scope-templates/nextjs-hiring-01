import { Refusal } from "@/lib/actors.ts";
import { listOffers } from "@/lib/hiring.ts";
import { pageCtx } from "@/lib/http.ts";
import { SignInFirst, Table, money, orRefusal } from "../table.tsx";

export default async function OffersPage() {
  const ctx = await pageCtx();
  if (!ctx) return <SignInFirst />;
  const offers = orRefusal(() => listOffers(ctx));
  return (
    <main>
      <h1>Offers</h1>
      {offers instanceof Refusal ? (
        <p>{offers.message}</p>
      ) : (
        <Table
          rows={offers}
          columns={[
            ["id", "#"],
            ["role", "Role"],
            ["team", "Team"],
            ["level", "Level"],
            ["location", "Location"],
            ["worker_type", "Type"],
            ["pay", "Pay", (o) => money(o.pay_amount, o.pay_currency)],
            ["status", "Status"],
            ["sent_on", "Sent"],
            ["signed_on", "Signed"],
            ["start_date", "Start"],
          ]}
        />
      )}
    </main>
  );
}
