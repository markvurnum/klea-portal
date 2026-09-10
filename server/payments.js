// Taking card payments through Stripe.
//
// Klea's own server never sees a card number. The client is handed over to
// Stripe's own payment page, pays there, and Stripe tells us afterwards. That
// keeps the card handling entirely on Stripe's side, which is the whole point.
//
// The secret key lives in the database on the server, never in the code and
// never in a file that could reach GitHub.
import crypto from 'crypto';
import { getDb } from './db.js';

const API = 'https://api.stripe.com/v1';

export function stripeSettings(db = getDb()) {
  return db.settings.stripe || {};
}

export function isStripeConfigured(db = getDb()) {
  const s = stripeSettings(db);
  return !!(s.enabled && s.secretKey);
}

// The secret key never leaves the server, not even to an admin screen
export function safeStripeSettings(db = getDb()) {
  const s = stripeSettings(db);
  const key = s.secretKey || '';
  return {
    enabled: !!s.enabled,
    hasSecretKey: !!key,
    // Stripe's own test keys start sk_test, live ones sk_live. Worth showing,
    // because taking pretend money for months is an easy mistake to make.
    mode: key.startsWith('sk_live') ? 'live' : key ? 'test' : null,
    hasWebhookSecret: !!s.webhookSecret,
    lastPaidAt: s.lastPaidAt || null,
    lastError: s.lastError || null
  };
}

// Stripe takes form-encoded parameters with bracketed paths, e.g.
// line_items[0][price_data][currency]. Building those by hand is where the
// amount silently goes missing, so the caller passes exact keys.
async function stripePost(db, path, params) {
  const s = stripeSettings(db);
  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') body.append(k, String(v));
  }
  const res = await fetch(API + path, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + s.secretKey,
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error?.message || `Stripe refused the request (${res.status}).`);
  }
  return data;
}

async function stripeGet(db, path) {
  const s = stripeSettings(db);
  const res = await fetch(API + path, { headers: { Authorization: 'Bearer ' + s.secretKey } });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `Stripe refused the request (${res.status}).`);
  return data;
}

// Proves the key works without taking a penny off anyone
export async function checkStripeKey(db = getDb()) {
  const account = await stripeGet(db, '/account');
  return {
    name: account.business_profile?.name || account.settings?.dashboard?.display_name || account.id,
    country: account.country,
    chargesEnabled: !!account.charges_enabled,
    currency: (account.default_currency || 'gbp').toUpperCase()
  };
}

// Hands the client over to Stripe's own payment page
export async function createCheckoutSession(db, { amount, description, clientEmail, paymentId, successUrl, cancelUrl }) {
  if (!isStripeConfigured(db)) throw new Error('Card payments are not switched on yet.');
  const pence = Math.round(Number(amount) * 100);
  if (!Number.isFinite(pence) || pence < 30) {
    throw new Error('That amount is too small for a card payment.');
  }
  const session = await stripePost(db, '/checkout/sessions', {
    'mode': 'payment',
    'success_url': successUrl,
    'cancel_url': cancelUrl,
    'customer_email': clientEmail || undefined,
    'client_reference_id': String(paymentId),
    'line_items[0][quantity]': 1,
    'line_items[0][price_data][currency]': 'gbp',
    'line_items[0][price_data][unit_amount]': pence,
    'line_items[0][price_data][product_data][name]': description.slice(0, 120),
    'metadata[paymentId]': String(paymentId)
  });
  return { id: session.id, url: session.url };
}

export async function retrieveSession(db, id) {
  return stripeGet(db, `/checkout/sessions/${encodeURIComponent(id)}`);
}

// Stripe signs what it sends us: HMAC-SHA256 over "{timestamp}.{raw body}".
// The body must be the raw bytes, hashed before any JSON parsing.
const TOLERANCE_SECS = 5 * 60;

export function verifyStripeSignature(rawBody, header, secret) {
  if (!secret) return { ok: false, reason: 'No signing secret stored yet.' };
  if (!header) return { ok: false, reason: 'Missing Stripe signature header.' };

  const parts = Object.fromEntries(
    String(header).split(',').map(p => p.split('=').map(x => x.trim()))
  );
  const t = parts.t;
  const v1 = parts.v1;
  if (!t || !v1) return { ok: false, reason: 'Signature header was not in the expected shape.' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(t));
  if (!Number.isFinite(age) || age > TOLERANCE_SECS) {
    return { ok: false, reason: 'Signature timestamp is outside the accepted window.' };
  }

  const expected = crypto.createHmac('sha256', secret).update(`${t}.${rawBody}`).digest('hex');
  const a = Buffer.from(expected);
  const b = Buffer.from(v1);
  const match = a.length === b.length && crypto.timingSafeEqual(a, b);
  return match ? { ok: true } : { ok: false, reason: 'Signature did not match.' };
}
