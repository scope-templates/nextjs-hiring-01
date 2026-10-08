# Hiring Board

Ostrander Labs makes Fillwatch, monitoring software for independent pharmacies. We are thirty people, remote-first,
with employees in six states and eight contractors in four countries. Hiring Board is the small service one of our
engineers built to keep our hiring in one place: openings and candidates, offers and the founder approvals they need,
new hires and their onboarding checklists, the states and countries we employ people in, and contractor agreements
and monthly invoices. Our ops lead and the two co-founders use it every day, hiring managers follow their own openings
in it, and every new hire works through their own checklist here. Every person in it was entered by the ops lead,
from the signed offer for anyone hired since October 2025 and from the hiring spreadsheet for everyone before.

## What is in it

| Table | What it keeps |
| --- | --- |
| `people` | Everyone on staff or under contract: role, team, work state or country, manager, start and end dates, the last four characters of their identifier, their sign-in token |
| `pay_bands` | Annual USD floor and ceiling per track and level |
| `openings`, `candidates` | Open roles, their hiring manager and band, and the candidates for each |
| `offers` | Role, team, level, band, work state or country, employee or contractor, pay, start date, status, sent and signed dates |
| `approvals` | A founder's decision on an offer, with the reasons it needed one |
| `workplaces` | Each US state or country we have hired in: first hire date, registration status, deadline and the date the deadline was set, the last four characters of the state account reference, when it was created and who entered it |
| `contractor_agreements` | Country, monthly rate and currency, invoice day, the signed agreement's document reference |
| `contractor_invoices` | Contractor, month, amount, currency, received, paid, and when it was entered |
| `onboarding_steps` | Each new hire's checklist: step, owner, due date, done date |
| `audit_log` | Append-only record of every change and every read of an identifier or account reference, each naming its actor; a person or system actor it names cannot be deleted or renamed |
| `system_actors` | Named non-person actors with a role; `monthly-close` (ops) runs the two monthly lists and nothing else |

Every request carries the person's token as `Authorization: Bearer <token>`; the pages use a `session` cookie set by
signing in with the token on the home page. Ops receives a new hire's token once, in the response that creates them.
System actors have no token and never act over HTTP; in code they are refused everything but the two monthly lists
(`system_actor`), and the scripts refuse a name that is neither a person nor a system actor (`unknown_actor`). A
person can act through their last day and not after. Refusals come back as `{ "error": <code>, "message": ... }`.

| Route | What it does | What it refuses |
| --- | --- | --- |
| `GET /api/session` | The current actor | `no_token`; `bad_token` (also for an `Authorization` header that is not `Bearer <token>`, whatever the cookie says); `actor_left` (end date passed) |
| `POST /api/session` | Takes a form field `token` and sets the `session` cookie | `no_token`; `bad_token`; `actor_left` |
| `GET /api/pay-bands` | Bands | `forbidden` outside founder and ops |
| `GET /api/openings`, `GET /api/candidates` | Openings and candidates; a hiring manager gets their own, without band | `forbidden` for engineer-admin and staff |
| `POST /api/candidates` | Adds a candidate (founder, ops, or a hiring manager on their own opening) | engineer-admin and staff; another manager's opening; `opening_not_open` |
| `GET /api/offers`, `GET /api/offers/:id` | Offers; a hiring manager gets their own openings' offers without pay | another manager's offer; engineer-admin and staff |
| `POST /api/offers` | Draft offer from a candidate (founder, ops) | anyone else; `opening_not_open`; an employee outside a US state (`US-XX`) or paid in anything but USD; a contractor in the US |
| `POST /api/offers/:id/approve` | A founder's `approved` or `declined` | anyone but a founder; the offer's creator (`own_offer`); the opening's hiring manager (`own_opening`); offers past draft (`not_draft`) |
| `POST /api/offers/:id/send` | Marks a draft sent | `not_draft`; `approval_required` when pay is above the band's ceiling or the state or country has no workplace row, until the latest founder decision is `approved` |
| `POST /api/offers/:id/sign` | Records the signed date and start date | `not_sent`; `signed_before_sent`; `start_before_signed` |
| `POST /api/offers/:id/decline`, `/withdraw` | Closes an offer: decline from sent, withdraw from draft or sent | `bad_transition` from any other status |
| `GET /api/people`, `POST /api/people` | People; ops creates one from a signed offer and confirms the start date, which adds the onboarding checklist, marks the opening filled and, for the first hire in a state or country, adds a workplace row (`not_started` for a state, `not_required` for a country) | `offer_not_signed`; `start_before_signed`; `already_exists` (a second person for one offer); `no_owner` (nobody holds a role a checklist step needs); anyone but ops |
| `GET`/`PUT /api/people/:id/identifier` | Reads or sets the last four characters | anyone but ops; `too_short` (fewer than four characters); every read is logged |
| `GET /api/workplaces`, `PATCH /api/workplaces/:location` | Workplaces (founder, ops); ops sets status, deadline and account reference | anyone but ops writing; `too_short` |
| `GET /api/workplaces/:location/account-reference` | The last four characters | anyone but ops; every read is logged |
| `GET`/`POST /api/contractor-agreements` | Agreements and rates; ops adds one, with an invoice day from 1 to 28 | reading outside founder and ops; writing outside ops; `not_contractor`; an invoice day outside 1–28 |
| `GET`/`POST /api/contractor-invoices`, `PATCH /api/contractor-invoices/:id` | Invoices, entered by ops; `PATCH` records the paid date | anyone but ops writing; `already_exists` (a second invoice for a month); `no_agreement`; `currency_mismatch`; `paid_before_received`; `already_paid` |
| `GET /api/onboarding`, `PATCH /api/onboarding/:id` | Checklists; a step is marked done by its owner or ops | anyone else marking it; `already_done` |
| `GET /api/audit` | Latest 500 entries, filtered by `entity` and `entity_id` | staff and hiring managers |

## Roles

| Role | Sees | Does |
| --- | --- | --- |
| founder | Everything except identifiers and account references, including pay bands and contractor rates | Drafts, sends and records offers; approves or declines other people's offers |
| ops | Everything, including identifiers and account references (each read is logged) | Drafts, sends and records offers; creates people; keeps workplaces, agreements and invoices; marks any step done |
| hiring-manager | Their own openings, candidates and offers, without pay; their own checklist and the steps they own; the people list | Adds candidates to their openings; marks their steps done |
| engineer-admin | The people list, every onboarding checklist, the audit log | Marks their steps done (laptops, work accounts) |
| staff | Their own onboarding checklist | Marks done any step they own |

## Running locally

Needs Node 22.

```
npm ci
npm run build
npm start
```

The app listens on http://localhost:3000. The store is the SQLite file `hiring.db` in the project folder (set
`HIRING_DB` for another path); on the first start with an empty store it loads `data/seed.json`. `npm run dev` runs
the development server.

```
curl -H "Authorization: Bearer 7e80a4a4f1a90638716cf60b539e4d2e" http://localhost:3000/api/offers
```

The two monthly lists run as `monthly-close` and add a `report.run` entry to the audit log:

```
npm run registrations
npm run invoices
```

`registrations` lists workplaces whose registration deadline has passed, or has no deadline set, without a completed
status (`registered` or `not_required`). `invoices` lists contractor months with no invoice received by the agreement's
invoice day of the following month, and months whose invoice is received and unpaid. Both take
`-- --as-of YYYY-MM-DD` (default today) and show the lists as they stood that day: a status and a deadline count from
the dates they were set, and an invoice from its received and paid dates.

## Tests

```
npm test
```

Vitest, server code only. The HTTP route tests share one in-memory store loaded from the seed; every other test opens
its own.

## The data

`data/seed.json` covers October 2025 through September 2026: 31 people (one contractor has left), 17 openings, 31
candidates, 18 offers, 6 approvals, 10 workplaces, 9 contractor agreements, 77 contractor invoices, 78 onboarding
steps and 434 audit entries. It is written by `scripts/generate-seed.ts` from a fixed random seed; `npm run
seed:generate` rewrites the same bytes, and a test checks the committed file against the generator.
