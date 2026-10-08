import { z } from "zod";
import { type Ctx, Refusal, audit, lastFour, requireListReader, requireRole } from "./actors.ts";
import type { Db, Row } from "./db.ts";
import { isoDate } from "./hiring.ts";

const COMPLETE = "('registered', 'not_required')";
const LISTED_COLUMNS = `location, first_hire_date, registration_status, registration_deadline, deadline_set_on,
  status_set_on, entered_by, account_ref_last4 IS NOT NULL AS has_account_reference`;

function requireWorkplace(db: Db, location: string): void {
  if (!db.prepare("SELECT 1 FROM workplaces WHERE location = ?").get(location)) {
    throw new Refusal(404, "not_found", `No workplace ${location}`);
  }
}

export function listWorkplaces(ctx: Ctx): Row[] {
  requireRole(ctx.actor, "founder", "ops");
  return ctx.db.prepare(`SELECT ${LISTED_COLUMNS} FROM workplaces ORDER BY location`).all() as Row[];
}

export const WorkplaceInput = z
  .object({
    registration_status: z.enum(["not_started", "in_progress", "registered", "not_required"]).optional(),
    registration_deadline: isoDate.optional(),
    account_reference: z.string().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Change at least one field");

export function updateWorkplace(ctx: Ctx, location: string, input: z.infer<typeof WorkplaceInput>): Row {
  requireRole(ctx.actor, "ops");
  requireWorkplace(ctx.db, location);
  ctx.db.transaction(() => {
    if (input.registration_status) {
      ctx.db
        .prepare("UPDATE workplaces SET registration_status = ?, status_set_on = ? WHERE location = ?")
        .run(input.registration_status, ctx.today, location);
    }
    if (input.registration_deadline) {
      ctx.db
        .prepare("UPDATE workplaces SET registration_deadline = ?, deadline_set_on = ? WHERE location = ?")
        .run(input.registration_deadline, ctx.today, location);
    }
    if (input.account_reference !== undefined) {
      ctx.db
        .prepare("UPDATE workplaces SET account_ref_last4 = ? WHERE location = ?")
        .run(lastFour(input.account_reference), location);
    }
    ctx.db.prepare("UPDATE workplaces SET entered_by = ? WHERE location = ?").run(ctx.actor.id, location);
    audit(ctx, "workplace.updated", "workplace", location, Object.keys(input).join(","));
  })();
  return ctx.db.prepare(`SELECT ${LISTED_COLUMNS} FROM workplaces WHERE location = ?`).get(location) as Row;
}

export function readAccountReference(ctx: Ctx, location: string): { last4: string | null } {
  requireRole(ctx.actor, "ops");
  requireWorkplace(ctx.db, location);
  const { account_ref_last4: last4 } = ctx.db
    .prepare("SELECT account_ref_last4 FROM workplaces WHERE location = ?")
    .get(location) as { account_ref_last4: string | null };
  audit(ctx, "account_reference.read", "workplace", location);
  return { last4 };
}

export type OverdueRegistration = {
  location: string;
  first_hire_date: string;
  registration_status: string;
  registration_deadline: string | null;
  status_set_on: string;
  days_past: number | null;
};

// A status counts from its status_set_on date and a deadline from its deadline_set_on date, so a past as-of
// date sees the workplace as it stood then.
export function overdueRegistrations(ctx: Ctx, asOf: string): OverdueRegistration[] {
  requireListReader(ctx.actor);
  return ctx.db
    .prepare(
      `SELECT location, first_hire_date, registration_status, registration_deadline, status_set_on,
         CAST(julianday(@asOf) - julianday(registration_deadline) AS INTEGER) AS days_past
       FROM (
         SELECT location, first_hire_date, registration_status, status_set_on, created_on,
           CASE WHEN deadline_set_on <= @asOf THEN registration_deadline END AS registration_deadline
         FROM workplaces
       )
       WHERE created_on <= @asOf
         AND (registration_deadline IS NULL OR registration_deadline < @asOf)
         AND NOT (registration_status IN ${COMPLETE} AND status_set_on <= @asOf)
       ORDER BY registration_deadline IS NOT NULL, registration_deadline, location`,
    )
    .all({ asOf }) as OverdueRegistration[];
}
