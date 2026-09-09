// Guesty integration: pulls listings and reservations, turns each checkout into
// a changeover clean.
//
// Klea's rules (confirmed by the client, 2026-08-27):
//   * every listing is included
//   * changeover window is 10:00 to 15:00 (guest out 10:00, next guest in 15:00)
//   * every imported clean lands as a REQUEST for the office to approve
//   * same-day turnarounds are flagged so the office spots the tight ones
//
// Credentials live in the environment, never in the database:
//   GUESTY_CLIENT_ID / GUESTY_CLIENT_SECRET
import crypto from 'crypto';
import { getDb, save, nextId } from './db.js';
import { checklistFor } from './catalogue.js';
import { proximityScore } from './geo.js';

const TOKEN_URL = 'https://open-api.guesty.com/oauth2/token';
const API = 'https://open-api.guesty.com/v1';

// Guesty statuses. Only a genuinely booked stay should create a clean: an
// "inquiry" is a guest asking, not a booking, and cleaning for one wastes a trip.
export const LIVE_STATUSES = ['confirmed', 'reserved', 'checked_in', 'checked_out'];
export const DEAD_STATUSES = ['canceled', 'cancelled', 'declined', 'expired', 'closed', 'inquiry'];

export const CHANGEOVER_START = '10:00';
export const CHANGEOVER_END = '15:00';
const WINDOW_MINS = 5 * 60;

export function isConfigured() {
  return !!(process.env.GUESTY_CLIENT_ID && process.env.GUESTY_CLIENT_SECRET);
}

// Guesty rate-limits the token endpoint hard, and an in-memory cache is lost on
// every restart or deploy, burning a request each time. Persist it so a restart
// reuses the token it already has.
let memoryToken = null;   // fallback when the database is not loaded (scripts, tests)
let blockedUntil = 0;     // set when Guesty rate-limits us, so we stop hammering

const RATE_LIMIT_COOLDOWN_MINS = 20;

function storedToken() {
  const db = getDb();
  const t = db?.settings?.guestyToken || memoryToken;
  return t && t.expires > Date.now() + 60_000 ? t : null;
}

function storeToken(token, expiresIn) {
  const entry = { token, expires: Date.now() + (expiresIn || 86400) * 1000 };
  memoryToken = entry;
  const db = getDb();
  if (db?.settings) {
    db.settings.guestyToken = entry;
    save();
  }
}

export async function getAccessToken() {
  if (!isConfigured()) throw new Error('Guesty is not connected yet. Add the API credentials first.');
  const existing = storedToken();
  if (existing) return existing.token;

  // Repeatedly retrying during a lockout can extend it, so once Guesty says no
  // we wait properly rather than trying again every few seconds.
  if (blockedUntil > Date.now()) {
    const mins = Math.ceil((blockedUntil - Date.now()) / 60000);
    throw new Error(`Guesty limited our sign-ins. Waiting ${mins} more minute${mins === 1 ? '' : 's'} before trying again.`);
  }

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    scope: 'open-api',
    client_id: process.env.GUESTY_CLIENT_ID,
    client_secret: process.env.GUESTY_CLIENT_SECRET
  });
  // Guesty rate-limits the token endpoint hard, so back off and retry rather
  // than reporting a credential problem that does not exist.
  // One attempt only. If Guesty says no, back off for a proper interval rather
  // than retrying immediately, which is what keeps a lockout alive.
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error('Guesty rejected the credentials. Check the Client ID and Secret.');
  }
  if (res.status === 429) {
    blockedUntil = Date.now() + RATE_LIMIT_COOLDOWN_MINS * 60000;
    throw new Error(`Guesty limited our sign-ins. Backing off for ${RATE_LIMIT_COOLDOWN_MINS} minutes, then it will retry by itself.`);
  }
  if (!res.ok) throw new Error(`Guesty sign-in failed (${res.status}).`);
  const data = await res.json();
  blockedUntil = 0;
  storeToken(data.access_token, data.expires_in);
  return data.access_token;
}

async function guestyGet(path, params = {}) {
  const token = await getAccessToken();
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) if (v !== undefined) url.searchParams.set(k, v);
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`Guesty ${path} failed (${res.status}).`);
  return res.json();
}

async function guestySend(method, path, body) {
  const token = await getAccessToken();
  const res = await fetch(API + path, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.message || ''; } catch { /* no body */ }
    throw new Error(`Guesty ${method} ${path} failed (${res.status})${detail ? ': ' + detail : ''}.`);
  }
  if (res.status === 204) return {};
  return res.json();
}

// ---------- Instant updates (webhooks) ----------
// Guesty pushes a reservation to us the moment it is made or changed, instead of
// us asking every hour. Their v2 events carry the status, dates and listing id
// in the payload, so a changeover can be created without calling Guesty back.
//
// Registration is API-only. The Guesty dashboard cannot create a subscription,
// it only shows deliveries and lets you replay failed ones.
export const WEBHOOK_EVENTS = ['reservation.created.v2', 'reservation.updated.v2'];

export async function listWebhooks() {
  const data = await guestySend('GET', '/webhooks');
  return data.results || data.data || (Array.isArray(data) ? data : []);
}

export async function createWebhook(url, events = WEBHOOK_EVENTS) {
  return guestySend('POST', '/webhooks', { url, events });
}

export async function deleteWebhook(id) {
  return guestySend('DELETE', `/webhooks/${id}`);
}

// Each endpoint gets its own signing key. Deleting and recreating a subscription
// for the same URL issues a NEW secret, so always re-read it after registering.
export async function fetchWebhookSecret(url) {
  const data = await guestyGet('/webhooks-v2/secret', { url });
  return data.secret || data.key || data.signingSecret || null;
}

// Guesty signs deliveries using Svix's scheme: HMAC-SHA256 over
// "{svix-id}.{svix-timestamp}.{raw body}", base64, compared in constant time.
// The body must be the raw bytes, hashed BEFORE any JSON parsing.
const SIGNATURE_TOLERANCE_SECS = 5 * 60;

export function verifyWebhookSignature(rawBody, headers, secret) {
  if (!secret) return { ok: false, reason: 'No signing secret stored yet.' };
  const id = headers['svix-id'];
  const timestamp = headers['svix-timestamp'];
  const signature = headers['svix-signature'];
  if (!id || !timestamp || !signature) return { ok: false, reason: 'Missing Svix signature headers.' };

  const age = Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp));
  if (!Number.isFinite(age) || age > SIGNATURE_TOLERANCE_SECS) {
    return { ok: false, reason: 'Signature timestamp is outside the accepted window.' };
  }

  // The secret is issued as "whsec_<base64>"; only the part after the prefix is the key
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key)
    .update(`${id}.${timestamp}.${rawBody}`)
    .digest('base64');

  // The header carries one or more space-separated "v1,<signature>" entries
  const offered = String(signature).split(' ')
    .map(part => part.split(',')[1])
    .filter(Boolean);

  const expectedBuf = Buffer.from(expected);
  const match = offered.some(sig => {
    const buf = Buffer.from(sig);
    return buf.length === expectedBuf.length && crypto.timingSafeEqual(buf, expectedBuf);
  });
  return match ? { ok: true, id } : { ok: false, reason: 'Signature did not match.' };
}

// Guesty warns that duplicates and out-of-order deliveries are normal, so every
// delivery id is remembered briefly and a repeat is ignored rather than
// reprocessed.
const SEEN_LIMIT = 300;

export function alreadySeen(deliveryId) {
  if (!deliveryId) return false;
  const db = getDb();
  const seen = db.settings.guestyWebhookSeen || [];
  if (seen.includes(deliveryId)) return true;
  seen.push(deliveryId);
  db.settings.guestyWebhookSeen = seen.slice(-SEEN_LIMIT);
  return false;
}

// Their v2 payload renames things: reservationId not _id, unitId not listingId.
// The localised dates are the ones we want, since a changeover is booked on the
// property's own calendar day rather than in UTC.
export function normaliseWebhookReservation(payload) {
  const d = payload?.data || payload || {};
  const iso = v => (v ? String(v).slice(0, 10) : null);
  const status = (d.status || '').toLowerCase();
  return {
    guestyId: d.reservationId || d._id || d.id,
    listingId: d.unitId || d.listingId || d.listing?._id || d.listingId,
    checkIn: d.checkInDateLocalized || iso(d.checkIn),
    checkOut: d.checkOutDateLocalized || iso(d.checkOut),
    status,
    statusKnown: !!d.status,
    guests: d.guestsCount ?? d.numberOfGuests?.numberOfAdults ?? null,
    confirmationCode: d.confirmationCode || ''
  };
}

// Guesty returns a limited default set of fields, so ask for what we need by
// name, and filter server-side with their `filters` syntax. Without the
// explicit `status` field a cancelled stay looks identical to a live one.
const RESERVATION_FIELDS = '_id status listingId checkIn checkOut confirmationCode guestsCount';

export async function fetchListings() {
  const data = await guestyGet('/listings', { limit: 100 });
  return (data.results || data.data || []).map(normaliseListing);
}

export async function fetchReservations({ from, to }) {
  const filters = JSON.stringify([
    { field: 'checkOut', operator: '$gte', value: from },
    { field: 'checkOut', operator: '$lte', value: to }
  ]);
  const all = [];
  // page through, Guesty caps each response
  for (let skip = 0; skip < 500; skip += 100) {
    const data = await guestyGet('/reservations', {
      limit: 100, skip, fields: RESERVATION_FIELDS, filters
    });
    const rows = data.results || data.data || [];
    all.push(...rows);
    if (rows.length < 100) break;
  }
  return all.map(normaliseReservation);
}

// Guesty's field names vary a little between accounts and API versions, so read
// defensively and keep the raw record for troubleshooting on first connect.
export function normaliseListing(l) {
  const addr = l.address || {};
  return {
    guestyId: l._id || l.id,
    name: l.nickname || l.title || addr.street || 'Guesty listing',
    address: addr.full || [addr.street, addr.city].filter(Boolean).join(', ') || '',
    postcode: (addr.zipcode || addr.postcode || '').toUpperCase(),
    bedrooms: l.bedrooms ?? l.propertyDetails?.bedrooms ?? 1
  };
}

export function normaliseReservation(r) {
  const iso = v => (v ? String(v).slice(0, 10) : null);
  return {
    guestyId: r._id || r.id,
    listingId: r.listingId || r.listing?._id,
    checkIn: r.checkInDateLocalized || iso(r.checkIn),
    checkOut: r.checkOutDateLocalized || iso(r.checkOut),
    status: (r.status || '').toLowerCase(),
    statusKnown: !!r.status,
    guests: r.guestsCount ?? r.guests?.length ?? null,
    confirmationCode: r.confirmationCode || ''
  };
}

// Every poll caches the properties, so a webhook arriving on its own can create
// a changeover without calling Guesty back for listing details.
export function cacheListings(listings) {
  const db = getDb();
  db.settings.guestyListings = listings;
  save();
}

export function cachedListings() {
  return getDb().settings.guestyListings || [];
}

// A tight turnaround is one where the next guest checks in on the day we clean.
// A single webhook only describes its own stay, so every stay we hear about is
// remembered and the flag is worked out from all of them together.
const STAY_MEMORY_DAYS = 400;

export function recordStays(reservations) {
  const db = getDb();
  const stays = new Map((db.guestyStays || []).map(x => [x.guestyId, x]));
  for (const r of reservations) {
    if (!r.guestyId || !r.listingId) continue;
    stays.set(r.guestyId, {
      guestyId: r.guestyId, listingId: r.listingId,
      checkIn: r.checkIn, checkOut: r.checkOut, status: r.status
    });
  }
  const cutoff = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);
  db.guestyStays = [...stays.values()]
    .filter(x => !x.checkOut || x.checkOut >= cutoff)
    .slice(-STAY_MEMORY_DAYS * 5);
}

function liveCheckIns(db, reservations) {
  const set = new Set();
  for (const s of (db.guestyStays || [])) {
    if (s.checkIn && LIVE_STATUSES.includes(s.status)) set.add(`${s.listingId}|${s.checkIn}`);
  }
  for (const r of reservations) {
    if (r.checkIn && LIVE_STATUSES.includes(r.status)) set.add(`${r.listingId}|${r.checkIn}`);
  }
  return set;
}

export function changeoverNote(confirmationCode, sameDay) {
  return `Guesty changeover${confirmationCode ? ` (${confirmationCode})` : ''}. `
    + `Guest out ${CHANGEOVER_START}, next guest in ${CHANGEOVER_END}.`
    + (sameDay ? ' SAME DAY TURNAROUND, must finish by 15:00.' : '');
}

// A later webhook can reveal that a clean we already imported is now a tight
// turnaround, so the flag is re-checked across every upcoming Guesty clean
// rather than only being set at the moment of import.
function refreshSameDayFlags(db, checkIns) {
  let changed = 0;
  const today = new Date().toISOString().slice(0, 10);
  for (const b of db.bookings) {
    if (b.source !== 'guesty' || b.date < today) continue;
    if (b.status === 'cancelled' || b.status === 'completed') continue;
    const client = db.clients.find(c => c.id === b.clientId);
    if (!client?.guestyListingId) continue;
    const sameDay = checkIns.has(`${client.guestyListingId}|${b.date}`);
    if (sameDay !== !!b.sameDayTurnaround) {
      b.sameDayTurnaround = sameDay;
      b.notes = changeoverNote(b.guestyConfirmationCode || '', sameDay);
      changed++;
    }
  }
  return changed;
}

// The heart of it: turn normalised reservations into changeover cleans.
// Pure function over the database, so it can be exercised with sample data
// before the live credentials exist.
export function importReservations({ listings, reservations }) {
  const db = getDb();
  const result = { created: [], skipped: 0, cancelled: 0, sameDay: 0, clientsAdded: 0, excluded: 0 };

  // Properties the office has switched off, e.g. one too far away to service
  const excluded = new Set(db.settings?.guestyExcludedListings || []);
  const listingById = new Map(listings.filter(l => !excluded.has(l.guestyId)).map(l => [l.guestyId, l]));

  // A listing with a check-in on the same date as a check-out is a tight
  // turnaround. Worked out from every stay we know about, not just this batch,
  // so a single webhook can still spot one.
  recordStays(reservations);
  const checkInDates = liveCheckIns(db, reservations);

  for (const r of reservations) {
    if (!r.checkOut || !r.listingId) { result.skipped++; continue; }
    if (excluded.has(r.listingId)) { result.excluded++; continue; }
    const existing = db.bookings.find(b => b.guestyReservationId === r.guestyId);

    // Never guess at a reservation whose status did not come through
    if (!r.statusKnown) {
      result.skipped++;
      result.unknownStatus = (result.unknownStatus || 0) + 1;
      continue;
    }

    const isLive = LIVE_STATUSES.includes(r.status);
    const isDead = DEAD_STATUSES.includes(r.status);

    // An unrecognised status is reported rather than guessed at, so a new Guesty
    // status can never silently create or destroy a clean
    if (!isLive && !isDead) {
      result.skipped++;
      (result.unknownStatuses = result.unknownStatuses || {})[r.status] =
        (result.unknownStatuses[r.status] || 0) + 1;
      continue;
    }

    // Anything not actually booked (cancelled, declined, expired, or a mere
    // inquiry) must not have a clean against it
    if (isDead) {
      if (existing && existing.status !== 'cancelled') {
        existing.status = 'cancelled';
        existing.cancellationFee = 0;
        result.cancelled++;
      } else { result.skipped++; }
      continue;
    }

    if (existing) {
      // Dates can move when a guest extends
      if (existing.date !== r.checkOut && existing.status === 'requested') {
        existing.date = r.checkOut;
        result.created.push(existing);
      } else { result.skipped++; }
      continue;
    }

    const listing = listingById.get(r.listingId);
    if (!listing) { result.skipped++; continue; }

    // Each Guesty listing becomes a client record
    let client = db.clients.find(c => c.guestyListingId === listing.guestyId);
    if (!client) {
      client = {
        id: nextId('clients'), name: listing.name,
        email: `${listing.guestyId}@guesty.local`, phone: '',
        postcode: listing.postcode, address: listing.address,
        type: 'airbnb', notes: 'Imported from Guesty.',
        guestyListingId: listing.guestyId
      };
      db.clients.push(client);
      result.clientsAdded++;
    }

    const sameDay = checkInDates.has(`${listing.guestyId}|${r.checkOut}`);
    if (sameDay) result.sameDay++;

    const durationMins = Math.min(WINDOW_MINS, 75 + 25 * (listing.bedrooms || 1));
    const checklist = [];
    let ci = 0;
    for (const sec of checklistFor('airbnb')) {
      for (const item of sec.items) checklist.push({ id: ++ci, section: sec.section, label: item, done: false });
    }

    const booking = {
      id: nextId('bookings'), clientId: client.id, serviceId: 'airbnb',
      size: listing.bedrooms || 1, addonIds: [], addonQty: {}, frequency: 'once', seriesId: null,
      date: r.checkOut, start: CHANGEOVER_START, durationMins,
      staffId: pickCleaner(db, r.checkOut, client.postcode, durationMins),
      status: 'requested',
      price: 0, teamClean: false, photos: [], rating: null,
      source: 'guesty', guestyReservationId: r.guestyId,
      guestyConfirmationCode: r.confirmationCode || '',
      sameDayTurnaround: sameDay,
      notes: changeoverNote(r.confirmationCode, sameDay),
      checklist, createdAt: new Date().toISOString()
    };
    db.bookings.push(booking);
    result.created.push(booking);
  }

  result.sameDayUpdated = refreshSameDayFlags(db, checkInDates);
  save();
  return result;
}

// Closest free Kleaner who can fit the job inside the changeover window
function pickCleaner(db, date, postcode, durationMins) {
  const dow = new Date(date + 'T12:00:00').getDay();
  const busy = db.bookings.filter(b => b.date === date && b.status !== 'cancelled');
  const toMins = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
  const windowStart = toMins(CHANGEOVER_START);
  const windowEnd = toMins(CHANGEOVER_END);

  const onLeave = new Set((db.absences || [])
    .filter(a => a.from <= date && a.to >= date).map(a => a.staffId));

  const options = db.staff
    .filter(s => s.active && s.days.includes(dow) && !onLeave.has(s.id))
    .filter(s => toMins(s.start) <= windowStart && toMins(s.end) >= Math.min(windowEnd, windowStart + durationMins))
    .filter(s => !busy.some(b => b.staffId === s.id &&
      toMins(b.start) < windowStart + durationMins && toMins(b.start) + b.durationMins > windowStart))
    .map(s => ({ id: s.id, prox: proximityScore(s.postcode, postcode) }))
    .sort((a, b) => b.prox - a.prox);

  return options.length ? options[0].id : null;
}
