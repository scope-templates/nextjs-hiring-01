import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SEED_PATH, buildSeed } from "../scripts/generate-seed.ts";
import { type Db, openDb } from "../src/lib/db.ts";
import { freshDb } from "./helpers.ts";

describe("seed data", () => {
  it("is the generator's output, byte for byte", () => {
    expect(buildSeed()).toBe(readFileSync(SEED_PATH, "utf8"));
    expect(buildSeed()).toBe(buildSeed());
  });

  it("loads into an empty store and not again", () => {
    const folder = mkdtempSync(join(tmpdir(), "hiring-"));
    const file = join(folder, "hiring.db");
    const count = (db: Db, table: string) => (db.prepare(`SELECT count(*) AS n FROM ${table}`).get() as { n: number }).n;
    const first = openDb(file);
    expect(count(first, "people")).toBe(31);
    first.prepare("DELETE FROM onboarding_steps").run();
    first.close();
    const second = openDb(file);
    expect(count(second, "onboarding_steps")).toBe(0);
    expect(count(second, "people")).toBe(31);
    second.close();
    rmSync(folder, { recursive: true, force: true });
  });

  it("covers twelve months ending September 2026", () => {
    const db = freshDb();
    expect(db.prepare("SELECT min(at) AS first, max(at) AS last FROM audit_log").get()).toMatchObject({
      first: expect.stringMatching(/^2025-10-06/),
      last: expect.stringMatching(/^2026-09-/),
    });
    expect(db.prepare("SELECT min(month) AS first, max(month) AS last FROM contractor_invoices").get()).toEqual({
      first: "2025-10",
      last: "2026-08",
    });
  });
});
