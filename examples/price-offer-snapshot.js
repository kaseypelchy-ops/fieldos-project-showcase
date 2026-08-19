/**
 * Pricing Offer Snapshot
 *
 * Simplified public example based on FieldOS pricing architecture.
 * Dollar values below are intentionally placeholders/sanitized.
 */

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount)
    : '';
}

function valueForMonth(phases, month, field = 'amount') {
  return (phases || []).find((phase) => {
    const start = Number(phase.month_start || 1);
    const end = phase.month_end == null ? Infinity : Number(phase.month_end);
    return month >= start && month <= end;
  })?.[field];
}

export function normalizeOffer(rawOffer) {
  return {
    offer_id: rawOffer.id,
    package_key: rawOffer.package_key,
    package_name: rawOffer.package_name,
    speed_label: rawOffer.speed_label,

    promo_display: rawOffer.promo_display,
    promo_term_label: rawOffer.promo_term_label,
    standard_rate_label: rawOffer.standard_rate_label,

    phases: Array.isArray(rawOffer.phases) ? rawOffer.phases : [],
    charges: Array.isArray(rawOffer.charges) ? rawOffer.charges : [],

    disclosure: rawOffer.disclosure || null,
  };
}

export function calculateMonth(offer, month) {
  const internet = Number(
    valueForMonth(offer.phases, month, 'internet_price') || 0
  );

  const charges = (offer.charges || [])
    .filter((charge) => charge.required !== false)
    .filter((charge) => charge.recurring !== false)
    .map((charge) => {
      const phased = valueForMonth(charge.phases, month, 'amount');
      const amount = Number(phased ?? charge.amount ?? 0);

      return {
        key: charge.key,
        label: charge.label,
        amount,
      };
    });

  return {
    month,
    internet,
    charges,
    total: internet + charges.reduce((sum, item) => sum + item.amount, 0),
  };
}

/**
 * The snapshot is saved with the completed order.
 *
 * Later edits to the pricing table do not change this object, which means
 * the historical sale still reflects the offer used by the representative.
 */
export function buildOfferSnapshot(rawOffer) {
  const offer = normalizeOffer(rawOffer);
  const monthOne = calculateMonth(offer, 1);

  return {
    ...offer,
    month_one_total: monthOne.total,
    month_one_breakdown: {
      internet: monthOne.internet,
      charges: monthOne.charges,
    },
    captured_at: new Date().toISOString(),
  };
}

export function buildPriceSummary(snapshot) {
  const monthOne = calculateMonth(snapshot, 1);

  return {
    package: snapshot.package_name,
    promotion: snapshot.promo_display,
    promotion_term: snapshot.promo_term_label,
    monthly_total: money(monthOne.total),
    after_promotion: snapshot.standard_rate_label,
  };
}
