# FieldOS Public Code Examples

These examples are simplified and sanitized versions of implementation patterns used in the private FieldOS production application.

They are included to demonstrate the engineering approach without publishing production source code, credentials, exact database schemas, pricing rules, customer data, vendor configuration, territory identifiers, or company-specific business logic.

## Included Examples

### `transactional-sale-client.js`

Shows the client-side pattern used to submit a sale as one database transaction rather than several unrelated inserts.

Key ideas:

- One payload represents the complete sale workflow
- A client-generated submission ID supports idempotent retries
- The database remains the source of truth
- Connectivity failures are queued for later synchronization
- Incomplete transaction responses are treated as failures instead of assuming success

### `offline-sync-queue.js`

Shows a browser-side queue for field activity when a representative loses connectivity.

Key ideas:

- Local persistence
- Sequential replay
- Retry metadata
- RPC support
- Connectivity detection
- Failed work remains queued instead of being silently discarded

### `realtime-schedule-sync.js`

Shows how the installation schedule stays current across devices.

Key ideas:

- Supabase Realtime subscriptions
- Debounced refreshes
- Polling as a reliability fallback
- Visibility and online-state checks
- Serialized refreshes to prevent overlapping requests
- Database reconciliation after missed websocket events

### `sale-confirmation-webhook.js`

Shows the backend pattern used for transactional customer notifications.

Key ideas:

- Webhook-secret validation
- Environment-based credentials
- Conditional row reservation to prevent duplicate sends
- Minimal customer-data lookup
- SMTP delivery
- Sent / skipped / failed status tracking
- Safe retry behavior

### `schedule-reconciliation-audit.sql`

Shows the database design for an audit-only external scheduling reconciliation workflow.

Key ideas:

- Unique source keys
- Controlled audit states
- Capacity snapshots
- JSON source payloads
- Indexing
- Row Level Security
- Service-role-only writes

## Architecture Represented

```text
Field Representative
        ↓
Browser Application
        ↓
Transactional RPC
        ↓
PostgreSQL
   ┌────┼─────┐
   ↓    ↓     ↓
Order Booking Activity Event
        ↓
Realtime Schedule Updates
        ↓
Other Field Devices

If connectivity is lost:

Browser
   ↓
Local Offline Queue
   ↓
Connectivity Restored
   ↓
Replay Same Idempotent RPC
   ↓
PostgreSQL

After a successful order:

Database Webhook
        ↓
Serverless Notification Handler
        ↓
Reserve Notification State
        ↓
SMTP
        ↓
Update Delivery Status
```

## Public-Safe Scope

The examples intentionally remove or rename:

- Production Supabase project details
- Customer and employee information
- Real territories
- Vendor names
- Pricing and package rules
- Exact production table/function names where unnecessary
- Internal Google Sheet identifiers
- Email addresses and phone numbers
- Infrastructure secrets
- Full error-recovery and migration logic

These files are portfolio examples, not a drop-in copy of the production application.
