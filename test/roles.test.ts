import { describe, expect, it } from "vitest";
import { Refusal } from "../src/lib/actors.ts";
import { invoiceGaps, listAgreements, listInvoices } from "../src/lib/contractors.ts";
import { getOffer, listCandidates, listOffers, listOpenings, listPayBands } from "../src/lib/hiring.ts";
import { listOnboarding, listPeople } from "../src/lib/people.ts";
import { listWorkplaces } from "../src/lib/workplaces.ts";
import {
  ENGINEER_ADMIN,
  ENG_MANAGER,
  FOUNDER,
  NEW_HIRE,
  OPS,
  SALES_MANAGER,
  STAFF,
  as,
  freshDb,
} from "./helpers.ts";

const PAY_KEYS = ["pay_amount", "pay_currency", "pay_period", "band_id"];

function refusalCode(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    if (error instanceof Refusal) return error.code;
    throw error;
  }
  return undefined;
}

describe("roles", () => {
  it("shows pay bands to founders and ops only", () => {
    const db = freshDb();
    expect(listPayBands(as(db, FOUNDER))).toHaveLength(8);
    expect(listPayBands(as(db, OPS))).toHaveLength(8);
    for (const id of [ENG_MANAGER, ENGINEER_ADMIN, STAFF]) {
      expect(refusalCode(() => listPayBands(as(db, id)))).toBe("forbidden");
    }
  });

  it("shows contractor rates and invoices to founders and ops only", () => {
    const db = freshDb();
    expect(listAgreements(as(db, FOUNDER))[0]).toHaveProperty("rate");
    expect(listInvoices(as(db, OPS), "2026-07").length).toBeGreaterThan(0);
    for (const id of [ENG_MANAGER, ENGINEER_ADMIN, STAFF]) {
      expect(refusalCode(() => listAgreements(as(db, id)))).toBe("forbidden");
      expect(refusalCode(() => listInvoices(as(db, id)))).toBe("forbidden");
    }
    expect(invoiceGaps(as(db, OPS), "2026-09-30")).toHaveLength(2);
  });

  it("shows founders and ops every offer with pay", () => {
    const db = freshDb();
    const offers = listOffers(as(db, OPS));
    expect(offers).toHaveLength(18);
    for (const key of PAY_KEYS) expect(offers[0]).toHaveProperty(key);
    expect(getOffer(as(db, FOUNDER), 4).approvals).toHaveLength(1);
  });

  it("shows a hiring manager the offers for their own openings, without pay", () => {
    const db = freshDb();
    const offers = listOffers(as(db, ENG_MANAGER));
    expect(offers.map((o) => o.id)).toEqual([3, 4, 8, 10, 11, 13, 15]);
    for (const offer of offers) for (const key of PAY_KEYS) expect(offer).not.toHaveProperty(key);
    expect(getOffer(as(db, ENG_MANAGER), 4)).not.toHaveProperty("pay_amount");
    expect(getOffer(as(db, ENG_MANAGER), 4)).not.toHaveProperty("approvals");
    expect(refusalCode(() => getOffer(as(db, ENG_MANAGER), 6))).toBe("forbidden");
  });

  it("shows a hiring manager their own openings and candidates", () => {
    const db = freshDb();
    const openings = listOpenings(as(db, SALES_MANAGER));
    expect(openings.map((o) => o.id)).toEqual([5, 14]);
    expect(openings[0]).not.toHaveProperty("band_id");
    const candidates = listCandidates(as(db, SALES_MANAGER));
    expect(new Set(candidates.map((c) => c.opening_id))).toEqual(new Set([5, 14]));
  });

  it("keeps offers and openings from engineer-admin and staff", () => {
    const db = freshDb();
    for (const id of [ENGINEER_ADMIN, STAFF]) {
      expect(refusalCode(() => listOffers(as(db, id)))).toBe("forbidden");
      expect(refusalCode(() => listOpenings(as(db, id)))).toBe("forbidden");
      expect(refusalCode(() => listWorkplaces(as(db, id)))).toBe("forbidden");
    }
  });

  it("shows staff their own checklist only", () => {
    const db = freshDb();
    const steps = listOnboarding(as(db, NEW_HIRE));
    expect(steps).toHaveLength(7);
    expect(new Set(steps.map((s) => s.person_id))).toEqual(new Set([NEW_HIRE]));
    expect(listOnboarding(as(db, STAFF))).toHaveLength(0);
    expect(refusalCode(() => listPeople(as(db, STAFF)))).toBe("forbidden");
  });

  it("shows engineer-admin every checklist and the people list without identifiers", () => {
    const db = freshDb();
    expect(listOnboarding(as(db, ENGINEER_ADMIN))).toHaveLength(78);
    const people = listPeople(as(db, ENGINEER_ADMIN));
    expect(people).toHaveLength(31);
    expect(people[0]).not.toHaveProperty("identifier_last4");
  });

  it("keeps monthly-close to the two monthly lists", () => {
    const db = freshDb();
    const close = as(db, "monthly-close");
    expect(close.actor).toMatchObject({ kind: "system", role: "ops" });
    for (const read of [listOffers, listPeople, listWorkplaces, listAgreements, listOnboarding, listPayBands]) {
      expect(refusalCode(() => read(close))).toBe("system_actor");
    }
    expect(refusalCode(() => listInvoices(close))).toBe("system_actor");
  });

  it("names an unknown actor as such", () => {
    const db = freshDb();
    expect(refusalCode(() => as(db, "p-999"))).toBe("unknown_actor");
  });

  it("shows a hiring manager their own checklist and the steps they own, and nothing else", () => {
    const db = freshDb();
    const steps = listOnboarding(as(db, ENG_MANAGER));
    expect(steps.length).toBeGreaterThan(0);
    for (const step of steps) expect(step.owner_id === ENG_MANAGER || step.person_id === ENG_MANAGER).toBe(true);
    expect(steps.some((s) => s.owner_id === OPS)).toBe(false);
  });

  it("refuses an actor who has left", () => {
    const db = freshDb();
    expect(refusalCode(() => as(db, "p-017"))).toBe("actor_left");
    expect(as(db, "p-017", "2026-05-31").actor.id).toBe("p-017");
  });
});
