# Klea — HANDOFF

## 2026-09-10 — Demo data cleared, system is go-live ready

**Ran the go-live clear on the live system**, leaving one labelled example on each screen. Backed up twice first: a copy of the data pulled down locally, and a second copy left on the server at `/data/db-before-golive.json`. Railway's daily backups also cover it.

**What is on the live system now:**
- One labelled example each for staff, invoices, messages, costs, applications, time off and stock. All say "EXAMPLE, delete this once you have added your own".
- Two clients and two bookings: the example, plus **Moorehouse**, which is a real Guesty property, and its real changeover on 2027-01-02 sitting as a request.
- Payments, payouts and timesheets empty, as they should be.

**Everything that had to survive, did:** the admin and office logins, the price list and coverage, Guesty instant updates still switched on, Windermere still excluded, the Guesty token still cached so no rate-limited sign-in was burned. Guesty re-synced by itself at 12:18 and pulled the real changeover straight back in.

**Both Sophies are gone.** The duplicate `sophie@kleahome.co.uk` login went with the demo staff, exactly as expected. No duplicate logins remain.

**Live site checked after the clear:** homepage, prices and the booking page all fine.

---

## THE LAST JOB: passwords

**The starter passwords still work on the live site**, and they are written in the code. This is the one thing left that actually matters.

There is a local page for it at `scratchpad/new-passwords.mjs`, run with `node`, opens on http://localhost:4752. It signs in, generates strong passwords for every login, and **shows them once in the browser**. They are never written to a file and never go through the chat. Whoever runs it must copy them somewhere safe before closing the window.

Everyone is signed out when it runs, so do it at handover with someone ready to save them.

---

## Waiting on other people

- The client's GitHub username, so they can be added to the repo
- The SPF record on kleahome.co.uk, from whoever looks after their website
- Klea's own accounts for email (free), Stripe and Twilio, all entered on the Connections page
- GDPR paperwork: ICO registration, privacy policy, how long clean photos are kept

## 2026-09-10 — Where the client puts their keys, and the pre-handover checklist

**All three outside services are set up in one place: Connections.** Sign in at portal.kleahome.co.uk, then Connections in the left menu, between Guesty and Activity. Admin only, so the office login can see it but not change it.

| Panel | What they type | Where it comes from |
|---|---|---|
| Sending emails | Mailbox password | The existing hello@kleahome.co.uk mailbox at IONOS |
| Card payments | Secret key, signing secret | Their Stripe account |
| Text messages | Account SID, auth token, phone number | Their Twilio account |

Nothing goes in a file and nothing goes near GitHub. It is typed into that screen, stored on the server, and never shown again. Each panel has Save and Send test. The Stripe panel checks the key with Stripe before switching on, and flags test keys in amber so nobody trades on them by mistake.

**Fixed today:** a "(demo)" label was still showing to clients on the booking confirmation screen. Gone. There is no demo wording left anywhere a client can see.

---

## STILL TO DO BEFORE HANDOVER

**1. The demo data has NOT been cleared.** The live system still holds 6 made-up staff, 9 made-up clients, 64 bookings, 63 payments, 22 expenses and 2 applications. The button is built and tested (Activity page, "Clear everything and go live", then choose to leave one example on each screen) but it has never been run on live. This is a one-way job so it needs Mark's say-so and the right moment.

**2. The passwords written in the code still work on the live site.** Verified today: the seeded admin password signs straight in to portal.kleahome.co.uk. Those passwords are visible to anyone with the code. Press "Generate strong passwords for everyone" on the Team logins page and save what it shows, once. Do this at handover, not before, or we lock ourselves out.

**3. Two Kleaners share one login.** Sophie Turner and Sophie Hodgin both have sophie@kleahome.co.uk, so only one can sign in and she would see the other's jobs. Clearing the demo data removes both, so doing job 1 fixes this on its own.

**Waiting on other people:**
- The client's GitHub username, so they can be added to the repo
- The SPF record on kleahome.co.uk, from whoever looks after the website
- Klea's own account details for email, Stripe and Twilio
- The GDPR paperwork: ICO registration, privacy policy, how long clean photos are kept

**Order on the day:** clear the demo data with examples left in, add the real Kleaners and clients, generate the passwords, then switch on the Connections one at a time and send a test after each.

## 2026-09-10 — Card payments and texts wired in, plus real backups

**One Connections page** now holds all three outside services: email, card payments, texts. Each is off until filled in, each keeps its secret on the server where no endpoint ever returns it, and the system works fully with all three off.

**Card payments (Stripe).** Clients pay on Stripe's own page, so no card number reaches Klea's server. Key design decisions worth keeping:
- **Only the Stripe webhook marks a payment paid.** A client closing the tab mid-payment can never leave money uncollected but recorded as taken.
- **If Stripe fails, the booking still stands** and the payment is left unpaid for the office to chase. A booking is worth more than a card payment.
- Test keys are flagged in the interface, because trading on test keys for months is an easy and expensive mistake.
- With Stripe off, the booking page stops pretending: it no longer asks for card details and says payment will be sorted directly, and the payment is recorded as **unpaid** rather than the old "authorised".

**Texts (Twilio).** Off by default and clearly labelled as the only thing that costs money, about 4p each. `tidyNumber()` refuses landlines rather than paying for a text that cannot arrive. There is a checkbox to send the day-before reminder by text instead of email, and the page shows how many have gone this month and roughly what they have cost.

**Backups, which were genuinely missing.** Railway had no backup schedule at all. Now a **daily volume backup** with a Restore button, plus one taken immediately (2026-09-10 12:35). Worth being clear: **GitHub backs up the code only.** `server/data/` is gitignored, so adding someone to GitHub does nothing for clients, bookings or staff records.

**One real bug caught by testing:** Stripe's bracketed parameters were being built wrongly, so the amount and currency never reached Stripe. Every payment would have failed. Fixed and covered by a test.

**Tested:** 31 cases against fake Stripe and Twilio. Nothing can be charged or texted while switched off, a mistyped key is refused, test keys are flagged, the right amount in pence and pounds sterling reaches Stripe, a payment under 30p is refused rather than erroring at the till, forged and replayed and altered Stripe notifications are all refused, UK numbers are tidied, landlines refused, and neither secret ever leaves the server. Checked at 375px.

**NEXT STEP:** none of the three can be switched on without Klea's own account details. Email needs the IONOS mailbox password, Stripe needs an account and its keys, texts need a Twilio account. All three go in on the Connections page.

## 2026-09-10 — Emails now actually send, through Klea's own mailbox

**Klea's email is on IONOS, not Google.** So rather than adding a third party, the system sends straight through their own hello@kleahome.co.uk mailbox. Replies land back in that same inbox where the office already works. No new account, no new bill, nothing to pay.

- `server/mailer.js`: a small SMTP client on Node's own TLS, so the project keeps its single dependency. Plain text, UTF-8 base64, so £ and the Klea ✦ arrive intact.
- **Every client message now goes through `notifyClient()`.** Nine separate `db.messages.push` calls collapsed into one path that stores and sends. With no mailbox configured it stores without sending, exactly as before, so nothing breaks un-configured.
- **Set up on the Messages page**, admin only: address, display name, password, save, send a test. The password is stored on the server and **never returned by any endpoint**, not even to the admin screen.
- Every message shows Sent / Sending / Did not send, with the reason.
- Outgoing mail goes on a **queue with a gap between sends**, because IONOS caps at roughly 500 a day and refuses bursts.
- The day-before reminder was written as a text message. It now goes by email, which is free. Texts would cost roughly 4p each.

**Two real bugs found by testing, both fixed:**
1. SMTP servers greet you before you ask anything. That greeting was being thrown away, so every send hung. Replies arriving before anyone waits are now buffered.
2. An unreachable mail server left the send hanging for ever, which would have wedged the whole outgoing queue on the live system. The connect promise now rejects properly.

**Tested:** 22 cases against a fake IONOS speaking real SMTP over TLS. Sends correctly, signs in as the mailbox, From and Reply-To both the Klea address, Message-ID present so replies thread, body exactly intact including £ and ✦, awkward subject lines encoded, wrong password refused in plain English, unreachable server fails cleanly, sending-off refuses, password never leaves the server, batches spaced out. Checked at 375px, no horizontal scroll.

**OUTSTANDING, and it is not ours to do:** kleahome.co.uk has **no SPF and no DMARC record at all**. Emails will deliver less well than they should, and anyone can currently spoof their domain. Their web person needs to add it. This is worth chasing before the client leans on email.

**NEXT STEP:** get the IONOS mailbox password into the Messages page and send a test. Nothing sends until then.

## 2026-09-09 — Guesty instant updates (webhooks), and the client-save fix proven on production

**Client-save complaint: closed.** Verified two ways rather than trusting the earlier fix.
- Ran a scratch copy of the LIVE container's own code against a COPY of the live database. Six cases, all correct: phone-only saves (the exact reported case), email-only saves, both saves, no-contact refused, duplicate email refused, no name refused. Rows came back from the server, opened, edited, and persisted to disk. Live database untouched throughout, 9 clients before and after, scratch copy deleted.
- Drove the real form in a browser: phone-only client saved with a green confirmation and appeared in search; the no-contact case showed a bordered red "Not saved" panel keeping everything typed.

**Guesty now supports instant updates.** Previously a booking made at 10:05 waited until 11:00.
- `POST /api/guesty/webhook` — public by necessity, every delivery must carry a valid Guesty (Svix) signature. Raw body kept by an `express.json` verify hook, since the signature covers the unparsed bytes.
- Admin turns it on from the Guesty page: registers the subscription with Guesty, reads back the signing key, and shows the last update received. Off by default.
- Subscribes to `reservation.created.v2` and `reservation.updated.v2`. There is no cancel event: a cancellation arrives as an update with `subType: CANCELED`, so status is read from the payload rather than the event name.
- **The hourly sync deliberately stays on** as a safety net. Guesty auto-disables an endpoint after five days of failures and only their support can re-enable it.
- All existing rules still hold on the webhook path: enquiries never create a clean, switched-off properties (Windermere) are ignored, cancellations cancel here, everything lands as a request for the office.
- **Same-day turnarounds now work across separate deliveries.** A single webhook only describes its own stay, so stays are remembered in `db.guestyStays` and the flag is recomputed across every upcoming Guesty clean. Previously only detectable within one polled batch.
- `normaliseReservation` now prefers the property's own calendar date (`checkOutDateLocalized`) over the UTC timestamp.

**Tested:** 26 webhook cases pass, including four security cases (no signature, forged signature, replayed old delivery, body altered in transit are all refused), duplicate delivery ignored, enquiry creates nothing, cancellation cancels, guest extension moves the clean, same-day flag appearing across two deliveries, switched-off property ignored. 14 regression cases pass on the hourly-poll path, so nothing existing changed behaviour. Built clean, checked at 375px with no horizontal scroll.

**NEXT STEP:** the code is live but instant updates are **not switched on yet**, because registering the subscription writes to Klea's real Guesty account. Waiting on Mark's go-ahead, then press "Turn on instant updates" on the Guesty page and confirm with a real booking.

## 2026-09-09 — Handover pack done: GitHub auto-deploy live, SETUP.md ready

**The whole point:** someone other than us can now run the portal without a Railway login, without keys pasted anywhere, and without asking us how anything works.

**GitHub → Railway auto-deploy is connected and proven.**
- Railway's GitHub App now has access to `markvurnum/klea-portal` (it did not before, which is why the repo was missing from Railway's picker).
- Service `klea-demo` is connected to the repo, branch `main`, "Auto deploys when pushed to GitHub" enabled.
- **Proven end to end:** pushed commit `7490b1d`, Railway started building 8 seconds later "via GitHub", finished, went ACTIVE, "Deployment successful". No button pressed.
- **No downtime:** polled the live site every 20s straight through the deploy, 14 consecutive HTTP 200s.
- **Nothing lost:** volume intact after the rebuild — staff 6, clients 9, bookings 64, users 10, sessions 53, payments 63, activity 55. Guesty token still cached (so no rate-limited sign-in burned), `guestyExcludedListings` still holds Windermere, hourly sync ran at 14:39 with `lastError: null`.
- Live checks: homepage 200, `/api/catalogue` returning real prices, `/api/auth/login` returning 401 as it should.

**Two handover documents, both in the repo:**
- `CLAUDE.md` — rewritten as a self-contained brief. Claude Code reads it automatically, so a new person gets the business rules, the roles, the Guesty traps and the golden rule without being told.
- `SETUP.md` — fresh-machine guide: install, clone, `npm run keys` for the Guesty credentials via the local form, `npm run dev`, make a change, push. Now states plainly that **pushing to `main` is the whole deployment**, because that is finally true.

**Worth knowing:** switching the Windermere lodge off removed nearly all the Guesty changeovers. There is exactly **one** genuine Guesty booking in the 180-day window now (2027-01-02, Moorehouse, awaiting office approval). That is correct behaviour given Klea's rules (Windermere excluded, enquiries are not bookings), but it does mean Windermere was the bulk of their Guesty volume. Flagging it in case that is a surprise.

**NEXT STEP:** nothing outstanding on the handover itself. The remaining pre-launch work is unchanged: Stripe for real card payments, a real email/SMS provider, automatic backups of the live database, GDPR paperwork, then loading real staff and clients and regenerating everyone's password.

## 2026-09-07 — Guesty properties can be switched off (Windermere excluded)

Klea confirmed they do NOT clean the Windermere lodge (LA23, ~60 miles away), so it must not appear.
- `settings.guestyExcludedListings` holds Guesty listing IDs to ignore. Import skips both the listing and its reservations.
- **"Your properties" panel on the Guesty page** lists every Guesty property with a Switch off / Switch on button, so the office can change this without a code change.
- Switching a property off also **removes its already-imported changeovers** and the property record, so it disappears immediately rather than lingering.
- Verified offline (cannot hit Guesty while rate limited): 3 reservations across 2 properties → excluding one gives 1 imported, 2 skipped, and no property record for the excluded one.

Also earlier today: import window widened 30 → 180 days (holiday lets book months out, Moorehouse and a November Lodge booking were being missed entirely), and Guesty "inquiry" reservations no longer create cleans (an enquiry is not a booking; one was due to come into range on 9 Oct).

## 2026-09-07 — FIXED: "added a client and it didn't save"

**Cause: email was mandatory on the client form.** A phone-only client (very common in domestic cleaning) was silently refused, and the rejection showed as small red text that is easy to miss. The activity trail confirmed it: no "added a client" event ever reached the server, while a direct API test created one first time, proving the server side was fine.

Fixes:
- **Email is now optional.** Name required, plus an email OR a phone number. Email is only needed if that client wants their own "My cleans" login.
- All email comparisons made null-safe (`server/index.js` booking creation, portal lookup, applications), so a client with no email cannot break booking or the portal.
- Rejections now show as a bordered red "Not saved" panel, successes show a green confirmation, and the button shows "Saving…".
- **Added client delete** (`DELETE /api/admin/clients/:id`), refuses while they still have live bookings unless forced. There was previously no way to remove a client added by mistake.
- Verified: phone-only client saves, name-only and contactless entries still rejected, booking and portal unaffected.

**Guesty confirmed healthy and NOT needing new keys.** Syncing hourly with no errors, last sync 2026-09-07 12:03. 5 changeovers imported across the period, including a cancellation correctly applied on 09-05 and a replacement booking imported on 09-06. The rate limit cleared on its own after the back-off fix.

## 2026-09-02 — Invoices with paid/unpaid and overdue chasing

For clients who come direct rather than booking online. `db.invoices`: `{ clientId, bookingId?, number, amount, issuedDate, dueDate, status, paidDate, file, notes }`.
- **New Invoices page** (admin nav): outstanding / overdue / need-chasing totals, filters (Needs chasing, Unpaid, Paid, All), add invoice against any client.
- **Also in the client drawer** ("Invoices" with an outstanding chip) and **in the job sheet** ("Invoice for this job"), so an invoice can hang off a client or a specific booking.
- Upload a PDF or photo of the invoice, view it later in a new tab. Non PDF/image uploads rejected, 4MB cap.
- Due date defaults to 14 day terms if left blank. Unpaid + past due = `needsChasing`, shown as a red "N days overdue" chip, counted on the Invoices page and flagged on the dashboard.
- Mark paid / mark unpaid toggle, records the paid date. All actions go to the activity trail.
- Verified end to end: overdue invoice correctly flagged 6 days over, within-terms one correctly not flagged, marking paid cleared the chase, file retrievable, bad file type rejected, dashboard counter correct.

NOTE: invoice files are stored as data URLs in the JSON database, same as staff documents. Fine at this size; for real volume they should move to object storage.

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
