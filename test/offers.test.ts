import { describe, expect, it } from "vitest";
import {
  addCandidate,
  approvalReasons,
  approveOffer,
  closeOffer,
  createOffer,
  getOffer,
  sendOffer,
  signOffer,
} from "../src/lib/hiring.ts";
import { COFOUNDER, ENG_MANAGER, FOUNDER, OPS, SALES_MANAGER, as, freshDb } from "./helpers.ts";

const ERIN = 28; // candidate for opening 16, Senior Software Engineer, ENG-4, managed by p-002
const YUSUF = 26; // candidate for opening 15, Customer Success Manager, GTM-2, managed by p-007
const LAUREN = 29; // candidate for opening 15
const LUCIA = 31; // candidate for opening 17, Contract Support Specialist, managed by p-007

describe("offers and approvals", () => {
  it("sends an offer inside its band in an existing state without an approval", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: LAUREN, location: "US-TX", pay_amount: 98000, pay_currency: "USD", start_date: "2026-11-02",
    });
    expect(offer).toMatchObject({ status: "draft", band_id: "GTM-2", pay_period: "annual", created_by: OPS });
    expect(approvalReasons(db, offer)).toEqual([]);
    expect(sendOffer(as(db, OPS), offer.id)).toMatchObject({ status: "sent", sent_on: "2026-09-30" });
  });

  it("holds an offer above its band's ceiling until a founder approves it", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: ERIN, location: "US-NY", pay_amount: 230000, pay_currency: "USD", start_date: "2026-11-16",
    });
    expect(approvalReasons(db, offer)).toEqual(["above_band"]);
    expect(() => sendOffer(as(db, OPS), offer.id)).toThrow(/approve/);
    expect(approveOffer(as(db, FOUNDER), offer.id, { decision: "approved" })).toMatchObject({ reasons: "above_band" });
    expect(sendOffer(as(db, OPS), offer.id).status).toBe("sent");
  });

  it("holds an offer for a new state until a founder approves it", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: YUSUF, location: "US-AZ", pay_amount: 95000, pay_currency: "USD", start_date: "2026-11-09",
    });
    expect(approvalReasons(db, offer)).toEqual(["new_location"]);
    expect(() => sendOffer(as(db, OPS), offer.id)).toThrow(/new_location/);
    approveOffer(as(db, COFOUNDER), offer.id, { decision: "approved", note: "Arizona is fine." });
    expect(sendOffer(as(db, OPS), offer.id).status).toBe("sent");
  });

  it("keeps a declined offer from being sent", () => {
    const db = freshDb();
    approveOffer(as(db, FOUNDER), 17, { decision: "declined", note: "Over the band." });
    expect(() => sendOffer(as(db, OPS), 17)).toThrow(/approve/);
    expect(getOffer(as(db, OPS), 17).status).toBe("draft");
  });

  it("refuses an approval from the offer's creator, the opening's manager, or anyone but a founder", () => {
    const db = freshDb();
    const own = createOffer(as(db, FOUNDER), {
      candidate_id: ERIN, location: "US-WA", pay_amount: 200000, pay_currency: "USD", start_date: "2026-11-16",
    });
    expect(() => approveOffer(as(db, FOUNDER), own.id, { decision: "approved" })).toThrow(/created/);
    expect(() => approveOffer(as(db, COFOUNDER), 17, { decision: "approved" })).toThrow(/manage/);
    expect(() => approveOffer(as(db, OPS), 17, { decision: "approved" })).toThrow(/ops role/);
    expect(() => approveOffer(as(db, ENG_MANAGER), 17, { decision: "approved" })).toThrow(/hiring-manager role/);
    approveOffer(as(db, FOUNDER), 17, { decision: "approved" });
    expect(sendOffer(as(db, OPS), 17).status).toBe("sent");
  });

  it("refuses a start date before the signed date", () => {
    const db = freshDb();
    expect(() => signOffer(as(db, OPS), 16, { signed_on: "2026-10-01", start_date: "2026-09-28" })).toThrow(
      /before the signed date/,
    );
    expect(() => signOffer(as(db, OPS), 16, { signed_on: "2026-09-20" })).toThrow(/was sent on/);
    expect(signOffer(as(db, OPS), 16, { signed_on: "2026-09-30" })).toMatchObject({
      status: "signed", signed_on: "2026-09-30", start_date: "2026-10-19",
    });
  });

  it("refuses an employee offer outside a US state or in another currency", () => {
    const db = freshDb();
    const base = { candidate_id: LAUREN, pay_amount: 98000, pay_currency: "USD", start_date: "2026-11-02" };
    expect(() => createOffer(as(db, OPS), { ...base, location: "PT" })).toThrow(/US state/);
    expect(() => createOffer(as(db, OPS), { ...base, location: "US-TX", pay_currency: "EUR" })).toThrow(/USD/);
  });

  it("approves and sends only a draft", () => {
    const db = freshDb();
    expect(() => approveOffer(as(db, FOUNDER), 16, { decision: "approved" })).toThrow(/is sent/);
    expect(() => sendOffer(as(db, OPS), 16)).toThrow(/is sent/);
    expect(() => sendOffer(as(db, OPS), 2)).toThrow(/is signed/);
  });

  it("follows the latest founder decision", () => {
    const db = freshDb();
    approveOffer(as(db, FOUNDER), 17, { decision: "approved" });
    approveOffer(as(db, FOUNDER), 17, { decision: "declined", note: "Changed my mind on the band." });
    expect(() => sendOffer(as(db, OPS), 17)).toThrow(/approve/);
    approveOffer(as(db, FOUNDER), 17, { decision: "approved", note: "Fine after all." });
    expect(sendOffer(as(db, OPS), 17).status).toBe("sent");
  });

  it("refuses a contractor offer in the US", () => {
    const db = freshDb();
    const base = { candidate_id: LUCIA, pay_amount: 3900, pay_currency: "USD", start_date: "2026-11-02" };
    expect(() => createOffer(as(db, OPS), { ...base, location: "US" })).toThrow(/outside the US/);
    expect(() => createOffer(as(db, OPS), { ...base, location: "US-TX" })).toThrow(/outside the US/);
    expect(createOffer(as(db, OPS), { ...base, location: "MX" })).toMatchObject({ pay_period: "monthly", band_id: null });
  });

  it("lets only founders and ops draft an offer", () => {
    const db = freshDb();
    const input = { candidate_id: LAUREN, location: "US-TX", pay_amount: 98000, pay_currency: "USD", start_date: "2026-11-02" };
    expect(() => createOffer(as(db, "p-007"), input)).toThrow(/hiring-manager role/);
    expect(() => createOffer(as(db, "p-004"), input)).toThrow(/engineer-admin role/);
    expect(createOffer(as(db, FOUNDER), input).created_by).toBe(FOUNDER);
  });

  it("lets a hiring manager add candidates only to their own open openings", () => {
    const db = freshDb();
    const candidate = { name: "Mara Quist", email: "mara.quist@example.com" };
    expect(() => addCandidate(as(db, SALES_MANAGER), { ...candidate, opening_id: 15 })).toThrow(/their own openings/);
    expect(() => addCandidate(as(db, "p-007"), { ...candidate, opening_id: 2 })).toThrow(/is filled/);
    expect(addCandidate(as(db, "p-007"), { ...candidate, opening_id: 15 })).toMatchObject({ opening_id: 15, added_by: "p-007" });
  });

  it("closes offers only from a status they can leave", () => {
    const db = freshDb();
    expect(() => closeOffer(as(db, OPS), 17, "declined")).toThrow(/draft/);
    expect(closeOffer(as(db, OPS), 17, "withdrawn").status).toBe("withdrawn");
    expect(() => closeOffer(as(db, OPS), 2, "withdrawn")).toThrow(/signed/);
  });
});
