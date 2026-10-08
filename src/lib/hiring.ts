import { z } from "zod";
import { type Ctx, Refusal, audit, requireRole, seesPay } from "./actors.ts";
import type { Db, Row } from "./db.ts";

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD");
const US_STATE = /^US-[A-Z]{2}$/;
const COUNTRY = /^[A-Z]{2}$/;
const PAY_FIELDS = ["band_id", "pay_amount", "pay_currency", "pay_period"];

export type Offer = {
  id: number;
  candidate_id: number;
  opening_id: number;
  role: string;
  team: string;
  level: number;
  band_id: string | null;
  location: string;
  worker_type: "employee" | "contractor";
  pay_amount: number;
  pay_currency: string;
  pay_period: "annual" | "monthly";
  start_date: string;
  status: "draft" | "sent" | "signed" | "declined" | "withdrawn";
  sent_on: string | null;
  signed_on: string | null;
  closed_on: string | null;
  created_by: string;
  created_on: string;
};

type Opening = {
  id: number;
  title: string;
  team: string;
  level: number;
  band_id: string | null;
  worker_type: "employee" | "contractor";
  hiring_manager_id: string;
  status: string;
};

function withoutPay<T extends object>(row: T): Partial<T> {
  const copy = { ...row } as Record<string, unknown>;
  for (const field of PAY_FIELDS) delete copy[field];
  return copy as Partial<T>;
}

function hiringManagerOnly(ctx: Ctx): boolean {
  requireRole(ctx.actor, "founder", "ops", "hiring-manager");
  return ctx.actor.role === "hiring-manager";
}

function loadOpening(db: Db, id: number): Opening {
  const opening = db.prepare("SELECT * FROM openings WHERE id = ?").get(id) as Opening | undefined;
  if (!opening) throw new Refusal(404, "not_found", `No opening ${id}`);
  return opening;
}

function loadOffer(db: Db, id: number): Offer {
  const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(id) as Offer | undefined;
  if (!offer) throw new Refusal(404, "not_found", `No offer ${id}`);
  return offer;
}

export function listPayBands(ctx: Ctx): Row[] {
  requireRole(ctx.actor, "founder", "ops");
  return ctx.db.prepare("SELECT * FROM pay_bands ORDER BY track, level").all() as Row[];
}

export function listOpenings(ctx: Ctx): Partial<Row>[] {
  if (!hiringManagerOnly(ctx)) {
    return ctx.db.prepare("SELECT * FROM openings ORDER BY id").all() as Row[];
  }
  const own = ctx.db
    .prepare("SELECT * FROM openings WHERE hiring_manager_id = ? ORDER BY id")
    .all(ctx.actor.id) as Row[];
  return own.map(withoutPay);
}

export function listCandidates(ctx: Ctx): Row[] {
  if (!hiringManagerOnly(ctx)) {
    return ctx.db.prepare("SELECT * FROM candidates ORDER BY id").all() as Row[];
  }
  return ctx.db
    .prepare(
      `SELECT c.* FROM candidates c JOIN openings o ON o.id = c.opening_id
       WHERE o.hiring_manager_id = ? ORDER BY c.id`,
    )
    .all(ctx.actor.id) as Row[];
}

export const CandidateInput = z.object({
  opening_id: z.number().int(),
  name: z.string().trim().min(1),
  email: z.string().email(),
});

export function addCandidate(ctx: Ctx, input: z.infer<typeof CandidateInput>): Row {
  const own = hiringManagerOnly(ctx);
  const opening = loadOpening(ctx.db, input.opening_id);
  if (own && opening.hiring_manager_id !== ctx.actor.id) {
    throw new Refusal(403, "forbidden", "Hiring managers add candidates to their own openings");
  }
  if (opening.status !== "open") throw new Refusal(409, "opening_not_open", `Opening ${opening.id} is ${opening.status}`);
  const { lastInsertRowid } = ctx.db
    .prepare("INSERT INTO candidates (opening_id, name, email, added_on, added_by) VALUES (?, ?, ?, ?, ?)")
    .run(opening.id, input.name, input.email, ctx.today, ctx.actor.id);
  audit(ctx, "candidate.added", "candidate", Number(lastInsertRowid), `opening ${opening.id}`);
  return ctx.db.prepare("SELECT * FROM candidates WHERE id = ?").get(lastInsertRowid) as Row;
}

export function listOffers(ctx: Ctx): Partial<Offer>[] {
  if (!hiringManagerOnly(ctx)) {
    return ctx.db.prepare("SELECT * FROM offers ORDER BY id").all() as Offer[];
  }
  const own = ctx.db
    .prepare(
      `SELECT f.* FROM offers f JOIN openings o ON o.id = f.opening_id
       WHERE o.hiring_manager_id = ? ORDER BY f.id`,
    )
    .all(ctx.actor.id) as Offer[];
  return own.map(withoutPay);
}

export function getOffer(ctx: Ctx, id: number): Partial<Offer> & { approvals?: Row[] } {
  const own = hiringManagerOnly(ctx);
  const offer = loadOffer(ctx.db, id);
  if (own) {
    if (loadOpening(ctx.db, offer.opening_id).hiring_manager_id !== ctx.actor.id) {
      throw new Refusal(403, "forbidden", "Hiring managers see offers for their own openings");
    }
    return withoutPay(offer);
  }
  const approvals = ctx.db.prepare("SELECT * FROM approvals WHERE offer_id = ? ORDER BY id").all(id) as Row[];
  return { ...offer, approvals };
}

export function approvalReasons(db: Db, offer: Offer): string[] {
  const reasons: string[] = [];
  if (offer.band_id) {
    const band = db.prepare("SELECT ceiling_usd FROM pay_bands WHERE id = ?").get(offer.band_id) as {
      ceiling_usd: number;
    };
    if (offer.pay_amount > band.ceiling_usd) reasons.push("above_band");
  }
  if (!db.prepare("SELECT 1 FROM workplaces WHERE location = ?").get(offer.location)) {
    reasons.push("new_location");
  }
  return reasons;
}

export const OfferInput = z.object({
  candidate_id: z.number().int(),
  location: z.string(),
  pay_amount: z.number().int().positive(),
  pay_currency: z.string().regex(/^[A-Z]{3}$/),
  start_date: isoDate,
});

export function createOffer(ctx: Ctx, input: z.infer<typeof OfferInput>): Offer {
  requireRole(ctx.actor, "founder", "ops");
  const candidate = ctx.db.prepare("SELECT * FROM candidates WHERE id = ?").get(input.candidate_id) as
    | { opening_id: number }
    | undefined;
  if (!candidate) throw new Refusal(404, "not_found", `No candidate ${input.candidate_id}`);
  const opening = loadOpening(ctx.db, candidate.opening_id);
  if (opening.status !== "open") throw new Refusal(409, "opening_not_open", `Opening ${opening.id} is ${opening.status}`);
  if (opening.worker_type === "employee") {
    if (!US_STATE.test(input.location)) throw new Refusal(422, "bad_location", "Employees work in a US state, as US-XX");
    if (input.pay_currency !== "USD") throw new Refusal(422, "bad_currency", "Employee pay is in USD");
  } else if (!COUNTRY.test(input.location) || input.location === "US") {
    throw new Refusal(422, "bad_location", "Contractors work from a country outside the US, as a two-letter code");
  }
  const { lastInsertRowid } = ctx.db
    .prepare(
      `INSERT INTO offers (candidate_id, opening_id, role, team, level, band_id, location, worker_type,
         pay_amount, pay_currency, pay_period, start_date, status, created_by, created_on)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?)`,
    )
    .run(
      input.candidate_id,
      opening.id,
      opening.title,
      opening.team,
      opening.level,
      opening.band_id,
      input.location,
      opening.worker_type,
      input.pay_amount,
      input.pay_currency,
      opening.worker_type === "employee" ? "annual" : "monthly",
      input.start_date,
      ctx.actor.id,
      ctx.today,
    );
  audit(ctx, "offer.created", "offer", Number(lastInsertRowid));
  return loadOffer(ctx.db, Number(lastInsertRowid));
}

export const ApprovalInput = z.object({
  decision: z.enum(["approved", "declined"]),
  note: z.string().trim().min(1).optional(),
});

export function approveOffer(ctx: Ctx, id: number, input: z.infer<typeof ApprovalInput>): Row {
  requireRole(ctx.actor, "founder");
  const offer = loadOffer(ctx.db, id);
  if (offer.status !== "draft") throw new Refusal(409, "not_draft", `Offer ${id} is ${offer.status}`);
  if (offer.created_by === ctx.actor.id) {
    throw new Refusal(409, "own_offer", "Nobody approves an offer they created");
  }
  if (loadOpening(ctx.db, offer.opening_id).hiring_manager_id === ctx.actor.id) {
    throw new Refusal(409, "own_opening", "Nobody approves an offer for an opening they manage");
  }
  const reasons = approvalReasons(ctx.db, offer).join(",") || "none";
  const { lastInsertRowid } = ctx.db
    .prepare(
      `INSERT INTO approvals (offer_id, approver_id, reasons, decision, note, decided_on)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(id, ctx.actor.id, reasons, input.decision, input.note ?? null, ctx.today);
  audit(ctx, `approval.${input.decision}`, "offer", id, reasons);
  return ctx.db.prepare("SELECT * FROM approvals WHERE id = ?").get(lastInsertRowid) as Row;
}

export function sendOffer(ctx: Ctx, id: number): Offer {
  requireRole(ctx.actor, "founder", "ops");
  const offer = loadOffer(ctx.db, id);
  if (offer.status !== "draft") throw new Refusal(409, "not_draft", `Offer ${id} is ${offer.status}`);
  const reasons = approvalReasons(ctx.db, offer);
  if (reasons.length > 0) {
    const latest = ctx.db
      .prepare("SELECT decision FROM approvals WHERE offer_id = ? ORDER BY id DESC LIMIT 1")
      .get(id) as { decision: string } | undefined;
    if (latest?.decision !== "approved") {
      throw new Refusal(409, "approval_required", `A founder must approve this offer first (${reasons.join(", ")})`);
    }
  }
  ctx.db.prepare("UPDATE offers SET status = 'sent', sent_on = ? WHERE id = ?").run(ctx.today, id);
  audit(ctx, "offer.sent", "offer", id);
  return loadOffer(ctx.db, id);
}

export const SignInput = z.object({ signed_on: isoDate, start_date: isoDate.optional() });

export function signOffer(ctx: Ctx, id: number, input: z.infer<typeof SignInput>): Offer {
  requireRole(ctx.actor, "founder", "ops");
  const offer = loadOffer(ctx.db, id);
  if (offer.status !== "sent") throw new Refusal(409, "not_sent", `Offer ${id} is ${offer.status}`);
  if (input.signed_on < (offer.sent_on ?? "")) {
    throw new Refusal(409, "signed_before_sent", `Offer ${id} was sent on ${offer.sent_on}`);
  }
  const start = input.start_date ?? offer.start_date;
  if (start < input.signed_on) {
    throw new Refusal(409, "start_before_signed", `Start date ${start} is before the signed date ${input.signed_on}`);
  }
  ctx.db
    .prepare("UPDATE offers SET status = 'signed', signed_on = ?, start_date = ? WHERE id = ?")
    .run(input.signed_on, start, id);
  audit(ctx, "offer.signed", "offer", id, `start ${start}`);
  return loadOffer(ctx.db, id);
}

export function closeOffer(ctx: Ctx, id: number, outcome: "declined" | "withdrawn"): Offer {
  requireRole(ctx.actor, "founder", "ops");
  const offer = loadOffer(ctx.db, id);
  const from = outcome === "declined" ? ["sent"] : ["draft", "sent"];
  if (!from.includes(offer.status)) throw new Refusal(409, "bad_transition", `Offer ${id} is ${offer.status}`);
  ctx.db.prepare("UPDATE offers SET status = ?, closed_on = ? WHERE id = ?").run(outcome, ctx.today, id);
  audit(ctx, `offer.${outcome}`, "offer", id);
  return loadOffer(ctx.db, id);
}
