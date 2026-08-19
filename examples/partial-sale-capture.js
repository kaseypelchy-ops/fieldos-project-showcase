/**
 * Partial Sale Capture
 *
 * Simplified public example based on FieldOS partial-attempt behavior.
 * A partial interaction is intentionally not stored as a completed sale.
 */

const DRAFT_PREFIX = 'fieldos_partial_';

function draftKey({ representativeId, locationId }) {
  return `${DRAFT_PREFIX}${representativeId}:${locationId}`;
}

function stageFor(partial) {
  if (partial.installDate || partial.installTime) return 'install_selected';
  if (partial.packageKey) return 'package_selected';
  if (partial.phone || partial.email) return 'contact_captured';
  if (partial.firstName || partial.lastName || partial.notes) return 'customer_info';
  return 'started';
}

export function saveLocalDraft(context, partial) {
  const value = {
    ...partial,
    stage: stageFor(partial),
    updated_at: new Date().toISOString(),
  };

  localStorage.setItem(draftKey(context), JSON.stringify(value));
  return value;
}

export function readLocalDraft(context) {
  try {
    return JSON.parse(localStorage.getItem(draftKey(context)) || 'null');
  } catch {
    return null;
  }
}

export function clearLocalDraft(context) {
  localStorage.removeItem(draftKey(context));
}

export function createPartialSaver({ supabase, debounceMs = 900 }) {
  let timer = null;

  return function queuePartialSave(context, partial) {
    const local = saveLocalDraft(context, partial);

    clearTimeout(timer);
    timer = setTimeout(async () => {
      const payload = {
        client_attempt_id: partial.clientAttemptId,
        representative_id: context.representativeId,
        location_id: context.locationId,
        first_name: partial.firstName || null,
        last_name: partial.lastName || null,
        phone: partial.phone || null,
        email: partial.email || null,
        notes: partial.notes || null,
        package_key: partial.packageKey || null,
        progress_stage: local.stage,
        attempt_status: 'open',
      };

      const { error } = await supabase.rpc('save_partial_attempt', {
        p_payload: payload,
      });

      if (error) {
        // Local draft remains available even if remote persistence fails.
        console.warn('Partial attempt not persisted yet:', error.message);
      }
    }, debounceMs);
  };
}

export async function finalizePartialAttempt({
  supabase,
  clientAttemptId,
  outcome,
  completedSaleId = null,
}) {
  const status = completedSaleId ? 'converted' : 'abandoned';

  const { error } = await supabase.rpc('finalize_partial_attempt', {
    p_payload: {
      client_attempt_id: clientAttemptId,
      attempt_status: status,
      final_outcome: outcome,
      completed_sale_id: completedSaleId,
    },
  });

  if (error) throw error;
}
