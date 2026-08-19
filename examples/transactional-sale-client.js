/**
 * Transactional Sale Submission
 *
 * Simplified public example based on the FieldOS production workflow.
 *
 * The client sends one logical transaction payload instead of independently
 * creating a sale, appointment booking, and field activity event.
 */

function newClientSubmissionId() {
  return globalThis.crypto?.randomUUID?.() ||
    `sale_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

function isConnectivityError(error) {
  const message = String(
    error?.message || error?.details || error?.hint || error || ''
  ).toLowerCase();

  return (
    navigator.onLine === false ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection')
  );
}

function normalizeRpcResult(data) {
  if (Array.isArray(data)) return data[0] || {};

  if (typeof data === 'string') {
    try {
      return JSON.parse(data);
    } catch {
      return {};
    }
  }

  return data && typeof data === 'object' ? data : {};
}

function requireCompleteTransaction(result) {
  const required = ['sale_id', 'booking_id', 'activity_event_id'];
  const missing = required.filter((key) => !result[key]);

  if (result.ok !== true || missing.length) {
    throw new Error(`Incomplete transaction: ${missing.join(', ') || 'ok=false'}`);
  }

  return result;
}

export async function submitSale({
  supabase,
  customer,
  representative,
  selectedLocation,
  selectedSlot,
  offerSnapshot,
  queueOfflineRpc,
  refreshSchedule,
}) {
  if (!selectedLocation?.id) throw new Error('Select a service location.');
  if (!selectedSlot?.id) throw new Error('Select an installation slot.');
  if (!offerSnapshot?.offer_id) throw new Error('Select an approved offer.');

  const clientSubmissionId = newClientSubmissionId();

  const payload = {
    client_submission_id: clientSubmissionId,
    location_id: selectedLocation.id,
    external_location_id: selectedLocation.externalLocationId || null,
    appointment_slot_id: selectedSlot.id,
    representative_id: representative.id,

    customer: {
      first_name: customer.firstName,
      last_name: customer.lastName,
      phone: customer.phone,
      email: customer.email || null,
    },

    offer_snapshot: offerSnapshot,

    outcome: {
      sale_made: true,
      follow_up_needed: Boolean(customer.followUpNeeded),
    },
  };

  async function execute() {
    const { data, error } = await supabase.rpc('submit_sale_transaction', {
      p_payload: payload,
    });

    if (error) throw error;
    return requireCompleteTransaction(normalizeRpcResult(data));
  }

  if (navigator.onLine === false) {
    queueOfflineRpc({
      rpc: 'submit_sale_transaction',
      payload,
      label: 'Completed sale',
    });

    return { queued: true, clientSubmissionId };
  }

  try {
    const result = await execute();

    await refreshSchedule?.({
      slotId: selectedSlot.id,
      bookedAfter: result.booked_after,
      capacity: result.capacity,
    });

    return { queued: false, clientSubmissionId, ...result };
  } catch (error) {
    if (!isConnectivityError(error)) {
      await refreshSchedule?.({ force: true });
      throw error;
    }

    // Reuse the exact payload/idempotency key after reconnect.
    queueOfflineRpc({
      rpc: 'submit_sale_transaction',
      payload,
      label: 'Completed sale',
    });

    return { queued: true, clientSubmissionId };
  }
}
