# Klea — cleaning business management software

Two-sided app for a cleaning business, built as a fully working demo.

## Brand (matched to kleahome.co.uk)

Ivory `#FBF8F1` background, espresso `#2B241C`, terracotta `#B5764C` action colour, sand `#D8BFA3` / ochre `#C9A36A` accents. Fraunces (serif, weight 500) for headings, DM Sans for body. Logo = lowercase serif "klea" with an ochre ✦ sparkle. Tokens live in `src/styles.css`.

- **Client side** (`http://localhost:4601/#/`) — mobile-friendly booking site: pick a service (one-off, regular, deep, Airbnb, end of tenancy, office, commercial), property size + postcode, upsells (windows, oven, carpets, drive, patio…), weekly/fortnightly/4-weekly plans with discounts, live availability, demo card payment, confirmation message.
- **Team side** (`/#/admin`) — dashboard (KPIs + today's cleans + compliance alerts), weekly rota per cleaner, bookings list with full job sheet + tickable checklists, clients with history/lifetime value, staff profiles (photo, bio, hourly rate, legal/compliance checks + company legal documents), payroll (wages due + demo payouts), reports (monthly P&L with overheads), message log with demo send.

## Run

```bash
npm run dev --prefix klea
```

Opens API on :4600 and the app on :4601 (Vite proxies /api). Or use the `klea` entry in `.claude/launch.json`. Node 22+.

## Stack and key files

- No database server — JSON file store at `server/data/db.json` (delete it to re-seed demo data from `server/seed.js`).
- `server/catalogue.js` — services, prices, upsells, frequency discounts, checklist templates, client-facing FAQs, Team Clean supplement, reset-clean (first visit) pricing. Edit here to change offerings.
- Coverage areas (M/SK postcodes), cancellation policy fee logic, job photos, ratings and the free re-clean guarantee are implemented in `server/index.js`; coverage list lives in seed `settings.coverage`.
- `server/geo.js` — postcode-patch proximity scoring (outcode matching). Cleaners are auto-matched closest-first. Swap for postcodes.io for real distances.
- `server/index.js` — Express API (quotes, availability, bookings, admin).
- `src/client.jsx` — booking site + wizard. `src/admin.jsx` — admin panel. `src/styles.css` — beige/grey theme, light/dark via `data-theme`.
- API port is 4600 via `API_PORT` (NOT `PORT` — the preview tool sets PORT to Vite's port).

## Logins and roles

Real auth in `server/auth.js` (scrypt hashes, bearer tokens, no external deps). Roles:
- `admin` — everything including Team logins
- `office` — everything except Team logins
- `kleaner` — their own jobs and rota only, **never prices** (`stripMoney()` strips price on all cleaner routes)

Seeded: hello@kleahome.co.uk / KleaAdmin2026!, danielle@kleahome.co.uk / KleaOffice2026!, and firstname@kleahome.co.uk / Kleaner2026! per Kleaner. `seedUsers()` only runs when there are no users.

## Demo mode boundaries (deliberately not live)

- Payments: card form validates but charges nothing. To go live: Stripe Checkout + webhooks, keys via key-form.
- Messages: logged in the Messages tab, not actually sent. To go live: Twilio (SMS) / IONOS email.
- Guesty is CONNECTED (`server/guesty.js`). Keys in `.env` locally and on Railway. NOTE: Guesty returns only default fields, so `fields=` must list `status` explicitly or cancellations look live; and date filtering needs their `filters` JSON syntax, not `checkOutDateFrom`. Token is persisted in the db because their token endpoint is rate-limited hard.

## Guesty rules (client-confirmed)

Every listing. Changeover 10:00 (guest out) to 15:00 (guest in), so cleans start 10:00 and are capped at 5h. Everything imports as `requested` for office approval. Same-day turnarounds (checkout + check-in same date, same listing) carry `sameDayTurnaround` and a red flag. Cancellations in Guesty cancel the clean here.

## Time off

`db.absences` blocks days per Kleaner (holiday/sick/training/unavailable). `absenceOn()` excludes them from `staffOptions()` and Guesty's `pickCleaner()`, so leave blocks assignment everywhere, not just visually. Booking over existing jobs returns `clashes` for the UI to warn about.

## Costs

£0/day — runs locally, no external APIs, no LLM calls.
