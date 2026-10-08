import { describe, expect, it } from "vitest";
import { listPeople, readIdentifier, setIdentifier } from "../src/lib/people.ts";
import { listWorkplaces, readAccountReference, updateWorkplace } from "../src/lib/workplaces.ts";
import { ENGINEER_ADMIN, FOUNDER, NEW_HIRE, OPS, as, auditEntries, freshDb } from "./helpers.ts";

describe("account references and identifiers", () => {
  it("stores only the last four characters of a workplace account reference", () => {
    const db = freshDb();
    updateWorkplace(as(db, OPS), "US-MN", { registration_status: "registered", account_reference: "4471-0093-82" });
    expect(db.prepare("SELECT account_ref_last4, status_set_on FROM workplaces WHERE location = 'US-MN'").get()).toEqual({
      account_ref_last4: "9382",
      status_set_on: "2026-09-30",
    });
    expect(listWorkplaces(as(db, FOUNDER)).find((w) => w.location === "US-MN")).toMatchObject({
      has_account_reference: 1,
    });
    expect(listWorkplaces(as(db, FOUNDER))[0]).not.toHaveProperty("account_ref_last4");
  });

  it("stores only the last four characters of a person's identifier", () => {
    const db = freshDb();
    expect(setIdentifier(as(db, OPS), NEW_HIRE, { identifier: "123-45-6789" })).toEqual({ last4: "6789" });
    expect(db.prepare("SELECT identifier_last4 FROM people WHERE id = ?").get(NEW_HIRE)).toEqual({ identifier_last4: "6789" });
    expect(() => setIdentifier(as(db, OPS), NEW_HIRE, { identifier: "12" })).toThrow(/four characters/);
  });

  it("refuses a longer value written straight to the store", () => {
    const db = freshDb();
    expect(() => db.prepare("UPDATE people SET identifier_last4 = '123456789' WHERE id = 'p-031'").run()).toThrow(/CHECK/);
    expect(() => db.prepare("UPDATE workplaces SET account_ref_last4 = '447100' WHERE location = 'US-MN'").run()).toThrow(/CHECK/);
  });

  it("lets only ops read or set them", () => {
    const db = freshDb();
    for (const id of [FOUNDER, ENGINEER_ADMIN]) {
      expect(() => readAccountReference(as(db, id), "US-OR")).toThrow(/cannot/);
      expect(() => readIdentifier(as(db, id), "p-020")).toThrow(/cannot/);
      expect(() => setIdentifier(as(db, id), "p-030", { identifier: "123-45-6789" })).toThrow(/cannot/);
      expect(() => updateWorkplace(as(db, id), "US-MN", { registration_status: "registered" })).toThrow(/cannot/);
    }
    expect(listPeople(as(db, FOUNDER))[0]).not.toHaveProperty("identifier_last4");
  });

  it("keeps them from monthly-close", () => {
    const db = freshDb();
    expect(() => readAccountReference(as(db, "monthly-close"), "US-OR")).toThrow(/only runs the monthly lists/);
    expect(() => readIdentifier(as(db, "monthly-close"), "p-020")).toThrow(/only runs the monthly lists/);
  });

  it("writes an audit entry naming the reader on every read", () => {
    const db = freshDb();
    const before = auditEntries(db, "account_reference.read", "US-OR").length;
    expect(readAccountReference(as(db, OPS), "US-OR").last4).toMatch(/^\d{4}$/);
    expect(auditEntries(db, "account_reference.read", "US-OR").slice(before)).toEqual([{ actor: OPS }]);

    const identifierReads = auditEntries(db, "identifier.read", "p-020").length;
    readIdentifier(as(db, OPS), "p-020");
    expect(auditEntries(db, "identifier.read", "p-020").slice(identifierReads)).toEqual([{ actor: OPS }]);
  });
});
