# Klea — HANDOFF

## 2026-09-02 — Code backed up to GitHub

**Repo: https://github.com/markvurnum/klea-portal (PRIVATE)** — 5 commits, 28 files, all pushed.

Auth: a dedicated deploy key at `~/.ssh/klea_deploy` with read/write, added to that repo only (same pattern as intent-engine/prospect-machine). The repo is configured to use it via `git config core.sshCommand`, so `git push` just works from klea/.

Verified NOT pushed: `.env` (Guesty keys), `credentials.txt`, `server/data/db.json`.

Also on Desktop: `klea-backup-YYYY-MM-DD.bundle`, a verified complete history in one file, as an off-machine copy.

**Website integration decision (in the PDF):** keep kleahome.co.uk on Netlify exactly as it is and point every booking button at `portal.kleahome.co.uk/#/book`, a new deep link that opens the booking wizard directly rather than a duplicate home page. Reasons: their site's blog/Declutter/Gift pages earn traffic a booking system would not, and a portal problem must not take down their shopfront. Portal already carries `noindex` so there is no duplicate-content issue.

## 2026-08-27 — LIVE at https://portal.kleahome.co.uk

DNS records were added in Netlify and the portal is live on the subdomain with a valid certificate. Verified: HTTPS cert good (ssl_verify 0), app serves, API responds, login issues tokens, `/api/admin/*` returns 401 without auth, Guesty shows connected, time-off endpoint live.

**Main site confirmed untouched**: kleahome.co.uk still 200s from Netlify (35.157.26.135), www still redirects. The two are fully separate:
- kleahome.co.uk → Netlify (marketing site)
- portal.kleahome.co.uk → Railway (this portal)

Railway custom domain `portal.kleahome.co.uk` is attached to service klea-demo. The old `klea-demo-production.up.railway.app` URL still works too.

**NOTE:** the pitch PDF and artifact still quote the railway.app URL — update to portal.kleahome.co.uk before sending to the client again.

## 2026-08-27 (eve) — Guesty CONNECTED (2 real bugs fixed) + holiday / time-off blocking

### Guesty is live-connected
Keys collected via key-form, saved to `.env` locally and set on Railway. **Auth verified against the real account.** Three real listings pulled cleanly: Unique Luxury Lodge (LA23 1LQ, 2 bed), Moorehouse (FY5 5EU, 3 bed), Flat 9 Royal Oak (FY6 7JB, 2 bed).

**Two real bugs found during first connect and fixed:**
1. **Guesty returns only a default subset of fields, and `status` is NOT among them.** Every reservation came back status-blank, so a cancelled stay would have created a real clean. There IS a genuine cancellation on 18 Sept in their data. Fixed by requesting `fields=_id status listingId checkIn checkOut confirmationCode guestsCount`, plus a safety rule: `statusKnown` false → skip, never guess.
2. **`checkOutDateFrom`/`checkOutDateTo` params are ignored.** Guesty needs its `filters` JSON syntax (`[{field,operator:'$gte',value}]`). Was returning 2027 reservations for a 30-day window. Fixed, plus paging.

Also: token endpoint is rate-limited hard, and a 429 was being reported as "check your credentials". Now distinguishes 401/403 (bad creds) from 429 (rate limited), retries with backoff, and **persists the token in the db** so restarts/deploys do not burn a fresh token request.

**RAISE WITH KLEA:** Unique Luxury Lodge is LA23 (Windermere), ~60 miles from the Fylde Coast. Other two are Cleveleys/Poulton. Do they actually clean it? The scheduler will try to assign someone.

**Still to verify:** the full end-to-end import against live data was blocked by the rate limit from repeated testing. Retry loop running. Field mapping and cancellation handling are proven; the import maths was proven earlier with sample data.

### Holiday / time-off blocking (client request)
`db.absences`: `{ staffId, from, to, type: holiday|sick|training|unavailable, note }`.
- **"🌴 Time off" button on the Rota** opens a form: who, from, to, reason, note.
- Blocked days render as striped cells with 🌴 Holiday / 🤒 Off sick etc.
- **Crucially it blocks assignment**: `absenceOn()` filters `staffOptions()` AND Guesty's `pickCleaner()`, so nobody on leave is offered work from any source.
- **Clash warning**: booking time off over existing jobs saves it but returns the clashing jobs, shown in a red banner and marked ⚠ in red on the rota so they get reassigned.
- Kleaners see their own time off on "My rota". Logged to the activity trail.
- Verified: Sophie blocked on a Monday she normally works, Grace's sick day flagged Margaret Ellis's 09:30 clean for reassignment, end-before-start rejected.

## 2026-08-27 (later) — Guesty integration built, awaiting API credentials

Client confirmed the rules: **every listing**, changeover window **10:00 to 15:00**, **everything lands as a request** for office approval (same as website bookings), and **same-day turnarounds flagged** for manual attention.

`server/guesty.js` implements all of it:
- OAuth2 client-credentials against `https://open-api.guesty.com` with a cached 24h token. Credentials from env: `GUESTY_CLIENT_ID` / `GUESTY_CLIENT_SECRET` (never in the database).
- `importReservations()` is a pure function over normalised data, so the whole pipeline is testable without live credentials.
- Each checkout becomes an `airbnb` changeover: date = checkout, start = 10:00, duration capped at 5h so it always finishes by 15:00, status ALWAYS `requested`, `source: 'guesty'`, `guestyReservationId` for idempotency.
- Each Guesty listing becomes a client (`guestyListingId`), created once.
- Same-day turnaround = another reservation checks IN at that listing on the checkout date → `sameDayTurnaround: true`, red chip, note "must finish by 15:00".
- Cancelled in Guesty → linked booking cancelled here. Extended stays move the date.
- Cleaner picked by postcode proximity from those free and working within the window; leaves `staffId: null` ("Nobody free, assign manually") rather than forcing a bad assignment.
- Field names read defensively (`_id`/`id`, `checkOut`/`checkOutDateLocalized`, `zipcode`/`postcode`) as Guesty varies by account. **Verify against real data on first connect.**

**Verified with sample data** (`POST /api/admin/guesty/sample`, admin only, also a button on the Guesty page): 4 changeovers created from 5 reservations, cancelled stay correctly skipped, 1 same-day flagged, 3 properties created, re-running created 0 duplicates, approve moved requested → booked. The ONLY untested part is the live HTTP call to Guesty, which needs credentials.

**New admin "Guesty" page**: connection status, properties, awaiting approval, same-day count, how-it-works explainer, Sync button (disabled until connected), Load sample button, and the changeover table with inline Approve. Dashboard banner counts pending Guesty approvals and same-day ones in red. Bookings list shows "Guesty" and "Same-day" chips.

**NEXT STEP:** get Client ID + Secret from Guesty (Integrations → API), enter via `npm run keys --prefix klea` (http://localhost:4750), then set the same two values on Railway and hit Sync.

## 2026-08-27 — Client requirement round 2: real logins, roles, Klea checklists, price hiding

**Auth is now real** (`server/auth.js`): scrypt-hashed passwords, 30-day bearer tokens, roles `admin` / `office` / `kleaner`. The old shared DEMO_PASSWORD basic-auth gate is REMOVED (env var cleared on Railway) because real logins replace it. Public pages (booking site, /#/join, /#/my) stay open; `/#/admin` and `/#/cleaner` require login. `X-Robots-Tag: noindex` added so the portal stays out of search.

**Seeded logins** (change before real use):
- Admin: hello@kleahome.co.uk / KleaAdmin2026!
- Office: danielle@kleahome.co.uk / KleaOffice2026!
- Kleaners: firstname@kleahome.co.uk / Kleaner2026! (sophie, priya, dan, aisha, liam, grace)

**Built this round, all verified:**
1. **Individual Kleaner logins** — own portal only. "My day" + "My rota" tabs. No dashboard, no other Kleaners, and typing an admin URL bounces them back (server also returns 403).
2. **Prices hidden from Kleaners** — `stripMoney()` on all cleaner-facing routes. Verified: zero `£` on the Kleaner portal; office still sees prices.
3. **Multiple team logins** — admin-only "Team logins" page: create logins, set access level, link a Kleaner login to their staff record, reset passwords.
4. **Activity trail** — "Activity" page shows who actioned what (bookings added/removed/reassigned, status changes, wages paid, clients added/edited, hires, sign-ins). Recorded from the signed-in user automatically, no name-picking needed.
5. **Klea Standard checklists** — pulled from kleahome.co.uk/#/included. Every job now gets Bedroom / Bathroom / Living room / Kitchen + "Deep clean extras" + Finish (Airbnb also gets Changeover). 30 items on a standard clean, so a domestic clean ticks the standard set and a deep clean ticks everything.
6. **Add-ons rebuilt** to what Klea actually sells: Oven clean £35, Bed change £8 each (with a quantity stepper), Fridge and freezer £18. Plus a **custom amount** field that overrides the whole price.
7. **Per-Kleaner rota** — dropdown or click a Kleaner's name to see only their rota.
8. **Reset demo data** button (Activity page, admin only) restores seeded data before a pitch, keeping logins.

**Open with Mark / client:** Guesty (not "Hostly") API integration for listings + bookings, and the portal subdomain. See chat.

**SECURITY NOTE:** Netlify and Guesty passwords were pasted into chat on 2026-08-27 and should be rotated. Never used them.

## 2026-08-26 — Klea's requirements doc (Google Doc) built in

Client sent a requirements list (Google Doc 1_Bemy…). Built and verified (all 8 by API, payroll drawer + weekend rates visually):
1. **Booking mode toggle** on Bookings page: "Instant confirmation" (default) or "Come in as requests" (settings.bookingMode). Requested bookings show amber with an Approve button (also via drawer status); approval sends the client a confirmation message; unapproved requests are hidden from the rota but hold the slot.
2. **Property size on every job** (e.g. "3 bed" / "160 sqm") in the admin job sheet and Kleaner app, so cover cleaners know the house.
3. **Kleaners set their own hours** in the Kleaner app ("My bits → My hours": day chips + start/finish, saves via PATCH /api/cleaner/:id/hours).
4. **Applications pipeline** already existed; added a "trial" stage (new → interview → trial → offer → hired/rejected).
5. **Weekend pay rates**: optional weekendRate per cleaner (staff drawer field; Dan £15.50/Aisha £15 seeded). Applies Sat+Sun in payroll, breakdowns and P&L wages.
6. **Document uploads**: Kleaners upload DBS/passport/insurance (image or PDF, ≤4MB) from the app ("My documents"); office sees/uploads/deletes them in the staff drawer ("Documents on file").
7. **Kleaners log extra time** ("My bits → Log extra time"): timesheet entries flow into payroll at the day's correct rate.
8. **Client notes editable** in the client drawer; **search bar** on Clients (name/email/postcode/address/phone).
9. **Payroll drill-in**: click any cleaner → drawer with week-by-week breakdown (every job + extra entry as hours × rate applied, weekly totals) + payout history. Weekly pay periods answered by this view.
Deployed to Railway. Answers for the remaining "how does it work / at launch" questions (messaging via IONOS email + WhatsApp, bank connection, client site) sent to Mark in chat.

## 2026-08-26 — Become a Kleaner recruitment, tied into hiring pipeline. LIVE.

- **Public page** `/#/join` ("Become a Kleaner" in site nav): Klea-style hero + their real recruitment perks (choose your hours, we find your customers, paid weekly, first year's insurance covered) + 2-minute application form (contact, patch postcode, transport, day chips, hours, experience, right to work, DBS status, about). Duplicate-email guard. Thank-you state promises reply within two working days.
- **Admin pipeline** on the Staff page: applicant cards (availability/RTW/DBS chips, experience, quote), status dropdown (new → interview → offer → hired/rejected), and **Hire** which creates their cleaner file with availability mapped to rota days and ALL onboarding compliance flagged as outstanding until recorded (verified). Dashboard banner counts new applications.
- Verified locally end to end (apply → list → hire → compliance flags → dashboard count), then **deployed to Railway**. Live db predates the applicant seed, so Chloe Barnes (new) and Marta Nowak (interview) were seeded on the live site via the API (verified live). Note: `railway ssh` isn't set up on this Mac, so live db resets need the Railway dashboard shell.
- Presentation updated: tour is now "Eight parts", step 8 "Hiring, built in" with the /#/join link; PDF regenerated (5 pages, 11 clickable links) and artifact republished.

## 2026-08-26 — pitch doc reframed as customer-facing presentation

pitch-demo-script.html rewritten from an internal crib sheet into a sales presentation addressed to Klea ("Prepared for Klea Home"): benefits-led wording, "Built already, and what we connect at launch" table (no internal "if they ask" framing), FAQs on their own page (now 5 questions incl launch timeline and data ownership), no em dashes (client-facing). Same artifact URL. PDF regenerated as klea/Klea-Platform.pdf (5 pages, 10 clickable links, verified visually); old Klea-Demo-Script.pdf deleted.

## 2026-08-26 — DEPLOYED to Railway on the Railway URL only

- **Live** at https://klea-demo-production.up.railway.app — password-gated (HTTP Basic Auth, any username, password `KleaDemo2026`, set via `DEMO_PASSWORD` env var). Verified live: 401 without password, app + API with it.
- Railway project **klea-demo** (standalone — shares nothing with PM Ops/other apps): Node service (Nixpacks builds Vite then `npm start`), env `NODE_ENV=production`, `DATA_DIR=/data`, dedicated persistent volume `klea-demo-volume` mounted at /data holding the standalone JSON database (self-seeds on first boot; delete /data/db.json via Railway shell to reset demo data).
- Mark decided NOT to touch kleahome.co.uk's DNS: the demo.kleahome.co.uk custom domain was registered then **deleted from Railway** (verified: only the Railway service domain remains). Pitch script updated to use the Railway URL throughout. If a nicer URL is ever wanted without Klea's DNS, point a subdomain of a Prospect Machine domain at it.
- Deploy updates: `npx @railway/cli up --detach` from klea/. Cost estimate: ~$5/month Railway hobby usage (~£0.13/day), well under the $5/day threshold.

## 2026-08-26 (cont) — costs & stock system + pitch demo script

- **Costs & stock page** (admin nav): inventory of the Klea kit (9 products, unit costs, stock counts, reorder thresholds with amber "Low" chips + dashboard low-stock banner), and an expense ledger (categories: supplies, fuel, equipment, insurance, software, marketing, other). "Buy 5" on a stock item adds stock AND logs the expense automatically (verified: mop heads purchase → £57.50 ledger entry). Add item / add expense / delete expense all work.
- **P&L rewired to actuals**: Reports now builds each month from the real expense ledger (supplies category = cost of sales; the rest = overheads, broken down by category for the current month) instead of flat estimates. Wages unchanged (completed cleans × rate). Seeded 4 months of realistic expenses; fixed a timezone bug that pushed day-1 expenses into the prior month.
- **Pitch demo script** published as an artifact (Klea-branded, seven-stop walkthrough with talking points, real-vs-demo table, likely questions): https://claude.ai/code/artifact/9bdea5b8-78f3-465d-a708-72c4c5fcfaa9 (source: klea/pitch-demo-script.html).

## 2026-08-26 — one-place platform: Kleaner app, client portal, auto reminders

Built the three pitch-critical pieces (goal: run the whole business in one place):
- **Kleaner app** (`/#/cleaner`, linked from admin sidebar): mobile-first. Cleaner picks their profile (demo, no password), sees their day (prev/today/next), opens a job: call-client button, key/access notes, add-ons, Start/Finish buttons, tickable checklist, photo upload from phone camera. Verified: Sophie's day, checklist tick 1/20.
- **Client portal** (`/#/my`, "My cleans" in site header): email lookup (demo, no password). Upcoming cleans: **Move it** (date → live slots, keeps their usual cleaner when free) and **Cancel** with the policy applied server-side (free before midday day before, 50% after — verified £32.30 fee on a same-day cancel; late reschedules blocked with a friendly message; wrong-email guarded). Past cleans: job photos + star rating by the client (feeds the same rating stats). Verified in UI as Hannah.
- **Automatic day-before reminders**: server checks hourly (and at boot) and logs an SMS-style reminder for tomorrow's booked cleans (flagged so never duplicated). Verified: Margaret's reminder generated at boot.

Note: portal/cleaner app share the admin API endpoints (no auth in demo). Before real deployment these need proper auth scoping.

## 2026-08-25 (late night) — admin CRUD: add client, add booking, rota +/-, full cleaner files

- **+ Add client** button on Clients (name, email, phone, postcode, address, type, notes; duplicate emails rejected). Verified: created "Sarah Ogden".
- **+ Add booking** button on Bookings opens a drawer: client, service, size, frequency, cleaner ("Auto (closest patch)" or manual), date/time, add-on chips, notes, live price (incl reset-clean first-visit line). Books via new POST /api/admin/bookings (invoice-demo payment + confirmation message). Verified end to end: Sarah's Fri 10:00 clean auto-assigned to Sophie at £116.
- **Rota**: every working cell has a "+" that opens Add booking prefilled with that cleaner + day (verified). Job sheet drawer now has **Remove booking** (permanent DELETE, confirm dialog; cancelled-with-fee still available via status) — endpoint verified.
- **Cleaner files**: staff cards click open a full drawer (21 fields): personal (name, DOB, email, phone, address), work (patch, rate, bio, photo URL), legal (NI number, right-to-work doc + check date, DBS cert number/issued/recheck, contract, COSHH, H&S), emergency contact, masked bank (demo). "+ Add cleaner" uses the same drawer. PATCH deep-merges legal so partial edits keep other fields (verified). New cleaner "Nadia Hussain" (SK8) seeded via test with a complete green compliance record.
- Pages re-fetch automatically when any drawer closes.
- Demo data now includes Sarah Ogden (client) and Nadia Hussain (cleaner) created during verification. Seed staff all carry the full personal/legal record.

## 2026-08-25 (night) — website-style header + full-width hero

Client page now mirrors kleahome.co.uk's layout: sticky ivory header with the klea ✦ wordmark left, nav centre (Home, Pricing, Airbnb & offices, FAQs, muted Team login), terracotta "Get my price" pill right (opens the booking wizard; Airbnb & offices starts an Airbnb booking). Hero is now full-bleed espresso, edge to edge (rounded panel removed). Pricing/FAQs links jump to page anchors; instant scroll (smooth scroll froze in the preview pane and could not be verified). All verified by click-through: nav scrolls to FAQs, Get my price opens the wizard.

## 2026-08-25 (late) — renamed CleanABee → Klea

Company name corrected to Klea everywhere: wordmark (now "klea ✦", matching the live site), page title, FAQs, confirmation/apology messages (sign-off "Klea ✦"), seed data, docs. Project folder renamed `cleanabee/` → `klea/`; launch.json entry is now `klea`. Verified in browser and API after a fresh reseed.

## 2026-08-25 (evening) — Klea rebrand + FAQs with real backend coverage, all verified

**Rebrand to match kleahome.co.uk** (their exact CSS tokens, pulled from the live site): ivory `#FBF8F1` ground, espresso `#2B241C`, terracotta `#B5764C` buttons, sand/ochre accents; Fraunces serif headings + DM Sans body; lowercase serif "klea ✦" wordmark (bee icon retired); espresso hero panel with sparkles. Dark mode remapped to espresso tones. Staff rota colours retoned to the palette.

**All 10 Klea FAQs** now on the client site (accordion under the services grid), localised to Klea/Manchester, and every promise is backed by a real feature — each verified by API test and in the UI:
- "Every clean is photographed and rated" → photo upload section in the admin job sheet (browser-side resize → data URL in db, gallery + delete), 1-5 star rating per clean, average rating stat on the dashboard (currently 4.8★). Seed includes 3 demo photos on the Sun 23 Aug Bramhall job.
- "Free re-clean within 24h" → "Book free re-clean (guarantee)" button creates a £0 linked booking and logs an apology message to the client.
- "First clean priced differently" → recurring plans charge visit 1 at the undiscounted reset-clean rate (verified: £91 first, £78.85 thereafter on a weekly 3-bed).
- "Team Clean" → +£10 toggle in the wizard, halves on-site time (180 cleaner-mins → 90 on site). NOTE: rota/wages still track the one assigned cleaner; a second assigned cleaner is future work.
- "Cancellation policy" → cancelling computes the fee server-side: free before midday the day before, 50% after (verified £32.30 on a £64.60 same-day cancel); shown in the drawer and reflected in the payment record.
- "What areas do you cover" → postcode coverage check (M and SK areas, in seed settings): wizard blocks with a friendly message and the API rejects uncovered postcodes.
Database re-seeded clean after testing.

## 2026-08-25 (later) — profiles, legal, payroll and P&L added, all verified

- **Cleaner profiles**: circular photo + one-line bio on the client booking slots (with a "DBS checked" trust badge), photos across admin (rota rows, staff cards, payroll). Photos are demo portraits from randomuser.me with an initials fallback if offline.
- **Legal/compliance**: Staff page now has a Company legal documents panel (employers' liability, public liability, ICO registration, waste carrier) and per-cleaner checks (DBS + recheck date, right to work, contract, COSHH, health and safety). Anything within 60 days of renewal flags amber, overdue flags red, and a warning banner appears on the Dashboard. Verified: Dan's DBS recheck and the ICO renewal both flag correctly.
- **Payroll page**: wages = hours on completed cleans × hourly rate (each cleaner has a rate). Shows earned/paid/due per cleaner + payout history. "Pay now" records a demo bank transfer. Verified: paid Sophie £54, due went to £0 and totals updated.
- **Reports page (P&L)**: monthly profit and loss over 4 months — revenue (money actually taken), wages, supplies per job, gross profit, fixed overheads (editable in seed settings), net profit and margin. Seeded ~10 weeks of completed job history so the numbers are realistic (loss-making May/June into profit July/August).
- Database was re-seeded for the new fields (delete `server/data/db.json` any time to reset demo data).

**In flight:** nothing.

**Deliberately demo-only:** payments, message sending, payouts (no real bank transfers), no admin login. See CLAUDE.md.

**NEXT STEP:** demo it. To go live: Stripe + Twilio keys via key-form, admin auth, real staff photo uploads, and deploy to Railway (`npm run build` then `npm start`, set `API_PORT`).

---

## 2026-08-25 — v1 built and verified end-to-end

Full two-sided cleaning business app: client booking site (7 services, 12 upsells, subscription discounts, postcode-matched cleaner availability, demo payment, auto confirmation message — mobile tested) + admin side (dashboard KPIs, weekly rota, job sheets with tickable checklists, clients with lifetime value, staff, messages). Booking flow verified end-to-end with a real test booking that appeared on dashboard, rota, clients, payments and messages. Light/dark verified. Seed = 6 cleaners + 8 clients around Manchester.
