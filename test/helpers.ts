import { type Ctx, loadActor } from "../src/lib/actors.ts";
import { type Db, openDb } from "../src/lib/db.ts";

export const TODAY = "2026-09-30";

export const FOUNDER = "p-001";
export const COFOUNDER = "p-002";
export const OPS = "p-003";
export const ENGINEER_ADMIN = "p-004";
export const ENG_MANAGER = "p-005";
export const SALES_MANAGER = "p-006";
export const STAFF = "p-008";
export const NEW_HIRE = "p-031";

export function freshDb(): Db {
  return openDb(":memory:");
}

export function as(db: Db, id: string, today = TODAY): Ctx {
  return { db, actor: loadActor(db, id, today), today };
}

export function auditEntries(db: Db, action: string, entityId: string): { actor: string }[] {
  return db
    .prepare("SELECT actor FROM audit_log WHERE action = ? AND entity_id = ? ORDER BY id")
    .all(action, entityId) as { actor: string }[];
}
