import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { enterInvoice, invoiceGaps, markInvoicePaid } from "../src/lib/contractors.ts";
import { openDb } from "../src/lib/db.ts";
import { approveOffer, createOffer, sendOffer, signOffer } from "../src/lib/hiring.ts";
import { createPerson } from "../src/lib/people.ts";
import { overdueRegistrations, updateWorkplace } from "../src/lib/workplaces.ts";
import { FOUNDER, OPS, STAFF, as, freshDb } from "./helpers.ts";

const CLOSE = "monthly-close";

describe("registrations list", () => {
  it("lists workplaces whose deadline has passed without a completed status", () => {
    const db = freshDb();
    expect(overdueRegistrations(as(db, CLOSE), "2026-09-30")).toEqual([
      {
        location: "US-MN",
        first_hire_date: "2026-09-08",
        registration_status: "in_progress",
        registration_deadline: "2026-09-14",
        status_set_on: "2026-09-22",
        days_past: 16,
      },
    ]);
    expect(overdueRegistrations(as(db, OPS), "2026-09-14")).toEqual([]);
  });

  it("judges each status as of the date asked for", () => {
    const db = freshDb();
    expect(overdueRegistrations(as(db, CLOSE), "2025-12-10").map((r) => r.location)).toEqual(["US-OR"]);
    expect(overdueRegistrations(as(db, CLOSE), "2025-12-20")).toEqual([]);
  });

  it("judges each deadline from the day it was set", () => {
    const db = freshDb();
    const shown = (asOf: string) =>
      overdueRegistrations(as(db, CLOSE), asOf).map((r) => [r.location, r.registration_deadline]);
    expect(shown("2025-11-13")).toEqual([["US-OR", null]]);
    expect(shown("2026-09-03")).toEqual([["US-MN", null]]);
    expect(shown("2026-09-05")).toEqual([]);
  });

  it("lists a new workplace with no deadline set until ops sets one", () => {
    const db = freshDb();
    const offer = createOffer(as(db, OPS), {
      candidate_id: 26, location: "US-AZ", pay_amount: 95000, pay_currency: "USD", start_date: "2026-11-09",
    });
    approveOffer(as(db, FOUNDER), offer.id, { decision: "approved" });
    sendOffer(as(db, OPS), offer.id);
    signOffer(as(db, OPS), offer.id, { signed_on: "2026-09-30" });
    createPerson(as(db, OPS), { offer_id: offer.id, start_date: "2026-11-09", email: "yusuf@ostranderlabs.com" });
    const listed = overdueRegistrations(as(db, OPS), "2026-09-30").map((r) => [r.location, r.registration_deadline]);
    expect(listed).toEqual([
      ["US-AZ", null],
      ["US-MN", "2026-09-14"],
    ]);
    updateWorkplace(as(db, OPS), "US-AZ", { registration_deadline: "2026-12-04" });
    expect(overdueRegistrations(as(db, OPS), "2026-09-30").map((r) => r.location)).toEqual(["US-MN"]);
  });

  it("drops a workplace once its registration is complete", () => {
    const db = freshDb();
    updateWorkplace(as(db, OPS), "US-MN", { registration_status: "registered" });
    expect(overdueRegistrations(as(db, OPS), "2026-09-30")).toEqual([]);
  });
});

describe("invoices list", () => {
  it("lists contractor months with no invoice received or none paid", () => {
    const db = freshDb();
    expect(invoiceGaps(as(db, CLOSE), "2026-09-30").map((g) => [g.person_id, g.month, g.gap])).toEqual([
      ["p-015", "2026-08", "unpaid"],
      ["p-019", "2026-08", "no_invoice"],
    ]);
  });

  it("judges received and paid dates as of the date asked for", () => {
    const db = freshDb();
    const april = invoiceGaps(as(db, CLOSE), "2026-04-10").map((g) => [g.person_id, g.month, g.gap]);
    expect(april).toContainEqual(["p-016", "2026-03", "unpaid"]);
    expect(april.filter(([, month]) => month < "2026-03")).toEqual([]);
    expect(invoiceGaps(as(db, CLOSE), "2026-03-31").map((g) => [g.person_id, g.month])).toContainEqual(["p-018", "2026-02"]);
    const january = invoiceGaps(as(db, CLOSE), "2026-01-02").map((g) => [g.person_id, g.month, g.gap]);
    expect(january).toContainEqual(["p-019", "2025-12", "no_invoice"]);
  });

  it("counts a month once its invoice day has come, and stops at an agreement's end", () => {
    const db = freshDb();
    const september = invoiceGaps(as(db, OPS), "2026-10-08").filter((g) => g.month === "2026-09");
    expect(september.map((g) => g.person_id)).toEqual(["p-014", "p-015", "p-016", "p-018", "p-019", "p-022", "p-026", "p-029"]);
    expect(invoiceGaps(as(db, OPS), "2026-10-02").filter((g) => g.month === "2026-09").map((g) => g.person_id)).toEqual([
      "p-014", "p-018", "p-019", "p-026",
    ]);
  });

  it("is read by founders, ops and monthly-close only", () => {
    const db = freshDb();
    expect(() => invoiceGaps(as(db, STAFF), "2026-09-30")).toThrow(/staff role/);
    expect(() => overdueRegistrations(as(db, "p-005"), "2026-09-30")).toThrow(/hiring-manager role/);
  });

  it("drops a month once its invoice is entered and paid", () => {
    const db = freshDb();
    const invoice = enterInvoice(as(db, OPS), {
      person_id: "p-019", month: "2026-08", amount: 9800, currency: "CAD", received_on: "2026-09-30",
    });
    expect(invoice).toMatchObject({ entered_on: "2026-09-30", entered_by: OPS, paid_on: null });
    expect(invoiceGaps(as(db, OPS), "2026-09-30").map((g) => [g.person_id, g.gap])).toEqual([
      ["p-015", "unpaid"],
      ["p-019", "unpaid"],
    ]);
    markInvoicePaid(as(db, OPS), Number(invoice.id), { paid_on: "2026-09-30" });
    expect(invoiceGaps(as(db, OPS), "2026-09-30").map((g) => g.person_id)).toEqual(["p-015"]);
  });

  it("refuses a second invoice, another currency, no agreement, a payment before receipt, or a non-ops writer", () => {
    const db = freshDb();
    const base = { person_id: "p-016", month: "2026-08", amount: 26000, currency: "PLN", received_on: "2026-09-01" };
    expect(() => enterInvoice(as(db, OPS), base)).toThrow(/already entered/);
    expect(() => enterInvoice(as(db, OPS), { ...base, month: "2026-09", currency: "EUR" })).toThrow(/PLN/);
    expect(() => enterInvoice(as(db, FOUNDER), { ...base, month: "2026-09" })).toThrow(/founder role/);
    const unpaid = db.prepare("SELECT id FROM contractor_invoices WHERE person_id = 'p-015' AND month = '2026-08'").get() as {
      id: number;
    };
    expect(() => markInvoicePaid(as(db, FOUNDER), unpaid.id, { paid_on: "2026-09-10" })).toThrow(/founder role/);
    expect(() => markInvoicePaid(as(db, OPS), unpaid.id, { paid_on: "2026-09-01" })).toThrow(/received on/);
    markInvoicePaid(as(db, OPS), unpaid.id, { paid_on: "2026-09-10" });
    expect(() => markInvoicePaid(as(db, OPS), unpaid.id, { paid_on: "2026-09-11" })).toThrow(/was paid on/);
    db.prepare("DELETE FROM contractor_agreements WHERE person_id = 'p-029'").run();
    expect(() => enterInvoice(as(db, OPS), { ...base, person_id: "p-029", month: "2026-09" })).toThrow(/No agreement/);
  });
});

describe("monthly scripts", () => {
  function run(script: string, asOf: string) {
    const folder = mkdtempSync(join(tmpdir(), "hiring-"));
    const file = join(folder, "hiring.db");
    try {
      const output = execFileSync(process.execPath, ["--import", "tsx", script, "--as-of", asOf], {
        env: { ...process.env, HIRING_DB: file },
        encoding: "utf8",
      });
      const db = openDb(file);
      const entry = db.prepare("SELECT actor, entity_id, detail FROM audit_log ORDER BY id DESC LIMIT 1").get();
      db.close();
      return { output, entry };
    } finally {
      rmSync(folder, { recursive: true, force: true });
    }
  }

  it("prints the registrations list and records the run as monthly-close", () => {
    const { output, entry } = run("scripts/registrations.ts", "2025-12-10");
    expect(output).toContain("US-OR  deadline 2025-12-05 (5 days past)  status registered on 2025-12-19");
    expect(entry).toEqual({ actor: CLOSE, entity_id: "registrations", detail: "as of 2025-12-10" });
  });

  it("prints no deadline set for a deadline set after the as-of date", () => {
    const { output } = run("scripts/registrations.ts", "2026-09-03");
    expect(output).toContain("US-MN  no deadline set  status in_progress on 2026-09-22");
  });

  it("prints the invoices list and records the run as monthly-close", () => {
    const { output, entry } = run("scripts/invoices.ts", "2026-04-10");
    expect(output).toMatch(/2026-03 {2}p-016 Katarzyna Wilk +received 2026-04-01, unpaid/);
    expect(entry).toEqual({ actor: CLOSE, entity_id: "invoices", detail: "as of 2026-04-10" });
  });
});
