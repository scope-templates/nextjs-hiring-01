const ROLE_CHECK = "('founder', 'ops', 'hiring-manager', 'engineer-admin', 'staff')";

export const SCHEMA = `
CREATE TABLE IF NOT EXISTS system_actors (
  name TEXT PRIMARY KEY,
  role TEXT NOT NULL CHECK (role IN ${ROLE_CHECK}),
  description TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  role TEXT NOT NULL CHECK (role IN ${ROLE_CHECK}),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('employee', 'contractor')),
  title TEXT NOT NULL,
  team TEXT NOT NULL,
  location TEXT NOT NULL,
  manager_id TEXT REFERENCES people(id),
  offer_id INTEGER UNIQUE REFERENCES offers(id),
  start_date TEXT NOT NULL,
  end_date TEXT,
  identifier_last4 TEXT CHECK (identifier_last4 IS NULL OR length(identifier_last4) = 4),
  token TEXT NOT NULL UNIQUE,
  created_on TEXT NOT NULL,
  created_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS pay_bands (
  id TEXT PRIMARY KEY,
  track TEXT NOT NULL,
  level INTEGER NOT NULL,
  floor_usd INTEGER NOT NULL,
  ceiling_usd INTEGER NOT NULL,
  CHECK (floor_usd < ceiling_usd)
);

CREATE TABLE IF NOT EXISTS openings (
  id INTEGER PRIMARY KEY,
  title TEXT NOT NULL,
  team TEXT NOT NULL,
  level INTEGER NOT NULL,
  band_id TEXT REFERENCES pay_bands(id),
  worker_type TEXT NOT NULL CHECK (worker_type IN ('employee', 'contractor')),
  hiring_manager_id TEXT NOT NULL REFERENCES people(id),
  opened_on TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'filled', 'closed'))
);

CREATE TABLE IF NOT EXISTS candidates (
  id INTEGER PRIMARY KEY,
  opening_id INTEGER NOT NULL REFERENCES openings(id),
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  added_on TEXT NOT NULL,
  added_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS offers (
  id INTEGER PRIMARY KEY,
  candidate_id INTEGER NOT NULL REFERENCES candidates(id),
  opening_id INTEGER NOT NULL REFERENCES openings(id),
  role TEXT NOT NULL,
  team TEXT NOT NULL,
  level INTEGER NOT NULL,
  band_id TEXT REFERENCES pay_bands(id),
  location TEXT NOT NULL,
  worker_type TEXT NOT NULL CHECK (worker_type IN ('employee', 'contractor')),
  pay_amount INTEGER NOT NULL CHECK (pay_amount > 0),
  pay_currency TEXT NOT NULL,
  pay_period TEXT NOT NULL CHECK (pay_period IN ('annual', 'monthly')),
  start_date TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('draft', 'sent', 'signed', 'declined', 'withdrawn')),
  sent_on TEXT,
  signed_on TEXT,
  closed_on TEXT,
  created_by TEXT NOT NULL,
  created_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id INTEGER PRIMARY KEY,
  offer_id INTEGER NOT NULL REFERENCES offers(id),
  approver_id TEXT NOT NULL REFERENCES people(id),
  reasons TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('approved', 'declined')),
  note TEXT,
  decided_on TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workplaces (
  location TEXT PRIMARY KEY,
  first_hire_date TEXT NOT NULL,
  registration_status TEXT NOT NULL
    CHECK (registration_status IN ('not_started', 'in_progress', 'registered', 'not_required')),
  registration_deadline TEXT,
  deadline_set_on TEXT,
  status_set_on TEXT NOT NULL,
  account_ref_last4 TEXT CHECK (account_ref_last4 IS NULL OR length(account_ref_last4) = 4),
  created_on TEXT NOT NULL,
  entered_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contractor_agreements (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  country TEXT NOT NULL,
  rate INTEGER NOT NULL CHECK (rate > 0),
  currency TEXT NOT NULL,
  invoice_day INTEGER NOT NULL CHECK (invoice_day BETWEEN 1 AND 28),
  document_ref TEXT NOT NULL,
  starts_on TEXT NOT NULL,
  ends_on TEXT,
  entered_by TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS contractor_invoices (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  month TEXT NOT NULL,
  amount INTEGER NOT NULL CHECK (amount > 0),
  currency TEXT NOT NULL,
  received_on TEXT NOT NULL,
  paid_on TEXT,
  entered_on TEXT NOT NULL,
  entered_by TEXT NOT NULL,
  UNIQUE (person_id, month)
);

CREATE TABLE IF NOT EXISTS onboarding_steps (
  id INTEGER PRIMARY KEY,
  person_id TEXT NOT NULL REFERENCES people(id),
  step TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES people(id),
  due_on TEXT NOT NULL,
  done_on TEXT
);

CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  at TEXT NOT NULL,
  actor TEXT NOT NULL,
  action TEXT NOT NULL,
  entity TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  detail TEXT
);

CREATE TRIGGER IF NOT EXISTS audit_log_actor_known BEFORE INSERT ON audit_log
WHEN NOT EXISTS (SELECT 1 FROM people WHERE id = NEW.actor)
 AND NOT EXISTS (SELECT 1 FROM system_actors WHERE name = NEW.actor)
BEGIN
  SELECT RAISE(ABORT, 'audit_log actor must be a person or a system actor');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_replace BEFORE INSERT ON audit_log
WHEN EXISTS (SELECT 1 FROM audit_log WHERE id = NEW.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS people_keep_audited BEFORE DELETE ON people
WHEN EXISTS (SELECT 1 FROM audit_log WHERE actor = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log names this person');
END;

CREATE TRIGGER IF NOT EXISTS people_keep_audited_id BEFORE UPDATE OF id ON people
WHEN NEW.id <> OLD.id AND EXISTS (SELECT 1 FROM audit_log WHERE actor = OLD.id)
BEGIN
  SELECT RAISE(ABORT, 'audit_log names this person');
END;

CREATE TRIGGER IF NOT EXISTS system_actors_keep_audited BEFORE DELETE ON system_actors
WHEN EXISTS (SELECT 1 FROM audit_log WHERE actor = OLD.name)
BEGIN
  SELECT RAISE(ABORT, 'audit_log names this system actor');
END;

CREATE TRIGGER IF NOT EXISTS system_actors_keep_audited_name BEFORE UPDATE OF name ON system_actors
WHEN NEW.name <> OLD.name AND EXISTS (SELECT 1 FROM audit_log WHERE actor = OLD.name)
BEGIN
  SELECT RAISE(ABORT, 'audit_log names this system actor');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_update BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;

CREATE TRIGGER IF NOT EXISTS audit_log_no_delete BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only');
END;
`;
