// Builds data/seed.json: Ostrander Labs, October 2025 through September 2026.
// Same bytes on every run; `npm run seed:generate` rewrites the file.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { monthEnd, nextMonth } from "../src/lib/contractors.ts";
import { ONBOARDING_STEPS, addDays } from "../src/lib/people.ts";

type Row = Record<string, string | number | null>;

const LAST_DAY = "2026-09-30";
const TRACKER_START = "2025-10-06";
const OPS = "p-003";
const DOMAIN = "ostranderlabs.com";

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function buildSeed(): string {
  const rand = mulberry32(20260930);
  const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));
  const pad = (n: number) => String(n).padStart(2, "0");
  const digits = (n: number) => Array.from({ length: n }, () => int(0, 9)).join("");
  const token = () => Array.from({ length: 32 }, () => int(0, 15).toString(16)).join("");
  const time = (minute: number) =>
    `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}:${pad(int(0, 59))}.${String(int(0, 999)).padStart(3, "0")}Z`;
  // Saturday and Sunday move to the following Monday.
  const onWeekday = (date: string) => {
    const day = new Date(`${date}T00:00:00Z`).getUTCDay();
    return day === 6 ? addDays(date, 2) : day === 0 ? addDays(date, 1) : date;
  };

  const audit: Row[] = [];
  // Returns a logger for one date; each entry it logs gets a later time than the one before.
  const session = (date: string) => {
    const roll = rand();
    const startHour = roll < 0.08 ? int(10, 12) : roll > 0.93 ? int(22, 23) : int(13, 21);
    let minute = startHour * 60 + int(0, 40);
    return (actor: string, action: string, entity: string, entityId: string | number, detail: string | null = null) => {
      minute = Math.min(minute + int(1, 6), 23 * 60 + 59);
      const at = `${date}T${time(minute)}`;
      audit.push({ at, actor, action, entity, entity_id: String(entityId), detail });
    };
  };

  const system_actors: Row[] = [
    { name: "monthly-close", role: "ops", description: "Runs the registrations and invoices lists on the first of each month" },
  ];

  const pay_bands: Row[] = [
    ["ENG-2", "Engineering", 2, 120000, 150000],
    ["ENG-3", "Engineering", 3, 150000, 185000],
    ["ENG-4", "Engineering", 4, 180000, 220000],
    ["GTM-2", "Go-to-market", 2, 85000, 110000],
    ["GTM-3", "Go-to-market", 3, 105000, 135000],
    ["DES-3", "Design", 3, 130000, 160000],
    ["SUP-2", "Support", 2, 75000, 95000],
    ["MKT-3", "Marketing", 3, 120000, 150000],
  ].map(([id, track, level, floor_usd, ceiling_usd]) => ({ id, track, level, floor_usd, ceiling_usd }) as Row);

  // People with no offer row, created on TRACKER_START.
  const earlier: [string, string, string, string, string, string, string, string, string | null, string, string | null][] = [
    ["p-001", "Miriam Castellanos", "miriam", "founder", "employee", "Chief Executive Officer", "Leadership", "US-NY", null, "2021-06-01", null],
    ["p-002", "Jonah Petrakis", "jonah", "founder", "employee", "Chief Technology Officer", "Engineering", "US-CO", null, "2021-06-01", null],
    ["p-003", "Renee Okonkwo", "renee", "ops", "employee", "Operations Lead", "Operations", "US-NY", "p-001", "2023-01-09", null],
    ["p-004", "Sam Whitlock", "sam", "engineer-admin", "employee", "Staff Engineer", "Engineering", "US-CO", "p-002", "2022-04-04", null],
    ["p-005", "Aditi Raman", "aditi", "hiring-manager", "employee", "Engineering Manager", "Engineering", "US-TX", "p-002", "2022-08-15", null],
    ["p-006", "Curtis Abernathy", "curtis", "hiring-manager", "employee", "Head of Sales", "Sales", "US-TX", "p-001", "2023-03-06", null],
    ["p-007", "Leila Haddad", "leila", "hiring-manager", "employee", "Customer Success Lead", "Customer Success", "US-NY", "p-001", "2022-11-07", null],
    ["p-008", "Owen Fairbanks", "owen", "staff", "employee", "Senior Software Engineer", "Engineering", "US-CO", "p-005", "2022-02-14", null],
    ["p-009", "Grace Nakamura", "grace", "staff", "employee", "Software Engineer", "Engineering", "US-NY", "p-005", "2023-06-12", null],
    ["p-010", "Tomás Echeverría", "tomas", "staff", "employee", "Software Engineer", "Engineering", "US-TX", "p-005", "2024-02-05", null],
    ["p-011", "Bethany Kowalczyk", "bethany", "staff", "employee", "Account Executive", "Sales", "US-TX", "p-006", "2024-01-08", null],
    ["p-012", "Marcus Oyelaran", "marcus", "staff", "employee", "Customer Success Manager", "Customer Success", "US-NY", "p-007", "2023-09-18", null],
    ["p-013", "Ingrid Sorensen", "ingrid", "staff", "employee", "Product Manager", "Product", "US-CO", "p-002", "2024-05-13", null],
    ["p-014", "Inês Carvalho", "ines.carvalho", "staff", "contractor", "Contract Software Engineer", "Engineering", "PT", "p-005", "2023-02-01", null],
    ["p-015", "Rui Mendonça", "rui.mendonca", "staff", "contractor", "Contract QA Engineer", "Engineering", "PT", "p-005", "2024-06-03", null],
    ["p-016", "Katarzyna Wilk", "katarzyna.wilk", "staff", "contractor", "Contract Software Engineer", "Engineering", "PL", "p-005", "2023-08-01", null],
    ["p-017", "Paweł Zieliński", "pawel.zielinski", "staff", "contractor", "Contract Data Analyst", "Product", "PL", "p-013", "2024-01-15", "2026-05-31"],
    ["p-018", "Valentina Ríos", "valentina.rios", "staff", "contractor", "Contract Support Specialist", "Customer Success", "AR", "p-007", "2024-03-04", null],
    ["p-019", "Liam Arsenault", "liam.arsenault", "staff", "contractor", "Contract Product Designer", "Product", "CA", "p-013", "2024-11-04", null],
  ];

  const people: Row[] = [];
  const firstDay = session(TRACKER_START);
  for (const [id, name, local, role, worker_type, title, team, location, manager_id, start_date, end_date] of earlier) {
    people.push({
      id, name, email: `${local}@${DOMAIN}`, role, worker_type, title, team, location, manager_id, offer_id: null,
      start_date, end_date, identifier_last4: digits(4), token: token(), created_on: TRACKER_START, created_by: OPS,
    });
    firstDay(OPS, "person.created", "person", id, "hiring spreadsheet");
  }
  const secondDay = session(addDays(TRACKER_START, 1));
  for (const p of people) secondDay(OPS, "identifier.set", "person", p.id as string);

  const workplaces: Row[] = [
    ["US-NY", "2021-06-01", "registered", "2021-06-30", "2021-06-22"],
    ["US-CO", "2021-06-01", "registered", "2021-06-30", "2021-06-25"],
    ["US-TX", "2022-08-15", "registered", "2022-09-09", "2022-09-01"],
    ["PT", "2023-02-01", "not_required", null, "2023-02-01"],
    ["PL", "2023-08-01", "not_required", null, "2023-08-01"],
    ["AR", "2024-03-04", "not_required", null, "2024-03-04"],
    ["CA", "2024-11-04", "not_required", null, "2024-11-04"],
  ].map(([location, first_hire_date, registration_status, registration_deadline, status_set_on]) => ({
    location, first_hire_date, registration_status, registration_deadline,
    deadline_set_on: registration_deadline ? TRACKER_START : null, status_set_on,
    account_ref_last4: (location as string).startsWith("US-") ? digits(4) : null, created_on: TRACKER_START, entered_by: OPS,
  }));
  for (const w of workplaces) firstDay(OPS, "workplace.created", "workplace", w.location as string, w.registration_status as string);

  const openingRows: [string, string, number, string | null, string, string, string, string][] = [
    ["Senior Software Engineer", "Engineering", 4, "ENG-4", "employee", "p-002", "2025-10-14", "filled"],
    ["Customer Success Manager", "Customer Success", 2, "GTM-2", "employee", "p-007", "2025-10-20", "filled"],
    ["Software Engineer", "Engineering", 2, "ENG-2", "employee", "p-005", "2025-11-03", "filled"],
    ["Contract Software Engineer", "Engineering", 3, null, "contractor", "p-005", "2025-11-10", "filled"],
    ["Account Executive", "Sales", 2, "GTM-2", "employee", "p-006", "2025-12-08", "filled"],
    ["Implementation Specialist", "Customer Success", 2, "GTM-2", "employee", "p-007", "2026-01-20", "filled"],
    ["Contract QA Engineer", "Engineering", 2, null, "contractor", "p-005", "2026-02-09", "filled"],
    ["Product Designer", "Product", 3, "DES-3", "employee", "p-002", "2026-02-23", "filled"],
    ["Data Engineer", "Engineering", 3, "ENG-3", "employee", "p-005", "2026-03-16", "filled"],
    ["Marketing Manager", "Marketing", 3, "MKT-3", "employee", "p-001", "2026-04-13", "closed"],
    ["Contract Software Engineer", "Engineering", 3, null, "contractor", "p-005", "2026-05-04", "filled"],
    ["Support Engineer", "Customer Success", 2, "SUP-2", "employee", "p-007", "2026-05-18", "filled"],
    ["Software Engineer", "Engineering", 3, "ENG-3", "employee", "p-005", "2026-06-29", "filled"],
    ["Sales Engineer", "Sales", 3, "GTM-3", "employee", "p-006", "2026-07-20", "open"],
    ["Customer Success Manager", "Customer Success", 2, "GTM-2", "employee", "p-007", "2026-08-10", "open"],
    ["Senior Software Engineer", "Engineering", 4, "ENG-4", "employee", "p-002", "2026-08-17", "open"],
    ["Contract Support Specialist", "Customer Success", 2, null, "contractor", "p-007", "2026-09-21", "open"],
  ];
  const openings: Row[] = openingRows.map(
    ([title, team, level, band_id, worker_type, hiring_manager_id, opened_on, status], i) => ({
      id: i + 1, title, team, level, band_id, worker_type, hiring_manager_id, opened_on, status,
    }),
  );

  const candidateRows: [number, string, string, string, string][] = [
    [1, "Elliot Brandvold", "elliot.brandvold@example.com", "2025-10-16", OPS],
    [1, "Farah Siddiqui", "farah.s@example.net", "2025-10-16", OPS],
    [2, "Keisha Ambrose", "keisha.ambrose@example.org", "2025-10-22", "p-007"],
    [2, "Dmitri Volkov", "dvolkov@example.com", "2025-10-23", "p-007"],
    [3, "Arjun Mehta", "arjun.mehta@example.net", "2025-11-05", "p-005"],
    [3, "Nora Lindgren", "nora.lindgren@example.com", "2025-11-07", "p-005"],
    [4, "Beatriz Antunes", "beatriz.antunes@example.org", "2025-11-12", "p-005"],
    [5, "Simone Battaglia", "simone.battaglia@example.com", "2025-12-15", "p-006"],
    [5, "Tyler Ruggiero", "tyler.ruggiero@example.net", "2025-12-18", "p-006"],
    [5, "Gabe Morrissey", "gabe.morrissey@example.com", "2026-01-05", "p-006"],
    [6, "Hana Yoshida", "hana.yoshida@example.org", "2026-01-26", "p-007"],
    [7, "Martín Quiroga", "martin.quiroga@example.com", "2026-02-12", "p-005"],
    [8, "Camille Dufresne", "camille.dufresne@example.net", "2026-03-02", OPS],
    [8, "Ravi Shah", "ravi.shah@example.com", "2026-03-04", OPS],
    [9, "Wesley Park", "wes.park@example.org", "2026-03-20", "p-005"],
    [9, "Deshawn Pruitt", "deshawn.pruitt@example.com", "2026-04-02", "p-005"],
    [10, "Joelle Marchetti", "joelle.marchetti@example.net", "2026-04-20", "p-001"],
    [11, "Zofia Mazur", "zofia.mazur@example.com", "2026-05-08", "p-005"],
    [12, "Rosa Delgado", "rosa.delgado@example.org", "2026-05-22", "p-007"],
    [12, "Kevin O'Shea", "kevin.oshea@example.com", "2026-05-26", "p-007"],
    [13, "Anders Kjelstad", "anders.kjelstad@example.net", "2026-07-06", "p-005"],
    [13, "Priya Natarajan", "priya.natarajan@example.com", "2026-07-08", "p-005"],
    [14, "Priyanka Iyer", "priyanka.iyer@example.org", "2026-08-03", "p-006"],
    [14, "Colin McAteer", "colin.mcateer@example.com", "2026-08-11", "p-006"],
    [15, "Brianna Coffey", "brianna.coffey@example.net", "2026-08-24", "p-007"],
    [15, "Yusuf Demir", "yusuf.demir@example.com", "2026-08-27", "p-007"],
    [16, "Malik Danforth", "malik.danforth@example.org", "2026-08-31", "p-002"],
    [16, "Erin Vasquez", "erin.vasquez@example.com", "2026-09-02", "p-002"],
    [15, "Lauren Whitcombe", "lauren.whitcombe@example.net", "2026-09-09", OPS],
    [16, "Jae-won Lim", "jaewon.lim@example.com", "2026-09-14", "p-002"],
    [17, "Lucía Benítez", "lucia.benitez@example.net", "2026-09-23", "p-007"],
  ];
  const candidates: Row[] = candidateRows.map(([opening_id, name, email, added_on, added_by], i) => ({
    id: i + 1, opening_id, name, email, added_on, added_by,
  }));
  for (const c of candidates) {
    session(c.added_on as string)(c.added_by as string, "candidate.added", "candidate", c.id as number, `opening ${c.opening_id}`);
  }
  const candidateId = (name: string) => candidates.find((c) => c.name === name)!.id as number;

  type OfferPlan = {
    candidate: string; location: string; pay: number; currency: string; start: string; created: string;
    by?: string; approval?: [string, string, "approved" | "declined", string, string]; sent?: string;
    signed?: string; closed?: [string, "declined" | "withdrawn"];
  };
  const plans: OfferPlan[] = [
    { candidate: "Elliot Brandvold", location: "US-OR", pay: 205000, currency: "USD", start: "2025-11-17", created: "2025-10-27",
      approval: ["2025-10-28", "p-001", "approved", "new_location", "Strong hire. Oregon is fine."],
      sent: "2025-10-29", signed: "2025-11-03" },
    { candidate: "Keisha Ambrose", location: "US-NY", pay: 96000, currency: "USD", start: "2025-12-01", created: "2025-11-04", sent: "2025-11-05", signed: "2025-11-10" },
    { candidate: "Beatriz Antunes", location: "PT", pay: 5900, currency: "EUR", start: "2026-01-05", created: "2025-11-24", sent: "2025-11-25", signed: "2025-12-02" },
    { candidate: "Arjun Mehta", location: "US-CO", pay: 158000, currency: "USD", start: "2026-01-12", created: "2025-12-01", by: "p-001",
      approval: ["2025-12-03", "p-002", "approved", "above_band", "Matches his competing offer. Holds at 158k until the first review."],
      sent: "2025-12-04", signed: "2025-12-09" },
    { candidate: "Simone Battaglia", location: "US-GA", pay: 104000, currency: "USD", start: "2026-02-16", created: "2026-01-12",
      approval: ["2026-01-13", "p-001", "approved", "new_location", "Fine to hire in GA."],
      sent: "2026-01-14", closed: ["2026-01-21", "declined"] },
    { candidate: "Tyler Ruggiero", location: "US-NC", pay: 101000, currency: "USD", start: "2026-03-02", created: "2026-01-29",
      approval: ["2026-01-30", "p-001", "approved", "new_location", "North Carolina is fine. Good luck to him."],
      sent: "2026-01-30", signed: "2026-02-04" },
    { candidate: "Hana Yoshida", location: "US-OR", pay: 88000, currency: "USD", start: "2026-03-16", created: "2026-02-09", sent: "2026-02-10", signed: "2026-02-16" },
    { candidate: "Martín Quiroga", location: "AR", pay: 4600, currency: "USD", start: "2026-04-06", created: "2026-03-02", sent: "2026-03-03", signed: "2026-03-10" },
    { candidate: "Camille Dufresne", location: "US-NY", pay: 142000, currency: "USD", start: "2026-05-04", created: "2026-03-23", sent: "2026-03-24", signed: "2026-03-31" },
    { candidate: "Wesley Park", location: "US-CO", pay: 176000, currency: "USD", start: "2026-05-11", created: "2026-04-06", sent: "2026-04-07", closed: ["2026-04-14", "declined"] },
    { candidate: "Deshawn Pruitt", location: "US-TX", pay: 168000, currency: "USD", start: "2026-06-01", created: "2026-04-27", sent: "2026-04-28", signed: "2026-05-05" },
    { candidate: "Joelle Marchetti", location: "US-NY", pay: 168000, currency: "USD", start: "2026-06-15", created: "2026-05-11",
      approval: ["2026-05-12", "p-002", "declined", "above_band", "18k over the top of the band. Not this cycle."],
      closed: ["2026-05-19", "withdrawn"] },
    { candidate: "Zofia Mazur", location: "PL", pay: 24000, currency: "PLN", start: "2026-07-01", created: "2026-05-25", sent: "2026-05-26", signed: "2026-06-02" },
    { candidate: "Rosa Delgado", location: "US-NC", pay: 84000, currency: "USD", start: "2026-07-13", created: "2026-06-08", sent: "2026-06-09", signed: "2026-06-15" },
    { candidate: "Anders Kjelstad", location: "US-MN", pay: 162000, currency: "USD", start: "2026-09-08", created: "2026-07-27",
      approval: ["2026-07-28", "p-001", "approved", "new_location", "Minnesota approved."],
      sent: "2026-07-29", signed: "2026-08-04" },
    { candidate: "Brianna Coffey", location: "US-TX", pay: 99000, currency: "USD", start: "2026-10-19", created: "2026-09-22", sent: "2026-09-24" },
    { candidate: "Malik Danforth", location: "US-WA", pay: 228000, currency: "USD", start: "2026-11-02", created: "2026-09-28" },
    { candidate: "Priyanka Iyer", location: "US-NY", pay: 128000, currency: "USD", start: "2026-10-26", created: "2026-09-28", sent: "2026-09-29" },
  ];

  const offers: Row[] = [];
  const approvals: Row[] = [];
  plans.forEach((plan, i) => {
    const id = i + 1;
    const candidate = candidates.find((c) => c.id === candidateId(plan.candidate))!;
    const opening = openings.find((o) => o.id === candidate.opening_id)!;
    const by = plan.by ?? OPS;
    const status = plan.closed?.[1] ?? (plan.signed ? "signed" : plan.sent ? "sent" : "draft");
    offers.push({
      id, candidate_id: candidate.id, opening_id: opening.id, role: opening.title, team: opening.team,
      level: opening.level, band_id: opening.band_id, location: plan.location, worker_type: opening.worker_type,
      pay_amount: plan.pay, pay_currency: plan.currency, pay_period: opening.worker_type === "employee" ? "annual" : "monthly",
      start_date: plan.start, status, sent_on: plan.sent ?? null, signed_on: plan.signed ?? null,
      closed_on: plan.closed?.[0] ?? null, created_by: by, created_on: plan.created,
    });
    session(plan.created)(by, "offer.created", "offer", id);
    if (plan.approval) {
      const [decided_on, approver_id, decision, reasons, note] = plan.approval;
      approvals.push({ id: approvals.length + 1, offer_id: id, approver_id, reasons, decision, note, decided_on });
      session(decided_on)(approver_id, `approval.${decision}`, "offer", id, reasons);
    }
    if (plan.sent) session(plan.sent)(OPS, "offer.sent", "offer", id);
    if (plan.signed) session(plan.signed)(OPS, "offer.signed", "offer", id, `start ${plan.start}`);
    if (plan.closed) session(plan.closed[0])(OPS, `offer.${plan.closed[1]}`, "offer", id);
  });

  // People created from signed offers: [offer id, created on, work email].
  const hires: [number, string, string][] = [
    [1, "2025-11-12", "elliot"],
    [2, "2025-11-20", "keisha"],
    [3, "2025-12-15", "beatriz.antunes"],
    [4, "2026-01-05", "arjun"],
    [6, "2026-02-23", "tyler"],
    [7, "2026-03-09", "hana"],
    [8, "2026-03-30", "martin.quiroga"],
    [9, "2026-04-27", "camille"],
    [11, "2026-06-06", "deshawn"],
    [13, "2026-06-18", "zofia.mazur"],
    [14, "2026-07-06", "rosa"],
    [15, "2026-09-02", "anders"],
  ];
  // done_on by [person, step]; null leaves the step open.
  const lateSteps: Record<string, string | null> = {
    "p-024|State withholding form received": "2026-03-19",
    "p-029|W-8BEN received": "2026-07-27",
    "p-027|State withholding form received": null,
  };
  const newStates: Record<string, [string, string, string, string, string]> = {
    // location: [deadline set on, deadline, status set on, status, account reference set too]
    "US-OR": ["2025-11-14", "2025-12-05", "2025-12-19", "registered", "yes"],
    "US-NC": ["2026-02-25", "2026-03-27", "2026-03-20", "registered", "no"],
    "US-MN": ["2026-09-04", "2026-09-14", "2026-09-22", "in_progress", "yes"],
  };

  const onboarding_steps: Row[] = [];
  hires.forEach(([offerId, createdOn, local], i) => {
    const offer = offers.find((o) => o.id === offerId)!;
    const opening = openings.find((o) => o.id === offer.opening_id)!;
    const id = `p-${String(20 + i).padStart(3, "0")}`;
    const start = offer.start_date as string;
    const log = session(createdOn);
    people.push({
      id, name: plans[offerId - 1].candidate, email: `${local}@${DOMAIN}`, role: "staff", worker_type: offer.worker_type,
      title: offer.role, team: offer.team, location: offer.location, manager_id: opening.hiring_manager_id,
      offer_id: offerId, start_date: start, end_date: null,
      identifier_last4: id === "p-030" ? null : digits(4), token: token(), created_on: createdOn, created_by: OPS,
    });
    log(OPS, "person.created", "person", id, `offer ${offerId}`);
    if (!workplaces.some((w) => w.location === offer.location)) {
      const [deadlineOn, deadline, statusOn, status, withRef] = newStates[offer.location as string];
      workplaces.push({
        location: offer.location, first_hire_date: start, registration_status: status, registration_deadline: deadline,
        deadline_set_on: deadlineOn,
        status_set_on: statusOn, account_ref_last4: withRef === "yes" ? digits(4) : null, created_on: createdOn,
        entered_by: OPS,
      });
      log(OPS, "workplace.created", "workplace", offer.location as string, "not_started");
      session(deadlineOn)(OPS, "workplace.updated", "workplace", offer.location as string, "registration_deadline");
      session(statusOn)(OPS, "workplace.updated", "workplace", offer.location as string,
        withRef === "yes" ? "registration_status,account_reference" : "registration_status");
    }
    if (people.at(-1)!.identifier_last4) log(OPS, "identifier.set", "person", id);

    const owners: Record<string, string> = { ops: OPS, "engineer-admin": "p-004", manager: opening.hiring_manager_id as string };
    for (const [step, owner, offset] of ONBOARDING_STEPS[offer.worker_type as "employee" | "contractor"]) {
      const due = addDays(start, offset);
      const key = `${id}|${step}`;
      let done: string | null = null;
      if (key in lateSteps) done = lateSteps[key];
      else if (due <= LAST_DAY) {
        done = onWeekday(addDays(due, int(-2, 2)));
        if (done <= createdOn) done = onWeekday(addDays(createdOn, int(1, 2)));
        if (done > LAST_DAY) done = LAST_DAY;
      }
      onboarding_steps.push({ id: onboarding_steps.length + 1, person_id: id, step, owner_id: owners[owner], due_on: due, done_on: done });
      if (done) session(done)(owners[owner], "onboarding.done", "onboarding_step", onboarding_steps.length);
      if (done && step === "I-9 section 2 completed" && people.at(-1)!.identifier_last4) {
        session(done)(OPS, "identifier.read", "person", id);
      }
    }
  });

  const agreementRows: [string, string, number, string, number, string, string, string | null, string][] = [
    ["p-014", "PT", 6400, "EUR", 1, "contracts/2025-10-renewal/carvalho-ines.pdf", "2025-10-01", null, TRACKER_START],
    ["p-015", "PT", 5600, "EUR", 3, "contracts/2025-10-renewal/mendonca-rui.pdf", "2025-10-06", null, TRACKER_START],
    ["p-016", "PL", 26000, "PLN", 5, "contracts/2025-10-renewal/wilk-katarzyna.pdf", "2025-10-13", null, "2025-10-13"],
    ["p-017", "PL", 23500, "PLN", 5, "contracts/2025-10-renewal/zielinski-pawel.pdf", "2025-10-01", "2026-05-31", TRACKER_START],
    ["p-018", "AR", 5200, "USD", 2, "contracts/2025-10-renewal/rios-valentina.pdf", "2025-10-20", null, "2025-10-20"],
    ["p-019", "CA", 9800, "CAD", 1, "contracts/2025-10-renewal/arsenault-liam.pdf", "2025-10-27", null, "2025-10-27"],
    ["p-022", "PT", 5900, "EUR", 3, "contracts/2026-01/antunes-beatriz.pdf", "2026-01-05", null, "2025-12-15"],
    ["p-026", "AR", 4600, "USD", 2, "contracts/2026-04/quiroga-martin.pdf", "2026-04-06", null, "2026-03-30"],
    ["p-029", "PL", 24000, "PLN", 5, "contracts/2026-07/mazur-zofia.pdf", "2026-07-01", null, "2026-06-18"],
  ];
  const contractor_agreements: Row[] = agreementRows.map(
    ([person_id, country, rate, currency, invoice_day, document_ref, starts_on, ends_on, enteredOn], i) => {
      (enteredOn === TRACKER_START ? firstDay : session(enteredOn))(OPS, "agreement.created", "contractor_agreement", i + 1, person_id);
      return { id: i + 1, person_id, country, rate, currency, invoice_day, document_ref, starts_on, ends_on, entered_by: OPS };
    },
  );

  // amount by [person, month], where it differs from the agreement's rate.
  const amounts: Record<string, number> = {
    "p-022|2026-01": 5139,
    "p-026|2026-04": 3833,
    "p-016|2025-11": 28600,
    "p-014|2025-12": 5120,
  };
  const timing: Record<string, [string, string, string | null]> = {
    // [received, entered, paid] by [person, month]
    "p-019|2025-12": ["2026-01-03", "2026-01-12", "2026-01-15"],
    "p-016|2026-03": ["2026-04-01", "2026-04-20", "2026-04-22"],
    "p-018|2026-06": ["2026-07-02", "2026-07-09", "2026-07-14"],
    "p-018|2026-02": ["2026-03-02", "2026-03-03", "2026-04-10"],
    "p-015|2026-08": ["2026-09-03", "2026-09-04", null],
    "p-014|2026-04": ["2026-05-01", "2026-05-03", "2026-05-06"],
  };
  const skipped = new Set(["p-019|2026-08"]);

  const contractor_invoices: Row[] = [];
  for (const a of contractor_agreements) {
    const last = ((a.ends_on as string | null) ?? "2026-08-31").slice(0, 7);
    for (let m = (a.starts_on as string).slice(0, 7); m <= last; m = nextMonth(m)) {
      const key = `${a.person_id}|${m}`;
      if (skipped.has(key)) continue;
      let received: string, entered: string, paid: string | null;
      if (timing[key]) [received, entered, paid] = timing[key];
      else {
        received = addDays(monthEnd(m), int(0, 3));
        entered = onWeekday(addDays(received, int(0, 2)));
        paid = onWeekday(addDays(entered, int(2, 7)));
      }
      contractor_invoices.push({
        id: 0, person_id: a.person_id, month: m, amount: amounts[key] ?? a.rate, currency: a.currency,
        received_on: received, paid_on: paid, entered_on: entered, entered_by: OPS,
      });
    }
  }
  contractor_invoices.sort((x, y) => `${x.entered_on}${x.person_id}`.localeCompare(`${y.entered_on}${y.person_id}`));
  contractor_invoices.forEach((inv, i) => {
    inv.id = i + 1;
    session(inv.entered_on as string)(OPS, "invoice.entered", "contractor_invoice", i + 1, `${inv.person_id} ${inv.month}`);
    if (inv.paid_on) session(inv.paid_on as string)(OPS, "invoice.paid", "contractor_invoice", i + 1);
  });

  for (const [location, readOn] of [["US-OR", "2026-01-15"], ["US-MN", "2026-09-24"], ["US-TX", "2026-06-12"]]) {
    session(readOn)(OPS, "account_reference.read", "workplace", location);
  }
  for (let m = "2025-11"; m <= "2026-09"; m = nextMonth(m)) {
    for (const [report, minute] of [["registrations", 420], ["invoices", 421]] as const) {
      audit.push({ at: `${m}-01T${time(minute)}`, actor: "monthly-close", action: "report.run", entity: "report", entity_id: report, detail: `as of ${m}-01` });
    }
  }

  audit.sort((x, y) => (x.at as string).localeCompare(y.at as string));
  const audit_log = audit.map((entry, i) => ({ id: i + 1, ...entry }));

  const tables: Record<string, Row[]> = {
    system_actors, people, pay_bands, openings, candidates, offers, approvals, workplaces,
    contractor_agreements, contractor_invoices, onboarding_steps, audit_log,
  };
  const body = Object.entries(tables)
    .map(([name, rows]) => `  "${name}": [\n${rows.map((r) => `    ${JSON.stringify(r)}`).join(",\n")}\n  ]`)
    .join(",\n");
  return `{\n${body}\n}\n`;
}

export const SEED_PATH = join(import.meta.dirname, "..", "data", "seed.json");

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  writeFileSync(SEED_PATH, buildSeed());
  console.log(`wrote ${SEED_PATH}`);
}
