import { z } from "zod";
import { type Ctx, Refusal, audit, requireListReader, requireRole } from "./actors.ts";
import type { Db, Row } from "./db.ts";
import { isoDate } from "./hiring.ts";

const month = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, "0")}`;
}

export function monthEnd(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

type Agreement = {
  id: number;
  person_id: string;
  rate: number;
  currency: string;
  invoice_day: number;
  starts_on: string;
  ends_on: string | null;
};

function contractor(db: Db, personId: string): { name: string; location: string } {
  const person = db.prepare("SELECT name, location, worker_type FROM people WHERE id = ?").get(personId) as
    | { name: string; location: string; worker_type: string }
    | undefined;
  if (!person) throw new Refusal(404, "not_found", `No person ${personId}`);
  if (person.worker_type !== "contractor") throw new Refusal(422, "not_contractor", `${person.name} is an employee`);
  return person;
}

function currentAgreement(db: Db, personId: string): Agreement | undefined {
  return db
    .prepare("SELECT * FROM contractor_agreements WHERE person_id = ? ORDER BY starts_on DESC LIMIT 1")
    .get(personId) as Agreement | undefined;
}

export function listAgreements(ctx: Ctx): Row[] {
  requireRole(ctx.actor, "founder", "ops");
  return ctx.db
    .prepare(
      `SELECT a.*, p.name AS person_name FROM contractor_agreements a JOIN people p ON p.id = a.person_id
       ORDER BY a.person_id`,
    )
    .all() as Row[];
}

export const AgreementInput = z.object({
  person_id: z.string(),
  rate: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  invoice_day: z.number().int().min(1).max(28),
  document_ref: z.string().trim().min(1),
  starts_on: isoDate,
});

export function addAgreement(ctx: Ctx, input: z.infer<typeof AgreementInput>): Row {
  requireRole(ctx.actor, "ops");
  const person = contractor(ctx.db, input.person_id);
  const { lastInsertRowid } = ctx.db
    .prepare(
      `INSERT INTO contractor_agreements
         (person_id, country, rate, currency, invoice_day, document_ref, starts_on, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.person_id,
      person.location,
      input.rate,
      input.currency,
      input.invoice_day,
      input.document_ref,
      input.starts_on,
      ctx.actor.id,
    );
  audit(ctx, "agreement.created", "contractor_agreement", Number(lastInsertRowid), input.person_id);
  return ctx.db.prepare("SELECT * FROM contractor_agreements WHERE id = ?").get(lastInsertRowid) as Row;
}

export function listInvoices(ctx: Ctx, forMonth?: string): Row[] {
  requireRole(ctx.actor, "founder", "ops");
  const select = `SELECT i.*, p.name AS person_name FROM contractor_invoices i JOIN people p ON p.id = i.person_id`;
  if (forMonth) {
    return ctx.db.prepare(`${select} WHERE i.month = ? ORDER BY i.person_id`).all(month.parse(forMonth)) as Row[];
  }
  return ctx.db.prepare(`${select} ORDER BY i.month DESC, i.person_id`).all() as Row[];
}

export const InvoiceInput = z.object({
  person_id: z.string(),
  month,
  amount: z.number().int().positive(),
  currency: z.string().regex(/^[A-Z]{3}$/),
  received_on: isoDate,
});

export function enterInvoice(ctx: Ctx, input: z.infer<typeof InvoiceInput>): Row {
  requireRole(ctx.actor, "ops");
  contractor(ctx.db, input.person_id);
  const agreement = currentAgreement(ctx.db, input.person_id);
  if (!agreement) throw new Refusal(409, "no_agreement", `No agreement on file for ${input.person_id}`);
  if (agreement.currency !== input.currency) {
    throw new Refusal(422, "currency_mismatch", `The agreement is in ${agreement.currency}`);
  }
  if (ctx.db.prepare("SELECT 1 FROM contractor_invoices WHERE person_id = ? AND month = ?").get(input.person_id, input.month)) {
    throw new Refusal(409, "already_exists", `An invoice for ${input.month} is already entered`);
  }
  const { lastInsertRowid } = ctx.db
    .prepare(
      `INSERT INTO contractor_invoices (person_id, month, amount, currency, received_on, entered_on, entered_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(input.person_id, input.month, input.amount, input.currency, input.received_on, ctx.today, ctx.actor.id);
  audit(ctx, "invoice.entered", "contractor_invoice", Number(lastInsertRowid), `${input.person_id} ${input.month}`);
  return ctx.db.prepare("SELECT * FROM contractor_invoices WHERE id = ?").get(lastInsertRowid) as Row;
}

export const PaidInput = z.object({ paid_on: isoDate });

export function markInvoicePaid(ctx: Ctx, id: number, input: z.infer<typeof PaidInput>): Row {
  requireRole(ctx.actor, "ops");
  const invoice = ctx.db.prepare("SELECT * FROM contractor_invoices WHERE id = ?").get(id) as
    | { received_on: string; paid_on: string | null }
    | undefined;
  if (!invoice) throw new Refusal(404, "not_found", `No invoice ${id}`);
  if (invoice.paid_on) throw new Refusal(409, "already_paid", `Invoice ${id} was paid on ${invoice.paid_on}`);
  if (input.paid_on < invoice.received_on) {
    throw new Refusal(409, "paid_before_received", `Invoice ${id} was received on ${invoice.received_on}`);
  }
  ctx.db.prepare("UPDATE contractor_invoices SET paid_on = ? WHERE id = ?").run(input.paid_on, id);
  audit(ctx, "invoice.paid", "contractor_invoice", id);
  return ctx.db.prepare("SELECT * FROM contractor_invoices WHERE id = ?").get(id) as Row;
}

export type InvoiceGap = {
  person_id: string;
  person_name: string;
  month: string;
  due_on: string;
  gap: "no_invoice" | "unpaid";
  received_on: string | null;
};

// A month's invoice is due on the agreement's invoice day of the following month. Received and paid dates
// count only on or before the as-of date, so a past as-of date sees the months as they stood then.
export function invoiceGaps(ctx: Ctx, asOf: string): InvoiceGap[] {
  requireListReader(ctx.actor);
  const agreements = ctx.db
    .prepare(
      `SELECT a.*, p.name AS person_name FROM contractor_agreements a JOIN people p ON p.id = a.person_id
       ORDER BY a.person_id`,
    )
    .all() as (Agreement & { person_name: string })[];
  const invoiceFor = ctx.db.prepare(
    "SELECT received_on, paid_on FROM contractor_invoices WHERE person_id = ? AND month = ?",
  );
  const gaps: InvoiceGap[] = [];
  for (const a of agreements) {
    const lastMonth = (a.ends_on && a.ends_on < asOf ? a.ends_on : asOf).slice(0, 7);
    for (let m = a.starts_on.slice(0, 7); m <= lastMonth; m = nextMonth(m)) {
      const dueOn = `${nextMonth(m)}-${String(a.invoice_day).padStart(2, "0")}`;
      const invoice = invoiceFor.get(a.person_id, m) as { received_on: string; paid_on: string | null } | undefined;
      const base = { person_id: a.person_id, person_name: a.person_name, month: m, due_on: dueOn };
      if (!invoice || invoice.received_on > asOf) {
        if (dueOn <= asOf) gaps.push({ ...base, gap: "no_invoice", received_on: null });
      } else if (!invoice.paid_on || invoice.paid_on > asOf) {
        gaps.push({ ...base, gap: "unpaid", received_on: invoice.received_on });
      }
    }
  }
  return gaps;
}
