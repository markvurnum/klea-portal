import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle, Icon, Avatar, gbp, niceDate } from './ui.jsx';

export default function ClientSite() {
  const [cat, setCat] = useState(null);
  const [booking, setBooking] = useState(null); // active wizard state or null = landing

  useEffect(() => { api.get('/api/catalogue').then(setCat).catch(console.error); }, []);

  // Nav links leave the wizard (if open) and scroll to the section on the landing page
  const navTo = anchor => e => {
    e.preventDefault();
    setBooking(null);
    setTimeout(() => {
      if (anchor) document.getElementById(anchor)?.scrollIntoView();
      else window.scrollTo(0, 0);
    }, 60);
  };

  if (!cat) return <div className="container" style={{ padding: 60 }}>Loading…</div>;

  return (
    <div>
      <header className="site-head">
        <div className="container">
          <a href="#/" onClick={navTo(null)} style={{ textDecoration: 'none' }}><Logo /></a>
          <nav className="site-nav">
            <a href="#/" onClick={navTo(null)}>Home</a>
            <a href="#services" onClick={navTo('services')}>Pricing</a>
            <a href="#services" onClick={e => { e.preventDefault(); setBooking({ serviceId: 'airbnb' }); }}>Airbnb &amp; offices</a>
            <a href="#faqs" onClick={navTo('faqs')}>FAQs</a>
            <a href="#/my">My cleans</a>
            <a href="#/join">Become a Kleaner</a>
            <a href="#/admin" className="muted-link">Team login</a>
          </nav>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <button className="btn gold small" style={{ padding: '9px 18px' }} onClick={() => setBooking({ serviceId: null })}>Get my price</button>
            <ThemeToggle />
          </div>
        </div>
      </header>
      {booking
        ? <Wizard cat={cat} initialService={booking.serviceId} onExit={() => setBooking(null)} />
        : <Landing cat={cat} onBook={serviceId => setBooking({ serviceId })} />}
    </div>
  );
}

function Landing({ cat, onBook }) {
  return (
    <>
      <section className="hero-panel">
        <span className="sparkle-float" style={{ top: 54, left: '21%' }}>✦</span>
        <span className="sparkle-float" style={{ top: 120, right: '19%', fontSize: 11 }}>✦</span>
        <span className="sparkle-float" style={{ bottom: 62, left: '30%', fontSize: 10 }}>✦</span>
        <span className="sparkle-float" style={{ bottom: 110, right: '27%', fontSize: 12 }}>✦</span>
        <div className="container">
          <div className="tagline">Premium home cleaning · Book online</div>
          <h1>A spotless home, without lifting a finger</h1>
          <p>Book online in under two minutes. Vetted, insured cleaners near you, with fair prices you see before you pay.</p>
          <button className="btn gold" style={{ fontSize: 16, padding: '14px 32px' }} onClick={() => onBook(null)}>Book a clean</button>
        </div>
      </section>
      <section className="container" id="services" style={{ paddingTop: 44 }}>
        <h2 style={{ fontSize: 22, marginBottom: 14 }}>What do you need cleaned?</h2>
        <div className="svc-grid">
          {cat.services.map(s => (
            <button key={s.id} className="svc-card" onClick={() => onBook(s.id)}>
              <div className="svc-icon"><Icon name={s.icon} /></div>
              <h3>{s.name}</h3>
              <p>{s.tagline}</p>
              <p style={{ marginTop: 8, fontWeight: 700, color: 'var(--beige-deep)' }}>From {gbp(s.basePrice + (s.sized === 'bedrooms' ? s.perBedroom : s.perUnit * 40))}</p>
            </button>
          ))}
        </div>
      </section>
      {cat.faqs?.length > 0 && (
        <section className="container" id="faqs" style={{ maxWidth: 760, paddingBottom: 80 }}>
          <div style={{ textAlign: 'center', marginBottom: 24 }}>
            <div className="tagline" style={{ color: 'var(--ochre)' }}>Questions</div>
            <h2 style={{ fontSize: 30, marginTop: 8 }}>Good question. Quick answer.</h2>
          </div>
          {cat.faqs.map(f => (
            <details key={f.q} className="faq-item">
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </section>
      )}
    </>
  );
}

const STEPS = ['Service', 'Property', 'Extras', 'Date & time', 'Details & payment', 'Done'];

function Wizard({ cat, initialService, onExit }) {
  const [step, setStep] = useState(initialService ? 1 : 0);
  const [serviceId, setServiceId] = useState(initialService);
  const [size, setSize] = useState(3);
  const [addonIds, setAddonIds] = useState([]);
  const [teamClean, setTeamClean] = useState(false);
  const [coverageError, setCoverageError] = useState('');
  const [frequency, setFrequency] = useState('once');
  const [postcode, setPostcode] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [staffPick, setStaffPick] = useState(null);
  const [avail, setAvail] = useState(null);
  const [details, setDetails] = useState({ name: '', email: '', phone: '', address: '' });
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState(null);

  const svc = cat.services.find(s => s.id === serviceId);
  const [quoteData, setQuoteData] = useState(null);

  useEffect(() => {
    if (!serviceId) return;
    api.post('/api/quote', { serviceId, size, addonIds, frequency, teamClean }).then(setQuoteData).catch(() => {});
  }, [serviceId, size, addonIds, frequency, teamClean]);

  useEffect(() => {
    if (!date || !quoteData) { setAvail(null); return; }
    api.get(`/api/availability?date=${date}&postcode=${encodeURIComponent(postcode)}&duration=${quoteData.durationMins}`)
      .then(setAvail).catch(() => setAvail(null));
    setTime(''); setStaffPick(null);
  }, [date, quoteData?.durationMins, postcode]);

  const relevantAddons = useMemo(
    () => cat.addons.filter(a => !a.for.length || a.for.includes(serviceId)),
    [cat, serviceId]
  );

  async function submit() {
    setError('');
    if (!details.name || !details.email) { setError('Please fill in your name and email.'); return; }
    if (!card.number || card.number.replace(/\s/g, '').length < 12) { setError('Please enter a card number (any digits work in demo mode).'); return; }
    setBusy(true);
    try {
      const res = await api.post('/api/bookings', {
        client: { ...details, postcode },
        serviceId, size, addonIds, frequency, teamClean, date, time,
        staffId: staffPick?.staffId
      });
      setResult(res);
      setStep(5);
    } catch (e) { setError(e.message); }
    setBusy(false);
  }

  const canNext = {
    0: !!serviceId,
    1: !!size && postcode.trim().length >= 5,
    2: true,
    3: !!date && !!time
  }[step];

  // Postcode coverage is confirmed before leaving the property step
  async function next() {
    if (step === 1) {
      try {
        const cov = await api.get('/api/coverage?postcode=' + encodeURIComponent(postcode));
        if (!cov.covered) {
          setCoverageError(`Sorry, we do not cover ${postcode.trim().toUpperCase()} yet. We currently serve ${cov.label}.`);
          return;
        }
        setCoverageError('');
      } catch { /* if the check fails, let the booking endpoint be the backstop */ }
    }
    setStep(s => s + 1);
  }

  return (
    <div className="wizard container">
      <div className="wiz-steps">{STEPS.slice(0, 6).map((s, i) => <span key={s} className={i <= step ? 'on' : ''} />)}</div>

      {step === 0 && (
        <>
          <h2>What kind of clean?</h2>
          <div className="svc-grid" style={{ paddingBottom: 20, gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))' }}>
            {cat.services.map(s => (
              <button key={s.id} className={'svc-card' + (serviceId === s.id ? ' selected' : '')} onClick={() => setServiceId(s.id)}>
                <div className="svc-icon"><Icon name={s.icon} /></div>
                <h3>{s.name}</h3>
              </button>
            ))}
          </div>
        </>
      )}

      {step === 1 && svc && (
        <>
          <h2>{svc.name}</h2>
          <p className="muted" style={{ marginBottom: 20 }}>{svc.tagline}</p>
          <div className="field">
            <label>{svc.sized === 'bedrooms' ? 'Bedrooms' : 'Approximate floor area (square metres)'}</label>
            {svc.sized === 'bedrooms' ? (
              <select value={size} onChange={e => setSize(+e.target.value)}>
                {[1, 2, 3, 4, 5, 6].map(n => <option key={n} value={n}>{n} bedroom{n > 1 ? 's' : ''}</option>)}
              </select>
            ) : (
              <input type="number" min="20" step="10" value={size} onChange={e => setSize(+e.target.value || 0)} />
            )}
          </div>
          <div className="field">
            <label>Your postcode</label>
            <input placeholder="e.g. M20 4EF" value={postcode} onChange={e => setPostcode(e.target.value.toUpperCase())} />
          </div>
          {svc.recurring && (
            <div className="field">
              <label>How often?</label>
              <select value={frequency} onChange={e => setFrequency(e.target.value)}>
                {cat.frequencies.map(f => (
                  <option key={f.id} value={f.id}>{f.name}{f.discount ? ` — save ${Math.round(f.discount * 100)}%` : ''}</option>
                ))}
              </select>
              {frequency !== 'once' && <span className="small muted">Your first visit is a reset clean at the one off rate. Your discounted rate applies from visit two.</span>}
            </div>
          )}
          {coverageError && <p style={{ color: 'var(--bad)', marginTop: 4 }}>{coverageError}</p>}
        </>
      )}

      {step === 2 && (
        <>
          <h2>Anything extra while we're there?</h2>
          <p className="muted" style={{ marginBottom: 18 }}>Popular add-ons, done on the same visit at a bundled price.</p>
          {relevantAddons.map(a => {
            const on = addonIds.includes(a.id);
            return (
              <div key={a.id} className={'addon-row' + (on ? ' on' : '')}
                onClick={() => setAddonIds(ids => on ? ids.filter(x => x !== a.id) : [...ids, a.id])}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div className="tick">{on ? '✓' : ''}</div>
                  <div><b>{a.name}</b><div className="small muted">+{a.mins} mins</div></div>
                </div>
                <b>{gbp(a.price)}</b>
              </div>
            );
          })}
          <div className={'addon-row' + (teamClean ? ' on' : '')} onClick={() => setTeamClean(t => !t)} style={{ marginTop: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div className="tick">{teamClean ? '✓' : ''}</div>
              <div>
                <b>Team Clean: two cleaners, half the time</b>
                <div className="small muted">Same cleaner hours, your home back sooner</div>
              </div>
            </div>
            <b>{gbp(10)}</b>
          </div>
        </>
      )}

      {step === 3 && (
        <>
          <h2>Pick a date and time</h2>
          <div className="field" style={{ maxWidth: 240 }}>
            <label>Date</label>
            <input type="date" min={new Date(Date.now() + 864e5).toISOString().slice(0, 10)} value={date} onChange={e => setDate(e.target.value)} />
          </div>
          {avail && avail.options.length === 0 && <p className="muted">No cleaners free that day, sorry. Try another date.</p>}
          {avail && avail.options.slice(0, 3).map(o => (
            <div key={o.staffId} className="card" style={{ marginBottom: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10, marginBottom: 12 }}>
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', minWidth: 0 }}>
                  <Avatar src={o.photo} name={o.name} size={48} />
                  <div style={{ minWidth: 0 }}>
                    <b>{o.name}</b>
                    {o.bio && <div className="small muted" style={{ lineHeight: 1.35 }}>{o.bio}</div>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, alignItems: 'flex-end', flex: 'none' }}>
                  <span className="chip">{o.proximityLabel}</span>
                  {o.dbsClear && <span className="chip ok">DBS checked ✓</span>}
                </div>
              </div>
              <div className="slot-grid">
                {o.slots.slice(0, 8).map(t => (
                  <button key={t} className={'slot' + (time === t && staffPick?.staffId === o.staffId ? ' on' : '')}
                    onClick={() => { setTime(t); setStaffPick(o); }}>{t}</button>
                ))}
              </div>
            </div>
          ))}
        </>
      )}

      {step === 4 && quoteData && (
        <>
          <h2>Your details</h2>
          <div className="demo-banner">🔒 Demo mode — no real payment is taken. Card details are not stored or sent anywhere.</div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div className="field"><label>Full name</label><input value={details.name} onChange={e => setDetails({ ...details, name: e.target.value })} /></div>
            <div className="field"><label>Email</label><input type="email" value={details.email} onChange={e => setDetails({ ...details, email: e.target.value })} /></div>
            <div className="field"><label>Phone</label><input value={details.phone} onChange={e => setDetails({ ...details, phone: e.target.value })} /></div>
            <div className="field"><label>Address</label><input value={details.address} onChange={e => setDetails({ ...details, address: e.target.value })} /></div>
          </div>
          <h3 style={{ margin: '10px 0 12px', fontSize: 16 }}>Payment</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '0 14px' }}>
            <div className="field"><label>Card number</label><input placeholder="4242 4242 4242 4242" value={card.number} onChange={e => setCard({ ...card, number: e.target.value })} /></div>
            <div className="field"><label>Expiry</label><input placeholder="12/28" value={card.expiry} onChange={e => setCard({ ...card, expiry: e.target.value })} /></div>
            <div className="field"><label>CVC</label><input placeholder="123" value={card.cvc} onChange={e => setCard({ ...card, cvc: e.target.value })} /></div>
          </div>
          <div className="card" style={{ marginTop: 8 }}>
            <div className="summary-line"><span>{quoteData.service} ({svc.sized === 'bedrooms' ? size + ' bed' : size + ' sqm'})</span><span>{gbp(quoteData.base)}</span></div>
            {quoteData.addons.map(a => <div key={a.id} className="summary-line"><span>{a.name}</span><span>{gbp(a.price)}</span></div>)}
            {quoteData.teamSupplement > 0 && <div className="summary-line"><span>Team Clean supplement</span><span>{gbp(quoteData.teamSupplement)}</span></div>}
            {quoteData.discount > 0 && <div className="summary-line" style={{ color: 'var(--good)' }}><span>{quoteData.frequency} discount (from visit two)</span><span>-{gbp(quoteData.discount)}</span></div>}
            {frequency !== 'once' ? (
              <>
                <div className="summary-line total"><span>First visit (reset clean)</span><span>{gbp(quoteData.firstVisitTotal)}</span></div>
                <div className="summary-line"><span>Then {quoteData.frequency.toLowerCase()}</span><b>{gbp(quoteData.total)} per visit</b></div>
              </>
            ) : (
              <div className="summary-line total"><span>Total</span><span>{gbp(quoteData.total)}</span></div>
            )}
            <p className="small muted" style={{ marginTop: 6 }}>
              {niceDate(date)} at {time}{staffPick ? ` with ${staffPick.name}` : ''} · approx {Math.round(quoteData.durationMins / 60 * 10) / 10} hours on site{quoteData.teamClean ? ' with two cleaners' : ''}
            </p>
          </div>
          {error && <p style={{ color: 'var(--bad)', marginTop: 12 }}>{error}</p>}
        </>
      )}

      {step === 5 && result && (
        <div style={{ textAlign: 'center', padding: '30px 0' }}>
          <div style={{ fontSize: 46, color: 'var(--ochre)' }}>✦</div>
          <h2 style={{ margin: '10px 0' }}>{result.bookings[0].status === 'requested' ? 'Request received!' : "You're booked in!"}</h2>
          <p className="muted" style={{ maxWidth: 420, margin: '0 auto 20px' }}>
            {result.bookings[0].status === 'requested'
              ? `We've got your request for ${niceDate(result.bookings[0].date)} at ${result.bookings[0].start} and will confirm it shortly.`
              : `${result.staffName} will be with you on ${niceDate(result.bookings[0].date)} at ${result.bookings[0].start}.`}
            {result.bookings.length > 1 && result.bookings[0].status !== 'requested' && ` We've scheduled your next ${result.bookings.length} visits.`}
          </p>
          <div className="card" style={{ maxWidth: 460, margin: '0 auto', textAlign: 'left' }}>
            <div className="small muted" style={{ marginBottom: 6 }}>Confirmation sent to {result.client.email} (demo):</div>
            <p>{result.confirmationMessage}</p>
          </div>
          <button className="btn" style={{ marginTop: 24 }} onClick={onExit}>Back to home</button>
        </div>
      )}

      {step < 5 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 26 }}>
          <button className="btn ghost" onClick={() => step === 0 || (step === 1 && initialService) ? onExit() : setStep(s => s - 1)}>Back</button>
          {quoteData && step > 0 && step < 4 && <span className="chip" style={{ alignSelf: 'center' }}>{gbp(quoteData.total)} per visit</span>}
          {step < 4
            ? <button className="btn gold" disabled={!canNext} onClick={next}>Continue</button>
            : <button className="btn gold" disabled={busy} onClick={submit}>{busy ? 'Booking…' : `Pay ${quoteData ? gbp(quoteData.firstVisitTotal ?? quoteData.total) : ''} & book`}</button>}
        </div>
      )}
    </div>
  );
}
