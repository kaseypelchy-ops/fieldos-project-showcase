/**
 * Transactional Sale Confirmation Webhook
 *
 * Simplified public example based on a FieldOS serverless handler.
 *
 * The important reliability pattern is the conditional state transition:
 *
 * pending -> sending -> sent
 *
 * A duplicate database webhook cannot reserve the same notification twice.
 */

import { createClient } from '@supabase/supabase-js';
import nodemailer from 'nodemailer';

function clean(value) {
  return String(value ?? '').trim();
}

function looksLikeEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(value));
}

function respond(response, status, body) {
  response.status(status).json(body);
}

function buildMessage(order, address) {
  const customerName = clean(order.customer_name) || 'Customer';
  const firstName = customerName.split(/\s+/)[0] || 'there';

  const serviceAddress = [
    address?.address_1,
    address?.city,
    address?.state,
    address?.postal_code,
  ]
    .filter(Boolean)
    .join(', ');

  const packageName =
    clean(order.package_name) ||
    'Internet service';

  return {
    subject: `Service order confirmation – ${packageName}`,

    text: [
      `Hi ${firstName},`,
      '',
      'Your service order has been submitted successfully.',
      '',
      serviceAddress
        ? `Service address: ${serviceAddress}`
        : null,
      `Package: ${packageName}`,
      order.install_date
        ? `Installation date: ${order.install_date}`
        : null,
      '',
      'Our team will contact you if anything else is needed.',
    ]
      .filter((line) => line !== null)
      .join('\n'),
  };
}

export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return respond(response, 405, {
      error: 'Method not allowed',
    });
  }

  const requiredEnv = [
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
    'WEBHOOK_SECRET',
    'SMTP_HOST',
    'SMTP_PORT',
    'SMTP_USER',
    'SMTP_PASSWORD',
    'SMTP_FROM_EMAIL',
  ];

  const missing = requiredEnv.filter(
    (name) => !process.env[name]
  );

  if (missing.length) {
    console.error(
      'Missing required environment variables:',
      missing.join(', ')
    );

    return respond(response, 500, {
      error: 'Notification service is not configured',
    });
  }

  const suppliedSecret = clean(
    request.headers['x-app-webhook-secret']
  );

  if (
    !suppliedSecret ||
    suppliedSecret !== process.env.WEBHOOK_SECRET
  ) {
    return respond(response, 401, {
      error: 'Unauthorized',
    });
  }

  const event = request.body || {};
  const order = event.record || event.new || {};

  if (
    clean(event.type).toUpperCase() !== 'INSERT' ||
    clean(event.table) !== 'orders' ||
    !order.id
  ) {
    return respond(response, 400, {
      error: 'Expected an order INSERT webhook',
    });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    }
  );

  const recipient = clean(order.email).toLowerCase();

  if (!looksLikeEmail(recipient)) {
    await supabase
      .from('orders')
      .update({
        confirmation_status: 'skipped',
        confirmation_error: recipient
          ? 'Customer email is invalid'
          : 'Customer email is blank',
      })
      .eq('id', order.id)
      .eq('confirmation_status', 'pending');

    return respond(response, 200, {
      status: 'skipped',
    });
  }

  /**
   * Reserve the notification before contacting SMTP.
   *
   * Only the first webhook that finds the row in "pending" state can move it
   * to "sending". Duplicate webhook deliveries become no-ops.
   */
  const {
    data: reserved,
    error: reserveError,
  } = await supabase
    .from('orders')
    .update({
      confirmation_status: 'sending',
      confirmation_error: null,
    })
    .eq('id', order.id)
    .eq('confirmation_status', 'pending')
    .select('id')
    .maybeSingle();

  if (reserveError) {
    console.error(
      'Could not reserve notification:',
      reserveError
    );

    return respond(response, 500, {
      error: 'Could not reserve notification',
    });
  }

  if (!reserved) {
    return respond(response, 200, {
      status: 'already_processed',
    });
  }

  let address = null;

  if (order.address_id) {
    const result = await supabase
      .from('addresses')
      .select('address_1,city,state,postal_code')
      .eq('id', order.address_id)
      .maybeSingle();

    if (!result.error) {
      address = result.data;
    }
  }

  const message = buildMessage(order, address);

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: false,
    requireTLS: true,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
    tls: {
      minVersion: 'TLSv1.2',
    },
    connectionTimeout: 15000,
    socketTimeout: 30000,
  });

  try {
    const result = await transporter.sendMail({
      from: process.env.SMTP_FROM_EMAIL,
      to: recipient,
      subject: message.subject,
      text: message.text,
      headers: {
        'Auto-Submitted': 'auto-generated',
      },
    });

    await supabase
      .from('orders')
      .update({
        confirmation_status: 'sent',
        confirmation_sent_at: new Date().toISOString(),
        confirmation_message_id: clean(result.messageId),
        confirmation_error: null,
      })
      .eq('id', order.id)
      .eq('confirmation_status', 'sending');

    return respond(response, 200, {
      status: 'sent',
    });
  } catch (error) {
    const safeError = clean(
      error?.message || 'SMTP delivery failed'
    ).slice(0, 500);

    console.error('SMTP delivery failed:', safeError);

    await supabase
      .from('orders')
      .update({
        confirmation_status: 'failed',
        confirmation_error: safeError,
      })
      .eq('id', order.id)
      .eq('confirmation_status', 'sending');

    return respond(response, 502, {
      error: 'SMTP delivery failed',
    });
  }
}
