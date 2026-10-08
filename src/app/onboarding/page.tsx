import { pageCtx } from "@/lib/http.ts";
import { listOnboarding } from "@/lib/people.ts";
import { SignInFirst, Table } from "../table.tsx";

export default async function OnboardingPage() {
  const ctx = await pageCtx();
  if (!ctx) return <SignInFirst />;
  return (
    <main>
      <h1>Onboarding</h1>
      <Table
        rows={listOnboarding(ctx)}
        columns={[
          ["person_name", "Person"],
          ["step", "Step"],
          ["owner_id", "Owner"],
          ["due_on", "Due"],
          ["done_on", "Done"],
        ]}
      />
    </main>
  );
}
