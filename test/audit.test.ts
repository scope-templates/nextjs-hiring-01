import { describe, expect, it } from "vitest";
import { listAudit } from "../src/lib/actors.ts";
import { addAgreement, enterInvoice, markInvoicePaid } from "../src/lib/contractors.ts";
import type { Db } from "../src/lib/db.ts";
import {
  addCandidate,
  approveOffer,
  closeOffer,
  createOffer,
  sendOffer,
  signOffer,
} from "../src/lib/hiring.ts";
import { completeStep, createPerson, setIdentifier } from "../src/lib/people.ts";
import { updateWorkplace } from "../src/lib/workplaces.ts";
import { ENGINEER_ADMIN, FOUNDER, OPS, STAFF, as, freshDb } from "./helpers.ts";

const insert = "INSERT INTO audit_log (at, actor, action, entity, entity_id) VALUES ('2026-09-30T15:00:00.000Z', ?, 'x', 'y', 'z')";

describe("audit log", () => {
  it("is append-only", () => {
    const db = freshDb();
    expect(() => db.prepare("UPDATE audit_log SET actor = 'p-001' WHERE id = 1").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_log WHERE id = 1").run()).toThrow(/append-only/);
    expect(() => db.prepare("DELETE FROM audit_log").run()).toThrow(/append-only/);
  });

  it("refuses an insert that would replace an existing entry", () => {
    const db = freshDb();
    const first = db.prepare("SELECT * FROM audit_log WHERE id = 1").get();
    expect(() =>
      db
        .prepare(
          "INSERT OR REPLACE INTO audit_log (id, at, actor, action, entity, entity_id) VALUES (1, '2026-09-30T15:00:00.000Z', 'p-003', 'x', 'y', 'z')",
        )
        .run(),
    ).toThrow(/append-only/);
    expect(() =>
      db
        .prepare(
          "INSERT INTO audit_log (id, at, actor, action, entity, entity_id) VALUES (1, '2026-09-30T15:00:00.000Z', 'p-003', 'x', 'y', 'z') ON CONFLICT (id) DO UPDATE SET actor = 'p-001'",
        )
        .run(),
    ).toThrow(/append-only/);
    expect(db.prepare("SELECT * FROM audit_log WHERE id = 1").get()).toEqual(first);
  });

  it("takes an entry only when its actor is a person or a system actor", () => {
    const db = freshDb();
    expect(() => db.prepare(insert).run("someone")).toThrow(/person or a system actor/);
    expect(() => db.prepare(insert).run(null)).toThrow();
    db.prepare(insert).run("p-003");
    db.prepare(insert).run("monthly-close");
  });

  it("names a known actor on every seeded entry", () => {
    const db = freshDb();
    const unknown = db
      .prepare(
        `SELECT count(*) AS n FROM audit_log
         WHERE actor NOT IN (SELECT id FROM people) AND actor NOT IN (SELECT name FROM system_actors)`,
      )
      .get();
    expect(unknown).toEqual({ n: 0 });
    expect(db.prepare("SELECT name, role FROM system_actors").all()).toEqual([{ name: "monthly-close", role: "ops" }]);
  });

  it("is readable by founders, ops and engineer-admin", () => {
    const db = freshDb();
    expect(listAudit(as(db, ENGINEER_ADMIN), "workplace", "US-MN").map((e) => e.action)).toEqual([
      "account_reference.read",
      "workplace.updated",
      "workplace.updated",
      "workplace.created",
    ]);
    expect(() => listAudit(as(db, STAFF))).toThrow(/staff role/);
  });
});

describe("audited writes", () => {
  const unpaidInvoice = (db: Db) =>
    (db.prepare("SELECT id FROM contractor_invoices WHERE person_id = 'p-015' AND month = '2026-08'").get() as {
      id: number;
    }).id;
  const openStep = (db: Db) =>
    (db.prepare("SELECT id FROM onboarding_steps WHERE person_id = 'p-031' AND done_on IS NULL").get() as {
      id: number;
    }).id;

  const cases: [action: string, actor: string, write: (db: Db) => string | number][] = [
    ["invoice.paid", OPS, (db) => {
      const id = unpaidInvoice(db);
      markInvoicePaid(as(db, OPS), id, { paid_on: "2026-09-30" });
      return id;
    }],
    ["invoice.entered", OPS, (db) =>
      enterInvoice(as(db, OPS), {
        person_id: "p-019", month: "2026-08", amount: 9800, currency: "CAD", received_on: "2026-09-30",
      }).id as number],
    ["candidate.added", "p-007", (db) =>
      addCandidate(as(db, "p-007"), { opening_id: 15, name: "Mara Quist", email: "mara.quist@example.com" }).id as number],
    ["offer.created", OPS, (db) =>
      createOffer(as(db, OPS), {
        candidate_id: 29, location: "US-TX", pay_amount: 98000, pay_currency: "USD", start_date: "2026-11-02",
      }).id],
    ["approval.approved", FOUNDER, (db) => {
      approveOffer(as(db, FOUNDER), 17, { decision: "approved" });
      return 17;
    }],
    ["approval.declined", FOUNDER, (db) => {
      approveOffer(as(db, FOUNDER), 17, { decision: "declined" });
      return 17;
    }],
    ["offer.sent", OPS, (db) => {
      approveOffer(as(db, FOUNDER), 17, { decision: "approved" });
      return sendOffer(as(db, OPS), 17).id;
    }],
    ["offer.signed", OPS, (db) => signOffer(as(db, OPS), 16, { signed_on: "2026-09-30" }).id],
    ["offer.declined", OPS, (db) => closeOffer(as(db, OPS), 16, "declined").id],
    ["offer.withdrawn", FOUNDER, (db) => closeOffer(as(db, FOUNDER), 17, "withdrawn").id],
    ["person.created", OPS, (db) => {
      signOffer(as(db, OPS), 16, { signed_on: "2026-09-30" });
      return createPerson(as(db, OPS), { offer_id: 16, start_date: "2026-10-19", email: "brianna@ostranderlabs.com" })
        .id as string;
    }],
    ["identifier.set", OPS, (db) => {
      setIdentifier(as(db, OPS), "p-030", { identifier: "123-45-6789" });
      return "p-030";
    }],
    ["workplace.updated", OPS, (db) => {
      updateWorkplace(as(db, OPS), "US-MN", { registration_status: "registered" });
      return "US-MN";
    }],
    ["agreement.created", OPS, (db) =>
      addAgreement(as(db, OPS), {
        person_id: "p-014", rate: 6600, currency: "EUR", invoice_day: 1, document_ref: "contracts/2026-10/carvalho-ines.pdf",
        starts_on: "2026-10-01",
      }).id as number],
    ["onboarding.done", "p-005", (db) => {
      const id = openStep(db);
      completeStep(as(db, "p-005"), id, { done_on: "2026-09-30" });
      return id;
    }],
  ];

  it.each(cases)("records %s naming %s", (action, actor, write) => {
    const db = freshDb();
    const before = db.prepare("SELECT max(id) AS id FROM audit_log").get() as { id: number };
    const entityId = String(write(db));
    const added = db
      .prepare("SELECT actor FROM audit_log WHERE id > ? AND action = ? AND entity_id = ?")
      .all(before.id, action, entityId);
    expect(added).toEqual([{ actor }]);
  });
});

describe("audited actors", () => {
  it("cannot be deleted or renamed while the audit log names them", () => {
    const db = freshDb();
    expect(() => db.prepare("DELETE FROM system_actors WHERE name = 'monthly-close'").run()).toThrow(/names this system actor/);
    expect(() => db.prepare("UPDATE system_actors SET name = 'close' WHERE name = 'monthly-close'").run()).toThrow(
      /names this system actor/,
    );
    db.pragma("foreign_keys = OFF");
    expect(() => db.prepare("DELETE FROM people WHERE id = 'p-003'").run()).toThrow(/names this person/);
    expect(() => db.prepare("UPDATE people SET id = 'p-903' WHERE id = 'p-003'").run()).toThrow(/names this person/);
  });
});
