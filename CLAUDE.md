# Klea Portal

Operations software for Klea Home, a premium cleaning company on the Fylde Coast
(kleahome.co.uk). One system covering bookings, rota, cleaners, clients, payroll,
costs and their Guesty (Airbnb) changeovers.

**Live:** https://portal.kleahome.co.uk
**Code:** https://github.com/markvurnum/klea-portal (private)

Their marketing website at kleahome.co.uk is separate, hosted on Netlify, and is
not part of this project. Its booking buttons point at
`portal.kleahome.co.uk/#/book`, which opens the booking form directly.

---

## Golden rule

**Never say something works until you have proven it.** Run the actual flow,
show the result. If you cannot verify something (it needs a live payment, a real
text message, or someone's login), say exactly that rather than claiming success.

---

## Run it locally

```bash
npm install
npm run dev
```

The website appears on http://localhost:4601 and the API runs on port 4600.
Node 22 or newer. See SETUP.md if this is a fresh machine.

To wipe local data and start again, delete `server/data/db.json` and restart.

---

## The four ways in

| Address | Who | Notes |
|---|---|---|
| `/#/` | Public | Booking site: prices, FAQs, book and pay |
| `/#/my` | Clients | Move or cancel their own cleans, rate them |
| `/#/cleaner` | Kleaners | Their own jobs and rota only, **never prices** |
| `/#/admin` | Office | Everything: rota, clients, staff, payroll, costs, Guesty |

Also `/#/join` (Become a Kleaner) and `/#/book` (straight into booking).

## Logins and roles

Real authentication in `server/auth.js`: scrypt password hashing, bearer tokens,
no external service. Three roles:

- **admin** — everything, including creating team logins
- **office** — everything except team logins
- **kleaner** — their own work only, and `stripMoney()` removes prices from
  every response they can reach. This is enforced on the server, not just hidden
  in the interface.

Starting logins are seeded on first run (`seedUsers`). They are deliberately
simple and must be replaced before real use: there is a
**"Generate strong passwords for everyone"** button on the Team logins page.

Login attempts are rate limited: 6 failures locks that account for 15 minutes,
with a much higher separate limit per internet connection so one person
fumbling their password cannot lock out the whole office.

---

## How the code is laid out

```
server/
  index.js      Express API, all routes, the availability engine
  auth.js       passwords, tokens, roles, the activity trail
  guesty.js     Guesty integration (see below)
  catalogue.js  services, prices, add-ons, checklists, FAQs
  geo.js        postcode matching, used to pick the nearest Kleaner
  seed.js       demo data and default settings
  db.js         the JSON file store
src/
  client.jsx    public booking site
  admin.jsx     office dashboard (the big one)
  cleaner.jsx   Kleaner phone app
  portal.jsx    client self-service
  join.jsx      Become a Kleaner
  styles.css    all styling and the Klea brand colours
```

**Storage is a single JSON file**, at `server/data/db.json` locally and `/data`
on the server. No database server. This is fine at Klea's size but has no
automatic backups yet, which is the main thing to improve before heavy use.

**Changing prices, services, add-ons, checklists or FAQs** means editing
`server/catalogue.js`. Nothing else needs touching.

---

## The business rules (agreed with Klea, do not change casually)

**Coverage:** FY and PR postcodes only. Anything else is politely declined at
booking. Set in `seed.js` under `settings.coverage`.

**Cancellation:** free until midday the day before, 50% after. Enforced by the
software in `applyCancellation()`.

**First clean:** charged at the one-off "reset clean" rate. The regular rate
applies from visit two.

**Checklists:** the Klea Standard from their website, on every job. Bedroom,
bathroom, living room, kitchen, then deep clean extras, then finish.

**Guesty changeovers:**
- Only properties switched on in the Guesty page (Windermere is switched off,
  it is 60 miles away and they do not clean it)
- Looks 180 days ahead, since holiday lets book months out
- Clean starts at 10:00 when the guest leaves, must finish by 15:00 when the
  next arrives
- Everything arrives as a **request** for the office to approve
- Same-day turnarounds are flagged in red
- Only genuine bookings import. A Guesty "inquiry" is somebody asking, not
  booking, and must never create a clean
- Cancelled in Guesty means cancelled here
- Syncs by itself every hour, and **instant updates** (webhooks) can be switched
  on so Guesty pushes each booking the moment it happens. The hourly sync stays
  on underneath as a safety net, deliberately

**Time off** blocks work properly. Anyone on holiday or off sick is excluded
from the availability engine and from Guesty assignment, not just greyed out.

---

## Guesty, the tricky bits

Their API has three traps, all already handled. Do not undo them:

1. **It only returns a few fields by default, and `status` is not one of them.**
   You must ask for it by name or every cancelled booking looks live.
2. **Ordinary date parameters are ignored.** It needs their own `filters` JSON
   format.
3. **Sign-ins are rate limited hard.** The access token is cached for 24 hours
   and saved to the database so restarts do not burn a fresh one. If you get a
   429, wait. Retrying quickly makes it worse and has previously locked things
   out for over an hour.

**Instant updates (webhooks), further traps:**

4. **Subscriptions can only be created through the API**, never the Guesty
   dashboard. `POST /webhooks` with `{url, events}`. The dashboard only shows
   deliveries and replays failed ones.
5. **There is no cancellation event.** A cancellation arrives as
   `reservation.updated.v2` with `meta.subType: "CANCELED"`. Read the `status`
   field, not the event name.
6. **The v2 payload renames things**: `reservationId` not `_id`, `unitId` not
   `listingId`. It carries no guest name and no money, deliberately.
7. **Deliveries are signed** using Svix's scheme, HMAC-SHA256 over
   `{svix-id}.{svix-timestamp}.{raw body}`. The body must be hashed **before**
   JSON parsing, which is why `express.json` has a `verify` hook keeping the raw
   bytes for that one route.
8. **Duplicates and out-of-order deliveries are normal**, so every delivery id is
   remembered and repeats are ignored.
9. **Five days of failures and Guesty disables the endpoint**, after which only
   Guesty support can switch it back on. A signature failure is therefore shown
   prominently on the Guesty page rather than logged quietly.
10. **Recreating a subscription for the same URL issues a new signing key**, so
    the secret is always re-read after registering.

Credentials live in environment variables, never in the code:
`GUESTY_CLIENT_ID` and `GUESTY_CLIENT_SECRET`.

---

## Deploying

Hosted on Railway. Pushing to the `main` branch on GitHub is the normal way to
ship a change.

```bash
npm run build        # check it compiles first
git add -A && git commit -m "..." && git push
```

Always verify against the live site afterwards rather than assuming.

---

## What is real and what is still a demonstration

**Working properly:** booking, pricing, scheduling, rota, time off, checklists,
photos, ratings, Kleaner app, client portal, payroll, invoices, costs, profit
and loss, Guesty, recruitment, logins and roles.

**Not connected yet:**
- **Card payments.** The form accepts a card and charges nothing, but records
  the booking as paid. Revenue figures are therefore not real until Stripe is
  connected.
- **Messages.** Confirmations and reminders are written and stored but never
  actually sent. Needs an email and SMS provider.

**Also outstanding:** automatic backups of the live database, and the GDPR
paperwork (ICO registration, privacy policy, photo retention).

---

## House style

- British English.
- No em dashes or en dashes anywhere a client might read. Use commas or full
  stops.
- Plain language in the interface. The people using this run a cleaning
  business, not a software company.
- Keep `HANDOFF.md` updated as you go: newest entry at the top, what changed,
  and what the next step is.
