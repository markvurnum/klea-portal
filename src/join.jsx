import React, { useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle } from './ui.jsx';

// Become a Kleaner: recruitment page + application form.
// Applications land in the admin hiring pipeline (Staff page).
const PERKS = [
  { icon: '🕰', title: 'Choose your own hours', text: 'Tell us the days and times that suit you. Your rota is built around your life, not the other way round.' },
  { icon: '✦', title: 'We find your customers', text: 'No leaflets, no hustling. Bookings arrive matched to your postcode patch so you spend time cleaning, not travelling.' },
  { icon: '💷', title: 'Paid weekly, every week', text: 'Your hours are tracked automatically on every clean and paid out weekly. No chasing invoices.' },
  { icon: '🛡', title: 'First year’s insurance covered', text: 'We cover your insurance for the first year and provide the full Klea kit of professional products.' }
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Join() {
  const [form, setForm] = useState({
    name: '', email: '', phone: '', postcode: '', transport: 'Own car',
    days: [], hours: 'Flexible', experience: '', rightToWork: 'yes', dbs: 'willing', about: ''
  });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const submit = async e => {
    e.preventDefault();
    setError('');
    if (!form.name || !form.email || !form.postcode) { setError('Please fill in your name, email and postcode.'); return; }
    setBusy(true);
    try {
      await api.post('/api/apply', form);
      setDone(true);
    } catch (err) { setError(err.message); }
    setBusy(false);
  };

  return (
    <div>
      <header className="site-head">
        <div className="container" style={{ height: 64 }}>
          <a href="#/" style={{ textDecoration: 'none' }}><Logo /></a>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <a className="btn ghost small" href="#/">Back to site</a>
            <ThemeToggle />
          </div>
        </div>
      </header>

      <section className="hero-panel">
        <span className="sparkle-float" style={{ top: 50, left: '22%' }}>✦</span>
        <span className="sparkle-float" style={{ bottom: 56, right: '24%', fontSize: 11 }}>✦</span>
        <div className="container">
          <div className="tagline">Join the team</div>
          <h1>Become a Kleaner</h1>
          <p>Great cleaners deserve great work. Steady local clients, fair pay on time, and an app that handles everything except the cleaning.</p>
        </div>
      </section>

      <div className="container" style={{ maxWidth: 860, padding: '40px 20px 80px' }}>
        <div className="svc-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', paddingBottom: 30 }}>
          {PERKS.map(p => (
            <div key={p.title} className="svc-card" style={{ cursor: 'default' }}>
              <div className="svc-icon" style={{ fontSize: 18 }}>{p.icon}</div>
              <h3>{p.title}</h3>
              <p>{p.text}</p>
            </div>
          ))}
        </div>

        {done ? (
          <div className="card" style={{ maxWidth: 560, margin: '0 auto', textAlign: 'center', padding: 36 }}>
            <div style={{ fontSize: 40, color: 'var(--ochre)' }}>✦</div>
            <h2 style={{ margin: '10px 0 8px' }}>Application received</h2>
            <p className="muted">Thanks {form.name.split(' ')[0]}. We read every application personally and will be in touch within two working days. If we think you are a fit, the next step is a friendly chat, then a paid trial clean.</p>
          </div>
        ) : (
          <form className="card" style={{ maxWidth: 640, margin: '0 auto' }} onSubmit={submit}>
            <h2 style={{ fontSize: 20, marginBottom: 4 }}>Apply now</h2>
            <p className="muted small" style={{ marginBottom: 18 }}>Takes about two minutes. No CV needed.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <div className="field"><label>Full name</label><input value={form.name} onChange={e => set({ name: e.target.value })} /></div>
              <div className="field"><label>Email</label><input type="email" value={form.email} onChange={e => set({ email: e.target.value })} /></div>
              <div className="field"><label>Phone</label><input value={form.phone} onChange={e => set({ phone: e.target.value })} /></div>
              <div className="field"><label>Your postcode</label><input placeholder="e.g. M20 4EF" value={form.postcode} onChange={e => set({ postcode: e.target.value.toUpperCase() })} /></div>
              <div className="field"><label>How will you get to cleans?</label>
                <select value={form.transport} onChange={e => set({ transport: e.target.value })}>
                  {['Own car', 'Public transport', 'Bike or on foot'].map(t => <option key={t}>{t}</option>)}
                </select>
              </div>
              <div className="field"><label>Preferred hours</label>
                <select value={form.hours} onChange={e => set({ hours: e.target.value })}>
                  {['Mornings', 'Afternoons', 'Full days', 'Flexible'].map(h => <option key={h}>{h}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label>Days you can work</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {DAYS.map(d => {
                  const on = form.days.includes(d);
                  return (
                    <button type="button" key={d} className={'chip' + (on ? ' ok' : '')} style={{ cursor: 'pointer', border: 'none', padding: '7px 14px' }}
                      onClick={() => set({ days: on ? form.days.filter(x => x !== d) : [...form.days, d] })}>
                      {on ? '✓ ' : ''}{d}
                    </button>
                  );
                })}
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
              <div className="field"><label>Do you have the right to work in the UK?</label>
                <select value={form.rightToWork} onChange={e => set({ rightToWork: e.target.value })}>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </div>
              <div className="field"><label>DBS check</label>
                <select value={form.dbs} onChange={e => set({ dbs: e.target.value })}>
                  <option value="have">I have a current DBS</option>
                  <option value="willing">Happy to get one (we help)</option>
                </select>
              </div>
            </div>
            <div className="field"><label>Any cleaning experience?</label><input placeholder="e.g. two years domestic cleaning, hotel housekeeping, or none yet" value={form.experience} onChange={e => set({ experience: e.target.value })} /></div>
            <div className="field"><label>Tell us a little about you</label><textarea rows="3" value={form.about} onChange={e => set({ about: e.target.value })} placeholder="What do you enjoy about cleaning? What would make this a great job for you?" /></div>
            {error && <p className="small" style={{ color: 'var(--bad)', marginBottom: 10 }}>{error}</p>}
            <button className="btn gold" type="submit" disabled={busy}>{busy ? 'Sending…' : 'Send application'}</button>
          </form>
        )}
      </div>
    </div>
  );
}
