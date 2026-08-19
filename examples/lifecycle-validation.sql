-- Downstream Lifecycle Validation
--
-- Sanitized public example based on FieldOS validation-first architecture.
-- The view compares operational sale state to an external lifecycle feed.
-- It does NOT automatically update the operational sale.

create or replace view public.sale_lifecycle_validation as
with operational as (
  select
    s.id as sale_id,
    s.external_location_id,
    s.review_status,
    s.install_outcome,
    s.invoiced_at,
    s.created_at
  from public.completed_sales s
),
external_lifecycle as (
  select
    x.external_location_id,
    x.account_status,
    x.work_order_status,
    x.scheduled_install_date,
    x.actual_install_date,
    x.disconnect_date,
    x.source_refreshed_at
  from public.external_lifecycle_feed x
)
select
  o.sale_id,
  o.external_location_id,
  o.review_status as fieldos_state,

  e.account_status,
  e.work_order_status,
  e.scheduled_install_date,
  e.actual_install_date,
  e.disconnect_date,
  e.source_refreshed_at,

  case
    when e.external_location_id is null then
      'NO_EXTERNAL_LIFECYCLE'

    when e.disconnect_date is not null
         and o.install_outcome <> 'installed' then
      'NEEDS_REVIEW'

    when e.actual_install_date is not null
         and o.install_outcome = 'installed' then
      'MATCH'

    when e.actual_install_date is not null
         and coalesce(o.install_outcome, '') <> 'installed' then
      'MISMATCH'

    else
      'PENDING'
  end as validation_result,

  case
    when e.external_location_id is null then
      'No downstream lifecycle record has been matched yet.'

    when e.actual_install_date is not null
         and coalesce(o.install_outcome, '') <> 'installed' then
      'Downstream source reports an installation that FieldOS has not yet confirmed.'

    when e.disconnect_date is not null then
      'Downstream source contains a disconnect; review financial lifecycle before any automatic change.'

    else
      null
  end as validation_detail

from operational o
left join external_lifecycle e
  on e.external_location_id = o.external_location_id;

comment on view public.sale_lifecycle_validation is
  'Validation-only comparison between completed sales and an external lifecycle feed. '
  'The view does not mutate sales, invoice state, or adjustment state.';
