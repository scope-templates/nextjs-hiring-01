import { randomBytes } from "node:crypto";
import { z } from "zod";
import { ROLES, type Ctx, Refusal, audit, lastFour, requireRole } from "./actors.ts";
import type { Db, Row } from "./db.ts";
import { type Offer, isoDate } from "./hiring.ts";

const PUBLIC_COLUMNS =
  "id, name, email, role, worker_type, title, team, location, manager_id, offer_id, start_date, end_date";

type OwnerKey = "ops" | "engineer-admin" | "manager";

export const ONBOARDING_STEPS: Record<"employee" | "contractor", [string, OwnerKey, number][]> = {
  employee: [
    ["Signed offer filed", "ops", -7],
    ["Laptop shipped", "engineer-admin", -5],
    ["First-week plan shared", "manager", -3],
    ["Work accounts created", "engineer-admin", -1],
    ["I-9 section 2 completed", "ops", 3],
    ["State withholding form received", "ops", 3],
    ["30-day check-in", "manager", 30],
  ],
  contractor: [
    ["Signed agreement filed", "ops", -7],
    ["First-week plan shared", "manager", -3],
    ["Work accounts created", "engineer-admin", -1],
    ["Invoice instructions sent", "ops", 0],
    ["W-8BEN received", "ops", 7],
  ],
};

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function firstWithRole(db: Db, role: string): string {
  const row = db
    .prepare("SELECT id FROM people WHERE role = ? AND end_date IS NULL ORDER BY id LIMIT 1")
    .get(role) as { id: string } | undefined;
  if (!row) throw new Refusal(409, "no_owner", `Nobody holds the ${role} role`);
  return row.id;
}

function nextPersonId(db: Db): string {
  const { last } = db.prepare("SELECT max(id) AS last FROM people").get() as { last: string | null };
  const n = last ? Number(last.slice(2)) + 1 : 1;
  return `p-${String(n).padStart(3, "0")}`;
}

export function listPeople(ctx: Ctx): Row[] {
  requireRole(ctx.actor, "founder", "ops", "engineer-admin", "hiring-manager");
  return ctx.db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM people ORDER BY id`).all() as Row[];
}

export const PersonInput = z.object({
  offer_id: z.number().int(),
  start_date: isoDate,
  email: z.string().email(),
});

export function createPerson(ctx: Ctx, input: z.infer<typeof PersonInput>): Row {
  requireRole(ctx.actor, "ops");
  const { db } = ctx;
  const offer = db.prepare("SELECT * FROM offers WHERE id = ?").get(input.offer_id) as Offer | undefined;
  if (!offer) throw new Refusal(404, "not_found", `No offer ${input.offer_id}`);
  if (offer.status !== "signed" || !offer.signed_on) {
    throw new Refusal(409, "offer_not_signed", `Offer ${offer.id} is ${offer.status}`);
  }
  if (input.start_date < offer.signed_on) {
    throw new Refusal(
      409,
      "start_before_signed",
      `Start date ${input.start_date} is before the signed date ${offer.signed_on}`,
    );
  }
  if (db.prepare("SELECT 1 FROM people WHERE offer_id = ?").get(offer.id)) {
    throw new Refusal(409, "already_exists", `Offer ${offer.id} already has a person`);
  }
  const { name } = db.prepare("SELECT name FROM candidates WHERE id = ?").get(offer.candidate_id) as { name: string };
  const { hiring_manager_id: managerId } = db
    .prepare("SELECT hiring_manager_id FROM openings WHERE id = ?")
    .get(offer.opening_id) as { hiring_manager_id: string };
  const id = nextPersonId(db);
  const token = randomBytes(16).toString("hex");

  db.transaction(() => {
    db.prepare(
      `INSERT INTO people (id, name, email, role, worker_type, title, team, location, manager_id, offer_id,
         start_date, token, created_on, created_by)
       VALUES (?, ?, ?, 'staff', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      id,
      name,
      input.email,
      offer.worker_type,
      offer.role,
      offer.team,
      offer.location,
      managerId,
      offer.id,
      input.start_date,
      token,
      ctx.today,
      ctx.actor.id,
    );
    audit(ctx, "person.created", "person", id, `offer ${offer.id}`);

    if (!db.prepare("SELECT 1 FROM workplaces WHERE location = ?").get(offer.location)) {
      const status = offer.location.startsWith("US-") ? "not_started" : "not_required";
      db.prepare(
        `INSERT INTO workplaces (location, first_hire_date, registration_status, status_set_on, created_on, entered_by)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(offer.location, input.start_date, status, ctx.today, ctx.today, ctx.actor.id);
      audit(ctx, "workplace.created", "workplace", offer.location, status);
    }

    db.prepare("UPDATE openings SET status = 'filled' WHERE id = ?").run(offer.opening_id);

    const owners: Record<OwnerKey, string> = {
      ops: ctx.actor.id,
      "engineer-admin": firstWithRole(db, "engineer-admin"),
      manager: managerId,
    };
    const addStep = db.prepare("INSERT INTO onboarding_steps (person_id, step, owner_id, due_on) VALUES (?, ?, ?, ?)");
    for (const [step, owner, offset] of ONBOARDING_STEPS[offer.worker_type]) {
      addStep.run(id, step, owners[owner], addDays(input.start_date, offset));
    }
  })();

  // The token is shown once, here, for ops to hand to the new hire.
  return { ...(db.prepare(`SELECT ${PUBLIC_COLUMNS} FROM people WHERE id = ?`).get(id) as Row), token };
}

function requirePerson(db: Db, id: string): void {
  if (!db.prepare("SELECT 1 FROM people WHERE id = ?").get(id)) throw new Refusal(404, "not_found", `No person ${id}`);
}

export const IdentifierInput = z.object({ identifier: z.string() });

export function setIdentifier(ctx: Ctx, personId: string, input: z.infer<typeof IdentifierInput>): { last4: string } {
  requireRole(ctx.actor, "ops");
  requirePerson(ctx.db, personId);
  const last4 = lastFour(input.identifier);
  ctx.db.prepare("UPDATE people SET identifier_last4 = ? WHERE id = ?").run(last4, personId);
  audit(ctx, "identifier.set", "person", personId);
  return { last4 };
}

export function readIdentifier(ctx: Ctx, personId: string): { last4: string | null } {
  requireRole(ctx.actor, "ops");
  requirePerson(ctx.db, personId);
  const { identifier_last4: last4 } = ctx.db
    .prepare("SELECT identifier_last4 FROM people WHERE id = ?")
    .get(personId) as { identifier_last4: string | null };
  audit(ctx, "identifier.read", "person", personId);
  return { last4 };
}

export function listOnboarding(ctx: Ctx): Row[] {
  requireRole(ctx.actor, ...ROLES);
  const select = `SELECT s.*, p.name AS person_name FROM onboarding_steps s JOIN people p ON p.id = s.person_id`;
  if (["founder", "ops", "engineer-admin"].includes(ctx.actor.role)) {
    return ctx.db.prepare(`${select} ORDER BY s.due_on, s.id`).all() as Row[];
  }
  if (ctx.actor.role === "hiring-manager") {
    return ctx.db
      .prepare(`${select} WHERE s.person_id = ? OR s.owner_id = ? ORDER BY s.due_on, s.id`)
      .all(ctx.actor.id, ctx.actor.id) as Row[];
  }
  return ctx.db.prepare(`${select} WHERE s.person_id = ? ORDER BY s.due_on, s.id`).all(ctx.actor.id) as Row[];
}

export const StepDoneInput = z.object({ done_on: isoDate });

export function completeStep(ctx: Ctx, id: number, input: z.infer<typeof StepDoneInput>): Row {
  const step = ctx.db.prepare("SELECT * FROM onboarding_steps WHERE id = ?").get(id) as
    | { owner_id: string; done_on: string | null }
    | undefined;
  requireRole(ctx.actor, ...ROLES);
  if (!step) throw new Refusal(404, "not_found", `No onboarding step ${id}`);
  if (step.owner_id !== ctx.actor.id && ctx.actor.role !== "ops") {
    throw new Refusal(403, "forbidden", "Only the step's owner or ops marks it done");
  }
  if (step.done_on) throw new Refusal(409, "already_done", `Step ${id} was done on ${step.done_on}`);
  ctx.db.prepare("UPDATE onboarding_steps SET done_on = ? WHERE id = ?").run(input.done_on, id);
  audit(ctx, "onboarding.done", "onboarding_step", id);
  return ctx.db.prepare("SELECT * FROM onboarding_steps WHERE id = ?").get(id) as Row;
}
