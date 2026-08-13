# FieldOS Public Code Examples

This folder contains simplified, sanitized examples based on implementation patterns used in the private FieldOS production application.

The goal is to show how I approached several of the more technical parts of the platform without publishing production source code or exposing internal business logic, customer information, credentials, pricing rules, territory data, vendor configuration, or production infrastructure.

These are representative examples rather than copies of the production codebase.

---

## Included Examples

### [`transactional-sale-client.js`](transactional-sale-client.js)

Demonstrates the client-side sale submission workflow.

Instead of creating an order, installation booking, and activity record through separate client-side inserts, the application sends one payload to a database transaction and treats the response as the authoritative result.

**Demonstrates:**

- Transactional sale submission
- Supabase RPC calls
- Client-generated submission IDs
- Idempotent retries
- Transaction-result validation
- Database-backed schedule reconciliation
- Connectivity-aware submission handling
- Safe retry behavior

---

### [`offline-sync-queue.js`](offline-sync-queue.js)

Demonstrates how FieldOS handles work performed in areas with unreliable cellular connectivity.

When a database operation cannot be completed, the task can be stored locally and replayed when connectivity returns instead of forcing the representative to repeat the work.

**Demonstrates:**

- Offline-first workflow design
- Browser local storage
- Sequential task replay
- Retry tracking
- RPC synchronization
- Connectivity detection
- Failure preservation

---

### [`realtime-schedule-sync.js`](realtime-schedule-sync.js)

Demonstrates how installation availability is kept synchronized across field devices.

Supabase Realtime provides the primary update path, while a lightweight polling process acts as a fallback for missed WebSocket events, sleeping mobile browsers, or unstable network connections.

**Demonstrates:**

- Supabase Realtime subscriptions
- PostgreSQL change events
- Debounced refreshes
- Polling fallback
- Browser visibility checks
- Online/offline state handling
- Serialized refreshes
- Database reconciliation

---

### [`sale-confirmation-webhook.js`](sale-confirmation-webhook.js)

Demonstrates the server-side pattern used for transactional customer notifications after a successful order.

The workflow reserves the notification state before contacting the mail server so duplicate webhook deliveries cannot send the same confirmation more than once.

**Demonstrates:**

- Serverless API handlers
- Database webhooks
- Webhook-secret validation
- Environment-based configuration
- Conditional database updates
- Duplicate-send prevention
- SMTP delivery
- Delivery-state tracking
- Failure handling

---

### [`schedule-reconciliation-audit.sql`](schedule-reconciliation-audit.sql)

Demonstrates a PostgreSQL design for reconciling scheduling information from an external source without allowing the integration to immediately modify live installation capacity.

The audit layer records what the external data would change so it can be reviewed and validated before affecting production scheduling.

**Demonstrates:**

- PostgreSQL schema design
- Unique source identifiers
- Controlled workflow states
- Capacity snapshots
- JSONB source payloads
- Constraints
- Indexing
- Row Level Security
- Service-role permissions
- Audit-first integration design

---

## Architecture Represented

The examples cover several connected parts of the FieldOS workflow.

```text
Field Representative
        ↓
Browser Application
        ↓
Transactional Sale RPC
        ↓
PostgreSQL
   ┌────┼─────────┐
   ↓    ↓         ↓
Order  Booking  Activity Event
        ↓
Realtime Schedule Updates
        ↓
Other Field Devices
