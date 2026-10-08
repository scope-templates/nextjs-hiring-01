import Database from "better-sqlite3";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { SCHEMA } from "./schema.ts";

export type Db = Database.Database;
export type Row = Record<string, string | number | null>;
export type Seed = Record<string, Row[]>;

// Parents before children; people and offers point at each other, so keys are checked at commit.
const SEED_TABLES = [
  "system_actors",
  "people",
  "pay_bands",
  "openings",
  "candidates",
  "offers",
  "approvals",
  "workplaces",
  "contractor_agreements",
  "contractor_invoices",
  "onboarding_steps",
  "audit_log",
];

export function loadSeed(db: Db, seed: Seed): void {
  db.transaction(() => {
    db.pragma("defer_foreign_keys = ON");
    for (const table of SEED_TABLES) {
      const rows = seed[table] ?? [];
      if (rows.length === 0) continue;
      const columns = Object.keys(rows[0]);
      const insert = db.prepare(
        `INSERT INTO ${table} (${columns.join(", ")}) VALUES (${columns.map((c) => "@" + c).join(", ")})`,
      );
      for (const row of rows) insert.run(row);
    }
  })();
}

export function openDb(file: string): Db {
  const db = new Database(file);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  const { n } = db.prepare("SELECT count(*) AS n FROM people").get() as { n: number };
  if (n === 0) {
    loadSeed(db, JSON.parse(readFileSync(join(process.cwd(), "data", "seed.json"), "utf8")) as Seed);
  }
  return db;
}

let shared: Db | undefined;

export function getDb(): Db {
  shared ??= openDb(process.env.HIRING_DB ?? "hiring.db");
  return shared;
}
