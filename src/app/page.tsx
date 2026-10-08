import { pageCtx } from "@/lib/http.ts";

export default async function Home() {
  const ctx = await pageCtx();
  return (
    <main>
      <h1>Hiring Board</h1>
      <p>
        Openings, offers and approvals; new hires and their onboarding checklists; the states and countries we employ
        people in; contractor agreements and monthly invoices.
      </p>
      {ctx ? (
        <p>
          You are {ctx.actor.name} ({ctx.actor.role}).
        </p>
      ) : (
        <form method="post" action="/api/session">
          <label>
            Your token <input type="password" name="token" autoComplete="current-password" required />
          </label>{" "}
          <button type="submit">Sign in</button>
        </form>
      )}
    </main>
  );
}
