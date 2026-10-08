import type { Db } from "./db.ts";

export const ROLES = ["founder", "ops", "hiring-manager", "engineer-admin", "staff"] as const;
export type Role = (typeof ROLES)[number];

export type Actor = { id: string; name: string; role: Role; kind: "person" | "system" };

export type Ctx = { db: Db; actor: Actor; today: string };

export class Refusal extends Error {
  status: number;
  code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

type PersonRow = { id: string; name: string; role: Role; end_date: string | null };

function personActor(person: PersonRow, today: string): Actor {
  if (person.end_date && person.end_date < today) {
    throw new Refusal(401, "actor_left", `${person.name} left on ${person.end_date}`);
  }
  return { id: person.id, name: person.name, role: person.role, kind: "person" };
}

export function actorForToken(db: Db, token: string | undefined, today: string): Actor {
  if (!token) throw new Refusal(401, "no_token", "Send Authorization: Bearer <token>, or sign in on the home page");
  const person = db.prepare("SELECT id, name, role, end_date FROM people WHERE token = ?").get(token) as
    | PersonRow
    | undefined;
  if (!person) throw new Refusal(401, "bad_token", "No one holds that token");
  return personActor(person, today);
}

// Scripts and tests name their actor directly; HTTP requests only ever reach actorForToken.
export function loadActor(db: Db, id: string, today: string): Actor {
  const person = db.prepare("SELECT id, name, role, end_date FROM people WHERE id = ?").get(id) as
    | PersonRow
    | undefined;
  if (person) return personActor(person, today);
  const system = db.prepare("SELECT name, role FROM system_actors WHERE name = ?").get(id) as
    | { name: string; role: Role }
    | undefined;
  if (system) return { id: system.name, name: system.name, role: system.role, kind: "system" };
  throw new Refusal(401, "unknown_actor", `No person or system actor called ${id}`);
}

export function requireRole(actor: Actor, ...roles: Role[]): void {
  if (actor.kind === "system") {
    throw new Refusal(403, "system_actor", `${actor.name} only runs the monthly lists`);
  }
  if (!roles.includes(actor.role)) {
    throw new Refusal(403, "forbidden", `The ${actor.role} role cannot do this`);
  }
}

export function requireListReader(actor: Actor): void {
  if (actor.kind === "system" ? actor.role !== "ops" : actor.role !== "founder" && actor.role !== "ops") {
    throw new Refusal(403, "forbidden", `The ${actor.role} role cannot do this`);
  }
}

export function seesPay(actor: Actor): boolean {
  return actor.role === "founder" || actor.role === "ops";
}

export function lastFour(value: string): string {
  const compact = value.replace(/[\s-]/g, "");
  if (compact.length < 4) throw new Refusal(422, "too_short", "Needs at least four characters");
  return compact.slice(-4);
}

export function audit(
  { db, actor }: Ctx,
  action: string,
  entity: string,
  entityId: string | number,
  detail?: string,
): void {
  db.prepare(
    "INSERT INTO audit_log (at, actor, action, entity, entity_id, detail) VALUES (?, ?, ?, ?, ?, ?)",
  ).run(new Date().toISOString(), actor.id, action, entity, String(entityId), detail ?? null);
}

export function listAudit(ctx: Ctx, entity?: string, entityId?: string): Record<string, unknown>[] {
  requireRole(ctx.actor, "founder", "ops", "engineer-admin");
  return ctx.db
    .prepare(
      `SELECT * FROM audit_log
       WHERE (@entity IS NULL OR entity = @entity) AND (@entityId IS NULL OR entity_id = @entityId)
       ORDER BY id DESC LIMIT 500`,
    )
    .all({ entity: entity ?? null, entityId: entityId ?? null }) as Record<string, unknown>[];
}
