/**
 * Idempotent Customer Confirmation Webhook
 *
 * Sanitized public example based on FieldOS.
 * Production schema names, addresses, credentials, and pricing are omitted.
 */

import nodemailer from 'nodemailer';
import { createClient } from '@supabase/supabase-js';

function clean(value) {
  return String(value ?? '').trim();
}

function respond(response, status, body) {
  return response.status(status).json(body);
}

function parseObject(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value;
  }

  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  return {};
}

function money(value) {
  const amount = Number(value);
  return Number.isFinite(amount)
    ? new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
      }).format(amount)
    : '';
}

function buildMessage(order) {
  // Persisted historical snapshot is the pricing source of truth.
  const offer = parseObject(order.offer_snapshot);

  const packageName =
    clean(offer.package_name) || clean(order.package_name) || 'Internet Service';

  const promotion =
    clean(offer.promo_display) || clean(order.promotion_display);

  const promoTerm =
    clean(offer.promo_term_label) || clean(order.promotion_term);

  const monthlyTotal = money(
    offer.month_one_total ?? order.estimated_monthly_total
  );

  const afterPromotion =
    clean(offer.standard_rate_label) || clean(order.standard_rate_display);

  const lines = [
    `Package: ${packageName}`,
    promotion && `Promotion: ${promotion}`,
    promoTerm && `Promotion term: ${promoTerm}`,
    monthlyTotal && `Estimated promotional monthly total: ${monthlyTotal}`,
    afterPromotion && `After promotion: ${afterPromotion}`,
  ].filter(Boolean);

  return {
    subject: `Your order confirmation – ${packageName}`,
    text: `Thank you for your order.\n\n${lines.join('\n')}`,
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    return respond(response, 405, { error: 'Method not allowed' });
  }

  if (
    clean(request.headers['x-webhook-secret']) !==
    clean(process.env.ORDER_WEBHOOK_SECRET)
  ) {
    return respond(response, 401, { error: 'Unauthorized' });
  }

  const webhookOrder = request.body?.record || {};

  if (!webhookOrder.id) {
    return respond(response, 400, { error: 'Missing order' });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );

  /**
   * Atomic reservation:
   * only one webhook delivery can change pending -> sending.
   */
  const { data: reserved, error: reserveError } = await supabase
    .from('completed_sales')
    .update({
      confirmation_status: 'sending',
      confirmation_error: null,
    })
    .eq('id', webhookOrder.id)
    .eq('confirmation_status', 'pending')
    .select('id')
    .maybeSingle();

  if (reserveError) {
    return respond(response, 500, { error: 'Could not reserve confirmation' });
  }

  if (!reserved) {
    return respond(response, 200, { status: 'already_processed' });
  }

  /**
   * Reload persisted order so the email uses the database copy of
   * offer_snapshot rather than depending on a possibly partial webhook row.
   */
  const { data: order, error: orderError } = await supabase
    .from('completed_sales')
    .select('*')
    .eq('id', webhookOrder.id)
    .single();

  if (orderError || !order) {
    await supabase
      .from('completed_sales')
      .update({
        confirmation_status: 'failed',
        confirmation_error: 'Could not reload persisted order',
      })
      .eq('id', webhookOrder.id);

    return respond(response, 500, { error: 'Could not load order' });
  }

  const recipient = clean(order.customer_email).toLowerCase();

  if (!recipient) {
    await supabase
      .from('completed_sales')
      .update({ confirmation_status: 'skipped' })
      .eq('id', order.id)
      .eq('confirmation_status', 'sending');

    return respond(response, 200, { status: 'skipped' });
  }

  const message = buildMessage(order);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USERNAME,
      pass: process.env.SMTP_PASSWORD,
    },
  });

  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: recipient,
      subject: message.subject,
      text: message.text,
      headers: { 'Auto-Submitted': 'auto-generated' },
    });

    await supabase
      .from('completed_sales')
      .update({
        confirmation_status: 'sent',
        confirmation_sent_at: new Date().toISOString(),
        confirmation_message_id: clean(result.messageId),
        confirmation_error: null,
      })
      .eq('id', order.id)
      .eq('confirmation_status', 'sending');

    return respond(response, 200, { status: 'sent' });
  } catch (error) {
    const safeError = clean(error?.message || 'SMTP delivery failed').slice(0, 500);

    await supabase
      .from('completed_sales')
      .update({
        confirmation_status: 'failed',
        confirmation_error: safeError,
      })
      .eq('id', order.id)
      .eq('confirmation_status', 'sending');

    return respond(response, 502, { error: 'SMTP delivery failed' });
  }
}
