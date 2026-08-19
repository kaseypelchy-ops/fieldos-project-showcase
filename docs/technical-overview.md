# FieldOS Technical Overview

## Introduction

FieldOS is a production field-sales operations platform built around a practical requirement: representatives, operations staff, vendors, and management needed a shared operational system rather than disconnected spreadsheets, maps, manual schedules, and ad-hoc reporting.

The system spans the full field-to-lifecycle path:

```text
Address → Field Activity → Pricing → Sale → Appointment → Review → Invoice → Lifecycle Validation
```

This document focuses on the engineering patterns used to make that workflow reliable. Exact private schemas, credentials, customer data, proprietary pricing, vendor configuration, and internal endpoints are omitted.

---

# 1. Technology Stack

The current production front end is primarily **HTML, CSS, and vanilla JavaScript**, with PostgreSQL/Supabase providing shared operational state and Vercel serverless functions providing trusted integration boundaries.

| Layer | Technology | Primary Responsibility |
|---|---|---|
| Field client | HTML / CSS / JavaScript | Map, forms, dispositions, pricing, scheduling, offline state |
| Dashboards | HTML / CSS / JavaScript | Operational and management interfaces |
| Database | PostgreSQL | Shared transactional and operational state |
| Managed backend | Supabase | PostgreSQL access, Realtime, authentication services |
| Database logic | SQL / PL/pgSQL / RPC | Transactions, validation, reporting logic |
| Hosting/runtime | Vercel | Static application delivery and serverless endpoints |
| Realtime | Supabase Realtime | Cross-client change notifications |
| Mapping | Leaflet | Service locations and territory boundaries |
| Visualization | Chart.js | Operational charts and trends |
| Offline/PWA | Service worker + browser storage | Caching, drafts, queueing, version coordination |
| Email | Node.js / Nodemailer / SMTP | Transactional confirmation messages |
| Integrations | Webhooks / REST / warehouse validation | Controlled external workflows |

---

# 2. Design Philosophy

FieldOS is organized around business workflows rather than raw tables.

A representative thinks:

> Which addresses should I work, what happened here before, what offer is approved, and when can the customer be installed?

Operations thinks:

> Which submitted sales need action, which are installed, which are invoice-ready, and which are exceptions?

Management thinks:

> How are teams and territories performing, where is capacity constrained, and where are the follow-up opportunities?

The application translates those questions into structured data and controlled state changes.

---

# 3. Functional Domains

## Field operations

- representative/territory assignment
- address retrieval
- map-based service-location work
- dispositions
- activity history
- follow-up tracking

## Customer/sales capture

- customer information
- partial attempt autosave
- approved package/promotion selection
- installation availability
- completed sale submission

## Pricing

- centrally configured offers
- territory/team/date scoping
- phased internet pricing
- phased equipment/recurring charges
- disclosure text
- historical offer snapshot

## Scheduling

- territory/date/time capacity
- shared booking state
- realtime refresh
- transaction-time capacity enforcement

## Post-sale operations

- review queues
- CRM/order-entry tracking
- installation outcomes
- cancellation/reschedule
- invoicing
- adjustments/clawbacks
- lifecycle validation

## Reporting / administration

- team/company dashboards
- management metrics
- people/territory administration
- boundary management
- pricing administration
- data-quality review
- audit history

---

# 4. Operational Surfaces, Not Framework Components

The production application is divided into **focused operational surfaces and functional modules**, not React-style UI components.

Conceptually:

```text
FieldOS
├── Representative Field App
├── Team Dashboard
├── Company Sales Dashboard
├── Executive / Management View
├── Sales Review
├── Pricing Administration
├── Live Activity
├── Setup / Territory Administration
└── Serverless Integration Endpoints
```

This keeps high-frequency workflows direct while still sharing the same operational data model.

---

# 5. Address-Centered Data Model

The service location is the core operational anchor.

A conceptual relationship:

```text
Representative ──< Territory Assignment >── Territory
                                          │
                                          v
                                  Service Location
                                   /      |      \
                                  v       v       v
                            Activity   Partial   Completed
                             Events    Attempts    Sales
                                              │
                                              v
                                         Appointment
                                              │
                                              v
                                      Review / Financial
```

An external location identifier provides a stable integration key for downstream systems when address formatting differs.

---

# 6. Append-Style Activity vs. Mutable Status

Field activity is most useful when history remains visible.

Rather than treating “current address status” as the only record, FieldOS records activity events so the system can answer:

- what happened,
- who performed it,
- when it happened,
- what the previous interaction was,
- whether the latest state is pending local sync,
- whether the address later converted to a sale.

This event history supports both rep context and management reporting.

---

# 7. Transactional Sale Submission

A completed sale affects shared records that should succeed or fail together.

The client constructs one payload with concepts such as:

```json
{
  "client_submission_id": "uuid",
  "location_id": "uuid",
  "appointment_slot_id": "uuid",
  "representative_id": "uuid",
  "customer": {},
  "package": {},
  "offer_snapshot": {},
  "outcome": {}
}
```

A database transaction validates the request and returns authoritative identifiers/capacity.

### Why client submission IDs matter

Mobile networks can fail after the database commits but before the browser receives the response. Retrying with the same idempotency key allows the server to recognize the original submission rather than create a duplicate.

See [`../examples/transactional-sale-client.js`](../examples/transactional-sale-client.js).

---

# 8. Shared Installation Capacity

Installation availability is not static form data. It is a shared resource.

The UI may display:

```text
capacity = 4
claimed  = 3
openings = 1
```

but another representative can claim the last opening before the current user submits.

The architecture therefore uses two layers:

1. **Realtime/polling** for fast user feedback.
2. **Database validation** at booking time for correctness.

The second layer is authoritative.

See [`../examples/realtime-schedule-sync.js`](../examples/realtime-schedule-sync.js).

---

# 9. Realtime + Reconciliation

Realtime alone is not reliable enough for a mobile field app.

Reasons include:

- phone sleep,
- background-tab throttling,
- weak cellular connections,
- websocket channel closure,
- missed events during reconnect.

FieldOS therefore treats Realtime as the primary notification path while also using:

- lightweight polling,
- debounced refreshes,
- serialized refresh execution,
- `visibilitychange`,
- window focus,
- reconnect refresh.

The goal is not “every event must arrive.” The goal is **the UI converges back to authoritative database state quickly**.

---

# 10. Offline Queue

The browser queue stores eligible operations that cannot reach the database.

A queue item can contain:

```json
{
  "id": "local-id",
  "type": "rpc",
  "operation": "...",
  "payload": {},
  "created_at": "timestamp",
  "attempts": 0,
  "last_error": null
}
```

### Connectivity classification

The client does not queue every error. A failed validation or permission check is not equivalent to weak cellular service.

This distinction prevents misleading states such as telling the rep “saved offline” when the database would reject the payload even with perfect connectivity.

See [`../examples/offline-sync-queue.js`](../examples/offline-sync-queue.js).

---

# 11. Partial Sale Capture

Partial sale capture is intentionally separated from completed sales.

### Local-first behavior

Meaningful fields can be stored immediately on the device. Database persistence is debounced so every keystroke does not create a network request.

### Progress model

Conceptual stages include:

| Stage | Meaning |
|---|---|
| `started` | Interaction session exists |
| `customer_info` | Customer/name/note information entered |
| `contact_captured` | Phone or email captured |
| `package_selected` | Offer selection reached |
| `install_selected` | Scheduling step reached |

### Final state

An attempt becomes either `abandoned` or `converted`.

Separating these records protects:

- sales totals,
- close-rate calculations,
- install capacity,
- review queues,
- invoice counts,
- vendor payment calculations.

See [`../examples/partial-sale-capture.js`](../examples/partial-sale-capture.js).

---

# 12. Pricing & Promotion Engine

Approved offers are loaded from the operational data layer rather than duplicated across UI and email templates.

A normalized offer can include:

- `package_key`,
- `package_name`,
- `speed_label`,
- `promo_display`,
- `promo_term_label`,
- `standard_rate_label`,
- promotional internet phases,
- recurring/equipment charges,
- team/territory scope,
- active dates,
- priority,
- disclosure.

### Internet phases

```json
[
  { "month_start": 1, "month_end": 12, "internet_price": 49.99 },
  { "month_start": 13, "month_end": null, "internet_price": 89.99 }
]
```

Values are illustrative public examples and are not production pricing.

### Equipment phases

A recurring device can have a different amount during and after the promotion.

### Offer snapshot

At submission, the client builds a normalized `offer_snapshot` containing the exact pricing context used for the sale.

That prevents current configuration from rewriting historical customer terms.

See [`../examples/pricing-offer-snapshot.js`](../examples/pricing-offer-snapshot.js).

---

# 13. Promotion Consistency

One important reliability rule is:

> The representative quote, saved sale snapshot, calculated recurring total, and customer confirmation should describe the same approved offer.

A drift bug can occur if a human-readable promotion says one amount while a stale phase array calculates another. The production system includes normalization/defensive checks so the calculation model and displayed promotion cannot silently diverge.

The broader lesson is that promotional text should not be treated as a substitute for structured pricing data—and structured data should not be allowed to contradict the customer-facing offer unnoticed.

---

# 14. Customer Confirmation Webhook

The customer email workflow uses a serverless endpoint because it needs server-only credentials.

### Webhook validation

Requests are authenticated using a server-side secret.

### Idempotent reservation

The endpoint conditionally transitions:

```text
pending → sending
```

before contacting SMTP. If another request already changed the state, the duplicate request stops.

### Persisted order reload

Before building the message, the endpoint re-reads the sale from the operational database. This ensures it uses the persisted `offer_snapshot` rather than trusting an incomplete webhook payload.

### Message pricing

The persisted snapshot is the primary source for package, promotion, term, phased pricing, recurring charges, totals, and disclosure.

See [`../examples/sale-confirmation-webhook.js`](../examples/sale-confirmation-webhook.js).

---

# 15. PWA / Version Coordination

The field app uses a service worker for PWA behavior and offline-friendly static asset loading.

This introduces a release-management requirement: cache-sensitive files must move together.

Conceptually, one release aligns:

```text
application BUILD_ID
required-build metadata
app.js cache-busting URL
service-worker registration URL
service-worker cache version
```

If the browser sees mixed versions during a partial deployment, FieldOS uses a reload guard instead of repeatedly refreshing forever.

Updates are deferred while unsynced field work exists.

See [`../examples/pwa-update-coordinator.js`](../examples/pwa-update-coordinator.js).

---

# 16. Sales Review & Financial State

The post-sale workflow is intentionally separate from the rep interface.

A sale can move through operational facts such as:

```text
Submitted
   ↓
Entered / Reviewed
   ↓
Installed / Canceled / Rescheduled
   ↓
Ready to Invoice
   ↓
Invoiced
   ↓
Possible Later Adjustment / Clawback
```

A later clawback is stored as a separate lifecycle/financial record rather than deleting the original sale. This preserves historical and audit information.

---

# 17. Downstream Lifecycle Validation

The production architecture can compare FieldOS state to downstream CRM/work-order/warehouse state.

The external location identifier is the preferred matching key because formatted addresses are not always stable identifiers.

A validation layer can compare:

```text
FieldOS state
vs.
Expected state from downstream lifecycle
```

and classify the result as match, mismatch, exception, needs review, or not yet available.

This is deliberately safer than immediately writing every external status into the operational system.

See [`../examples/lifecycle-validation.sql`](../examples/lifecycle-validation.sql).

---

# 18. External Schedule Audit

An external scheduling source is introduced through an audit table that records proposed actions before mutation authority is granted.

This provides metrics such as:

- address match rate,
- slot match rate,
- would-book count,
- would-overbook count,
- territory mismatch count,
- ambiguity count.

This pattern is useful whenever an external system is being connected to a critical shared resource.

See [`../examples/schedule-reconciliation-audit.sql`](../examples/schedule-reconciliation-audit.sql).

---

# 19. Security Design

Important boundaries include:

### Browser configuration

Only public client configuration should exist in browser code. Database policy and grants must assume those values can be inspected.

### Server-only configuration

Privileged database keys, email credentials, and integration secrets remain in server runtime environment variables.

### Administrative authorization

Protected screens use authentication plus authorization rules; hiding a button is not a sufficient security boundary.

### Public repository sanitation

This showcase excludes real customer PII, real serviceable-location datasets, production secrets, exact pricing rules, proprietary internal endpoints, and full private schemas.

---

# 20. Deployment Discipline

A safe production release should include:

1. database migration review when applicable,
2. grant/policy verification,
3. environment-variable verification,
4. complete synchronized deployment,
5. fresh-session smoke test,
6. representative assignment/address load test,
7. current pricing verification,
8. test disposition,
9. appointment availability test,
10. test sale and single booking verification,
11. confirmation-email pricing verification,
12. Sales Review verification,
13. PWA/update-banner verification.

The application is operational software; deployment correctness is part of the product behavior.

---

# 21. What the Engineering Work Represents

The project combines:

- front-end workflow design,
- PostgreSQL data modeling,
- transactional logic,
- concurrency control,
- idempotency,
- realtime systems,
- offline/mobile resilience,
- PWA lifecycle management,
- dynamic pricing,
- temporal/historical snapshots,
- serverless integrations,
- state-machine design,
- financial workflow modeling,
- data validation,
- geospatial workflows,
- analytics and operational reporting.

The architecture is intentionally pragmatic: use simple browser technology where it is sufficient, move shared correctness into the data layer, and add server-side trust boundaries only where privileged workflows require them.
