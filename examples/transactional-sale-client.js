/**
 * Transactional Sale Submission
 *
 * Simplified public example based on the FieldOS production workflow.
 *
 * The important design decision is that a sale is submitted as ONE
 * database transaction. The client does not independently create an order,
 * installation booking, and activity event.
 *
 * Production schemas, pricing rules, company names, and exact RPC names
 * have been removed.
 */

function newClientSubmissionId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.random() * 16 | 0;
    const value = char === 'x' ? random : ((random & 0x3) | 0x8);
    return value.toString(16);
  });
}

function isConnectivityError(error) {
  const message = String(
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.code ||
    error ||
    ''
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
  let value = data;

  if (Array.isArray(value)) {
    value = value[0] ?? null;
  }

  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch {
      // Leave the original string in place.
    }
  }

  return value && typeof value === 'object' ? value : {};
}

function requireCompleteTransaction(result) {
  const missing = [];

  if (result.ok !== true) missing.push('ok');
  if (!result.order_id) missing.push('order_id');
  if (!result.appointment_id) missing.push('appointment_id');
  if (!result.activity_event_id) missing.push('activity_event_id');

  if (missing.length) {
    throw new Error(
      `Incomplete transaction confirmation: ${missing.join(', ')}`
    );
  }

  return result;
}

async function callSaleTransaction(supabase, payload) {
  const { data, error } = await supabase.rpc('submit_sale_transaction', {
    p_payload: payload,
  });

  if (error) throw error;

  return requireCompleteTransaction(normalizeRpcResult(data));
}

/**
 * queueOfflineRpc is injected so the example does not depend on the
 * implementation in offline-sync-queue.js.
 */
export async function submitSale({
  supabase,
  sale,
  selectedAddress,
  selectedSlot,
  queueOfflineRpc,
  refreshSchedule,
}) {
  if (!selectedAddress?.id) {
    throw new Error('An address must be selected.');
  }

  if (!selectedSlot?.id) {
    throw new Error('An installation slot must be selected.');
  }

  const submissionId = newClientSubmissionId();

  const transactionPayload = {
    client_submission_id: submissionId,
    address_id: selectedAddress.id,
    installation_slot_id: selectedSlot.id,

    representative_id: sale.representativeId,
    territory: selectedAddress.territory,

    customer: {
      name: sale.customerName,
      phone: sale.phone,
      email: sale.email || null,
    },

    package: {
      key: sale.packageKey,
      display_name: sale.packageName,
      offer_id: sale.offerId || null,
    },

    notes: sale.notes || null,

    outcome: {
      decision_maker_spoken_to: true,
      follow_up_needed: Boolean(sale.followUpNeeded),
      sale_made: true,
    },
  };

  if (navigator.onLine === false) {
    queueOfflineRpc({
      rpc: 'submit_sale_transaction',
      payload: transactionPayload,
      label: `Sale: ${sale.customerName}`,
    });

    return {
      queued: true,
      clientSubmissionId: submissionId,
    };
  }

  try {
    const result = await callSaleTransaction(
      supabase,
      transactionPayload
    );

    // The transaction response contains authoritative booking/capacity data.
    await refreshSchedule?.({
      slotId: selectedSlot.id,
      bookedAfter: result.booked_after,
      capacity: result.capacity,
    });

    return {
      queued: false,
      clientSubmissionId: submissionId,
      ...result,
    };
  } catch (error) {
    if (!isConnectivityError(error)) {
      // Validation/capacity failures should be shown to the user and the
      // schedule should be refreshed before another attempt.
      await refreshSchedule?.({ force: true });
      throw error;
    }

    // Reuse the SAME payload and submission ID later.
    // The server-side transaction uses the submission ID for idempotency.
    queueOfflineRpc({
      rpc: 'submit_sale_transaction',
      payload: transactionPayload,
      label: `Sale: ${sale.customerName}`,
    });

    return {
      queued: true,
      clientSubmissionId: submissionId,
    };
  }
}
