import { describe, expect, it } from "vitest";
import { approveOffer, createOffer, sendOffer, signOffer } from "../src/lib/hiring.ts";
import { addAgreement } from "../src/lib/contractors.ts";
import { completeStep, createPerson, listOnboarding } from "../src/lib/people.ts";
import { listWorkplaces } from "../src/lib/workplaces.ts";
import { ENGINEER_ADMIN, FOUNDER, NEW_HIRE, OPS, STAFF, as, auditEntries, freshDb } from "./helpers.ts";

describe("people", () => {
  it("creates a person from a signed offer once ops confirms the start", () => {
    const db = freshDb();
    signOffer(as(db, OPS), 16, { signed_on: "2026-09-30" });
    const person = createPerson(as(db, OPS), { offer_id: 16, start_date: "2026-10-19", email: "brianna@ostranderlabs.com" });
    expect(person).toMatchObject({
      id: "p-032", name: "Brianna Coffey", role: "staff", worker_type: "employee", location: "US-TX",
      manager_id: "p-007", offer_id: 16, start_date: "2026-10-19",
    });
    const steps = listOnboarding(as(db, OPS)).filter((s) => s.person_id === "p-032");
    expect(steps.map((s) => s.step)).toContain("I-9 section 2 completed");
    expect(steps.find((s) => s.step === "Laptop shipped")).toMatchObject({ owner_id: ENGINEER_ADMIN, due_on: "2026-10-14" });
    expect(db.prepare("SELECT status FROM openings WHERE id = 15").get()).toEqual({ status: "filled" });
    expect(auditEntries(db, "person.created", "p-032")).toEqual([{ actor: OPS }]);
  });

  it("refuses a person from an offer that is not signed", () => {
    const db = freshDb();
    const input = { start_date: "2026-10-26", email: "someone@ostranderlabs.com" };
    expect(() => createPerson(as(db, OPS), { ...input, offer_id: 18 })).toThrow(/is sent/);
    expect(() => createPerson(as(db, OPS), { ...input, offer_id: 17 })).toThrow(/is draft/);
    expect(() => createPerson(as(db, OPS), { ...input, offer_id: 5 })).toThrow(/is declined/);
  });

  it("refuses a start date before the signed date", () => {
    const db = freshDb();
    signOffer(as(db, OPS), 18, { signed_on: "2026-09-30", start_date: "2026-10-26" });
    expect(() =>
      createPerson(as(db, OPS), { offer_id: 18, start_date: "2026-09-29", email: "priyanka@ostranderlabs.com" }),
    ).toThrow(/before the signed date 2026-09-30/);
  });

  it("refuses a second person for the same offer, and anyone but ops creating one", () => {
    const db = freshDb();
    expect(() =>
      createPerson(as(db, OPS), { offer_id: 1, start_date: "2025-11-17", email: "elliot2@ostranderlabs.com" }),
    ).toThrow(/already has a person/);
    expect(() =>
      createPerson(as(db, FOUNDER), { offer_id: 1, start_date: "2025-11-17", email: "elliot2@ostranderlabs.com" }),
    ).toThrow(/founder role/);
  });

  it("adds a workplace row with no deadline for the first hire in a new state", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: 26, location: "US-AZ", pay_amount: 95000, pay_currency: "USD", start_date: "2026-11-09",
    });
    approveOffer(as(db, FOUNDER), offer.id, { decision: "approved" });
    sendOffer(as(db, OPS), offer.id);
    signOffer(as(db, OPS), offer.id, { signed_on: "2026-09-30" });
    createPerson(as(db, OPS), { offer_id: offer.id, start_date: "2026-11-09", email: "yusuf@ostranderlabs.com" });
    expect(listWorkplaces(as(db, OPS)).find((w) => w.location === "US-AZ")).toMatchObject({
      first_hire_date: "2026-11-09",
      registration_status: "not_started",
      registration_deadline: null,
      entered_by: OPS,
    });
  });

  it("adds a not_required workplace for the first hire in a new country, and takes their agreement from ops", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: 31, location: "MX", pay_amount: 3900, pay_currency: "USD", start_date: "2026-11-02",
    });
    approveOffer(as(db, FOUNDER), offer.id, { decision: "approved" });
    sendOffer(as(db, OPS), offer.id);
    signOffer(as(db, OPS), offer.id, { signed_on: "2026-09-30" });
    const person = createPerson(as(db, OPS), { offer_id: offer.id, start_date: "2026-11-02", email: "lucia@ostranderlabs.com" });
    expect(person.token).toMatch(/^[0-9a-f]{32}$/);
    expect(listWorkplaces(as(db, OPS)).find((w) => w.location === "MX")).toMatchObject({
      registration_status: "not_required",
      registration_deadline: null,
    });
    const agreement = {
      rate: 3900, currency: "USD", invoice_day: 2, document_ref: "contracts/2026-11/benitez-lucia.pdf", starts_on: "2026-11-02",
    };
    expect(() => addAgreement(as(db, FOUNDER), { ...agreement, person_id: String(person.id) })).toThrow(/founder role/);
    expect(() => addAgreement(as(db, OPS), { ...agreement, person_id: STAFF })).toThrow(/is an employee/);
    expect(addAgreement(as(db, OPS), { ...agreement, person_id: String(person.id) })).toMatchObject({ country: "MX" });
  });

  it("lets a step's owner or ops mark it done, once", () => {
    const db = freshDb();
    const checkIn = listOnboarding(as(db, NEW_HIRE)).find((s) => s.step === "30-day check-in" && !s.done_on)!;
    const withholding = listOnboarding(as(db, OPS)).find(
      (s) => s.person_id === "p-027" && s.step === "State withholding form received" && !s.done_on,
    )!;
    expect(() => completeStep(as(db, STAFF), Number(checkIn.id), { done_on: "2026-09-30" })).toThrow(/owner/);
    expect(completeStep(as(db, "p-005"), Number(checkIn.id), { done_on: "2026-09-30" }).done_on).toBe("2026-09-30");
    expect(completeStep(as(db, OPS), Number(withholding.id), { done_on: "2026-09-30" }).done_on).toBe("2026-09-30");
    expect(() => completeStep(as(db, OPS), Number(withholding.id), { done_on: "2026-09-30" })).toThrow(/was done/);
  });
});
