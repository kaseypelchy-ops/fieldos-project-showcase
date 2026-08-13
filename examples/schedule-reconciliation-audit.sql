-- External Schedule Reconciliation Audit
--
-- Simplified public example based on a FieldOS audit-only integration.
--
-- The table records what an external scheduling source WOULD change.
-- It intentionally does not create, move, cancel, or delete live
-- installation bookings.
--
-- Exact production table names, source identifiers, and territory rules
-- have been removed.

begin;

create table if not exists public.external_schedule_audit (
  id uuid primary key default gen_random_uuid(),

  -- Stable identifier from the external source.
  source_key text not null,

  source_name text not null,
  source_location text,

  appointment_date date not null,
  time_label text not null,
  territory_key text not null,

  external_location_reference text,

  -- UUID references are kept as values in this public example instead of
  -- exposing the private production foreign-key structure.
  matched_address_id uuid,
  matched_slot_id uuid,
  existing_booking_id uuid,

  audit_status text not null,
  audit_reason text,

  slot_capacity integer,
  slot_claimed_count integer,
  openings_before integer,

  is_present boolean not null default true,

  first_seen_at timestamptz not null
    default clock_timestamp(),

  last_seen_at timestamptz not null
    default clock_timestamp(),

  last_run_id uuid not null,

  source_payload jsonb not null
    default '{}'::jsonb,

  constraint external_schedule_audit_source_key_unique
    unique (source_key),

  constraint external_schedule_audit_status_check
    check (
      audit_status in (
        'would_book',
        'would_link_existing',
        'would_update_existing',
        'would_overbook',
        'slot_missing',
        'address_not_found',
        'address_ambiguous',
        'territory_mismatch',
        'invalid'
      )
    ),

  constraint external_schedule_audit_capacity_check
    check (
      slot_capacity is null
      or slot_capacity >= 0
    ),

  constraint external_schedule_audit_claimed_check
    check (
      slot_claimed_count is null
      or slot_claimed_count >= 0
    )
);

create index if not exists
  idx_external_schedule_audit_date
on public.external_schedule_audit (
  appointment_date,
  time_label
);

create index if not exists
  idx_external_schedule_audit_status
on public.external_schedule_audit (
  audit_status,
  is_present,
  appointment_date
);

create index if not exists
  idx_external_schedule_audit_location
on public.external_schedule_audit (
  external_location_reference
)
where nullif(
  trim(external_location_reference),
  ''
) is not null;

alter table public.external_schedule_audit
  enable row level security;

-- This table is written only by a trusted server-side reconciliation job.
revoke all
on table public.external_schedule_audit
from anon, authenticated;

grant select, insert, update, delete
on table public.external_schedule_audit
to service_role;

comment on table public.external_schedule_audit is
  'Audit-only observations from an external scheduling source. '
  'Rows describe proposed actions and do not directly change live capacity.';

commit;
