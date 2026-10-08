import { describe, expect, it } from "vitest";
import { POST as offerAction } from "../src/app/api/offers/[id]/[action]/route.ts";
import { GET as getOffers, POST as postOffer } from "../src/app/api/offers/route.ts";
import { GET as getSession, POST as postSession } from "../src/app/api/session/route.ts";
import { GET as getAccountReference } from "../src/app/api/workplaces/[location]/account-reference/route.ts";
import { getDb } from "../src/lib/db.ts";

function tokenOf(id: string): string {
  return (getDb().prepare("SELECT token FROM people WHERE id = ?").get(id) as { token: string }).token;
}

function call(path: string, as?: string, body?: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://localhost${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      ...(as ? { authorization: `Bearer ${tokenOf(as)}` } : {}),
      "content-type": "application/json",
      ...headers,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function signIn(token: string): Request {
  return new Request("http://localhost/api/session", { method: "POST", body: new URLSearchParams({ token }) });
}

const params = <T>(value: T) => ({ params: Promise.resolve(value) });

describe("HTTP routes", () => {
  it("answers 401 with a reason code for a missing, wrong or departed token", async () => {
    const missing = await getOffers(call("/api/offers"));
    expect(missing.status).toBe(401);
    expect(await missing.json()).toMatchObject({ error: "no_token" });
    const wrong = await getOffers(call("/api/offers", undefined, undefined, { authorization: "Bearer p-003" }));
    expect(await wrong.json()).toMatchObject({ error: "bad_token" });
    const malformed = await getOffers(
      call("/api/offers", undefined, undefined, {
        authorization: `Token ${tokenOf("p-003")}`,
        cookie: `session=${tokenOf("p-003")}`,
      }),
    );
    expect(malformed.status).toBe(401);
    expect(await malformed.json()).toMatchObject({ error: "bad_token" });
    const departed = await getOffers(call("/api/offers", "p-017"));
    expect(await departed.json()).toMatchObject({ error: "actor_left" });
  });

  it("signs in with a token and reads the session cookie", async () => {
    const refused = await postSession(signIn("monthly-close"));
    expect(refused.status).toBe(401);
    expect(await refused.json()).toMatchObject({ error: "bad_token" });

    const signedIn = await postSession(signIn(tokenOf("p-008")));
    expect(signedIn.status).toBe(303);
    const cookie = signedIn.headers.get("set-cookie")!.split(";")[0];
    expect(cookie).toBe(`session=${tokenOf("p-008")}`);
    const session = await getSession(call("/api/session", undefined, undefined, { cookie: `theme=dark; ${cookie}` }));
    expect(await session.json()).toMatchObject({ id: "p-008", role: "staff", kind: "person" });
  });

  it("serves a hiring manager's offers without pay", async () => {
    const response = await getOffers(call("/api/offers", "p-007"));
    const offers = (await response.json()) as Record<string, unknown>[];
    expect(offers.map((o) => o.id)).toEqual([2, 7, 14, 16]);
    expect(offers.some((o) => "pay_amount" in o)).toBe(false);
  });

  it("answers refusals with their reason code", async () => {
    const send = await offerAction(
      new Request("http://localhost/api/offers/17/send", {
        method: "POST",
        headers: { authorization: `Bearer ${tokenOf("p-003")}` },
      }),
      params({ id: "17", action: "send" }),
    );
    expect(send.status).toBe(409);
    expect(await send.json()).toMatchObject({ error: "approval_required" });

    const approve = await offerAction(
      call("/api/offers/17/approve", "p-002", { decision: "approved" }),
      params({ id: "17", action: "approve" }),
    );
    expect(await approve.json()).toMatchObject({ error: "own_opening" });

    const unknown = await offerAction(call("/api/offers/17/ship", "p-003", {}), params({ id: "17", action: "ship" }));
    expect(unknown.status).toBe(404);

    const invalid = await postOffer(call("/api/offers", "p-003", { candidate_id: "x" }));
    expect(invalid.status).toBe(422);
    expect(await invalid.json()).toMatchObject({ error: "invalid" });
  });

  it("serves an account reference to ops only and logs the read", async () => {
    const forbidden = await getAccountReference(
      call("/api/workplaces/US-OR/account-reference", "p-001"),
      params({ location: "US-OR" }),
    );
    expect(forbidden.status).toBe(403);
    const allowed = await getAccountReference(
      call("/api/workplaces/US-OR/account-reference", "p-003"),
      params({ location: "US-OR" }),
    );
    expect(await allowed.json()).toEqual({ last4: expect.stringMatching(/^\d{4}$/) });
    const last = getDb().prepare("SELECT actor, action, entity_id FROM audit_log ORDER BY id DESC LIMIT 1").get();
    expect(last).toEqual({ actor: "p-003", action: "account_reference.read", entity_id: "US-OR" });
  });
});
