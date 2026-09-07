import React, { useEffect, useMemo, useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle, Icon, Avatar, gbp, niceDate } from './ui.jsx';

const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'grid' },
  { id: 'rota', label: 'Rota', icon: 'calendar' },
  { id: 'bookings', label: 'Bookings', icon: 'clipboard' },
  { id: 'clients', label: 'Clients', icon: 'users' },
  { id: 'staff', label: 'Staff', icon: 'users' },
  { id: 'payroll', label: 'Payroll', icon: 'pound' },
  { id: 'costs', label: 'Costs & stock', icon: 'box' },
  { id: 'invoices', label: 'Invoices', icon: 'pound' },
  { id: 'reports', label: 'Reports', icon: 'chart' },
  { id: 'messages', label: 'Messages', icon: 'chat' },
  { id: 'guesty', label: 'Guesty', icon: 'key' },
  { id: 'activity', label: 'Activity', icon: 'clipboard' },
  { id: 'logins', label: 'Team logins', icon: 'users', adminOnly: true }
];

const stateChip = state =>
  state === 'ok' ? 'chip ok' : state === 'due-soon' ? 'chip warn' : 'chip bad';

export default function Admin({ page, user, onSignOut }) {
  const nav = NAV.filter(n => !n.adminOnly || user.role === 'admin');
  const current = nav.some(n => n.id === page) ? page : 'dashboard';
  const [drawer, setDrawer] = useState(null); // {type:'booking'|'client'|'newBooking'|'staff', ...}
  const [refresh, setRefresh] = useState(0);  // bump to re-fetch the page behind a drawer
  useEffect(() => { setDrawer(null); }, [page]);

  // Drawers can change data (status, checklist, deletes, new records),
  // so the page behind always re-fetches when one closes.
  const closeDrawer = () => {
    setDrawer(null);
    setRefresh(r => r + 1);
  };

  return (
    <div className="admin">
      <aside className="side">
        <a href="#/" style={{ textDecoration: 'none' }}><Logo small /></a>
        {nav.map(n => (
          <a key={n.id} href={'#/admin/' + n.id} className={'nav' + (current === n.id ? ' on' : '')}>
            <Icon name={n.icon} size={17} /> {n.label}
          </a>
        ))}
        <div style={{ marginTop: 'auto', padding: '10px 8px' }}>
          <div className="small" style={{ fontWeight: 700 }}>{user.name}</div>
          <div className="small muted" style={{ textTransform: 'capitalize', marginBottom: 8 }}>{user.role}</div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <ThemeToggle />
            <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
          </div>
          <a className="small muted" href="#/" style={{ textDecoration: 'none', display: 'block', marginTop: 8 }}>View client site →</a>
        </div>
      </aside>
      <main className="main">
        {current === 'dashboard' && <Dashboard key={refresh} openBooking={id => setDrawer({ type: 'booking', id })} />}
        {current === 'rota' && <Rota key={refresh} openBooking={id => setDrawer({ type: 'booking', id })} openNewBooking={pre => setDrawer({ type: 'newBooking', ...pre })} />}
        {current === 'bookings' && <Bookings key={refresh} openBooking={id => setDrawer({ type: 'booking', id })} openNewBooking={() => setDrawer({ type: 'newBooking' })} />}
        {current === 'clients' && <Clients key={refresh} openClient={id => setDrawer({ type: 'client', id })} />}
        {current === 'staff' && <Staff key={refresh} openStaff={id => setDrawer({ type: 'staff', id })} />}
        {current === 'payroll' && <Payroll key={refresh} openPayrollDetail={id => setDrawer({ type: 'payroll', id })} />}
        {current === 'costs' && <Costs key={refresh} />}
        {current === 'invoices' && <Invoices key={refresh} openClient={id => setDrawer({ type: 'client', id })} />}
        {current === 'reports' && <Reports key={refresh} />}
        {current === 'messages' && <Messages key={refresh} />}
        {current === 'guesty' && <Guesty key={refresh} user={user} openBooking={id => setDrawer({ type: 'booking', id })} />}
        {current === 'activity' && <Activity key={refresh} />}
        {current === 'logins' && user.role === 'admin' && <Logins key={refresh} />}
      </main>
      {drawer?.type === 'booking' && <BookingDrawer id={drawer.id} onClose={closeDrawer} />}
      {drawer?.type === 'client' && <ClientDrawer id={drawer.id} onClose={closeDrawer} />}
      {drawer?.type === 'newBooking' && <NewBookingDrawer preStaffId={drawer.staffId} preDate={drawer.date} onClose={closeDrawer} />}
      {drawer?.type === 'staff' && <StaffDrawer id={drawer.id} onClose={closeDrawer} />}
      {drawer?.type === 'payroll' && <PayrollDrawer id={drawer.id} onClose={closeDrawer} />}
    </div>
  );
}

// ---------- Dashboard ----------
function Dashboard({ openBooking }) {
  const [sum, setSum] = useState(null);
  useEffect(() => { api.get('/api/admin/summary').then(setSum); }, []);
  if (!sum) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>Dashboard</h1>
      <p className="muted">Today at a glance</p>
      <div className="stat-row">
        <div className="stat"><div className="big">{sum.todayJobs.length}</div><div className="lbl">Cleans today</div></div>
        <div className="stat"><div className="big">{sum.upcomingCount}</div><div className="lbl">Booked next 7 days</div></div>
        <div className="stat"><div className="big">{sum.clients}</div><div className="lbl">Clients</div></div>
        <div className="stat"><div className="big">{sum.subscriptions}</div><div className="lbl">Active subscriptions</div></div>
        <div className="stat"><div className="big">{gbp(sum.revenueMonth)}</div><div className="lbl">Taken this month</div></div>
        <div className="stat"><div className="big">{gbp(sum.revenueBookedAhead)}</div><div className="lbl">Booked ahead</div></div>
        {sum.avgRating && <div className="stat"><div className="big">{sum.avgRating}<span style={{ color: 'var(--ochre)' }}> ★</span></div><div className="lbl">Average clean rating</div></div>}
      </div>
      {sum.invoicesChasing > 0 && (
        <div className="demo-banner" style={{ borderColor: 'var(--bad)' }}>
          💷 <b>{sum.invoicesChasing} invoice{sum.invoicesChasing > 1 ? 's' : ''} overdue, {gbp(sum.invoicesChasingTotal)} to chase</b>
          {' '}— see <a href="#/admin/invoices">Invoices</a>.
        </div>
      )}
      {sum.guestyPending > 0 && (
        <div className="demo-banner" style={{ borderColor: sum.guestySameDay ? 'var(--bad)' : 'var(--warn)' }}>
          🏠 <b>{sum.guestyPending} Guesty changeover{sum.guestyPending > 1 ? 's' : ''} awaiting approval</b>
          {sum.guestySameDay > 0 && <span style={{ color: 'var(--bad)' }}> · {sum.guestySameDay} same-day turnaround{sum.guestySameDay > 1 ? 's' : ''}</span>}
          {' '}— review on the <a href="#/admin/guesty">Guesty page</a>.
        </div>
      )}
      {sum.newApplicants > 0 && (
        <div className="demo-banner">
          🐝 <b>{sum.newApplicants} new Kleaner application{sum.newApplicants > 1 ? 's' : ''}</b> waiting on the <a href="#/admin/staff">Staff page</a>.
        </div>
      )}
      {sum.lowStock?.length > 0 && (
        <div className="demo-banner" style={{ borderColor: 'var(--warn)' }}>
          📦 <b>Low stock:</b> {sum.lowStock.map(i => `${i.name} (${i.stock} left)`).join(' · ')} — reorder on the <a href="#/admin/costs">Costs &amp; stock page</a>.
        </div>
      )}
      {sum.complianceAlerts?.length > 0 && (
        <div className="demo-banner" style={{ borderColor: 'var(--warn)' }}>
          ⚠️ <b>Compliance needs attention:</b>{' '}
          {sum.complianceAlerts.map(a => `${a.who}: ${a.label.toLowerCase()} (${a.detail.toLowerCase()})`).join(' · ')}
          {' '}— see the <a href="#/admin/staff">Staff page</a>.
        </div>
      )}
      <h2 style={{ fontSize: 17, margin: '6px 0 10px' }}>Today's cleans</h2>
      <div className="card" style={{ padding: 0 }}>
        {sum.todayJobs.length === 0 && <p className="muted" style={{ padding: 20 }}>Nothing scheduled today.</p>}
        <table className="tbl">
          <tbody>
            {sum.todayJobs.map(b => (
              <tr key={b.id} onClick={() => openBooking(b.id)}>
                <td style={{ width: 70 }}><b>{b.start}</b></td>
                <td><b>{b.clientName}</b><div className="small muted">{b.serviceName} · {b.clientPostcode}</div></td>
                <td><span className="dot" style={{ background: b.staffColour, display: 'inline-block', marginRight: 6 }} />{b.staffName}</td>
                <td className="small muted">{b.checklistDone}/{b.checklistTotal} checklist</td>
                <td><span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span></td>
                <td style={{ textAlign: 'right' }}><b>{gbp(b.price)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- Rota ----------
function Rota({ openBooking, openNewBooking }) {
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); // Monday
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState(null);
  const [only, setOnly] = useState('all');
  const [timeOff, setTimeOff] = useState(false);
  const load = () => api.get('/api/admin/rota?start=' + start).then(setData);
  useEffect(() => { load(); }, [start]);

  const shift = n => {
    const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + n * 7);
    setStart(d.toISOString().slice(0, 10));
  };
  if (!data) return <p className="muted">Loading…</p>;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
        <div><h1>Rota</h1><p className="muted">Week of {niceDate(data.days[0])}</p></div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={only} onChange={e => setOnly(e.target.value)}
            style={{ padding: '7px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)', fontSize: 13 }}>
            <option value="all">All Kleaners</option>
            {data.staff.map(s => <option key={s.id} value={s.id}>{s.name} only</option>)}
          </select>
          <button className="btn ghost small" onClick={() => shift(-1)}>← Prev</button>
          <button className="btn ghost small" onClick={() => shift(1)}>Next →</button>
          <button className={'btn small ' + (timeOff ? 'gold' : 'ghost')} onClick={() => setTimeOff(t => !t)}>
            {timeOff ? 'Close' : '🌴 Time off'}
          </button>
        </div>
      </div>
      {timeOff && <TimeOff staff={data.staff} absences={data.absences || []} onChanged={load} />}

      <div className="rota">
        <div className="rota-grid">
          <div />
          {data.days.map(d => <div key={d} className={'rota-head' + (d === today ? ' today' : '')}>{niceDate(d)}</div>)}
          {data.staff.filter(s => only === 'all' || s.id === +only).map(s => (
            <React.Fragment key={s.id}>
              <div className="staff-name-cell" style={{ cursor: 'pointer' }} title={only === 'all' ? `Show only ${s.name}` : 'Show all Kleaners'}
                onClick={() => setOnly(only === 'all' ? String(s.id) : 'all')}>
                <Avatar src={s.photo} name={s.name} size={28} />{s.name.split(' ')[0]}<span className="small muted">{s.postcode.split(' ')[0]}</span>
              </div>
              {data.days.map(d => {
                const jobs = data.bookings.filter(b => b.staffId === s.id && b.date === d).sort((a, b) => a.start.localeCompare(b.start));
                const working = s.days.includes(new Date(d + 'T12:00:00').getDay());
                const off = (data.absences || []).find(x => x.staffId === s.id && x.from <= d && x.to >= d);
                if (off) return (
                  <div key={d} className="rota-cell rota-off" title={off.note || off.type}>
                    <div className="rota-off-label">{ABSENCE_LABEL[off.type] || 'Off'}</div>
                    {jobs.map(b => (
                      <div key={b.id} className="rota-job" style={{ background: 'var(--bad)', color: '#fff' }} onClick={() => openBooking(b.id)}>
                        ⚠ {b.start} {b.clientName.split(' ')[0]}
                      </div>
                    ))}
                  </div>
                );
                return (
                  <div key={d} className="rota-cell" style={!working ? { background: 'var(--surface2)', opacity: 0.55 } : {}}>
                    {jobs.map(b => (
                      <div key={b.id} className="rota-job" style={{ background: s.colour }} onClick={() => openBooking(b.id)}>
                        {b.start} {b.clientName.split(' ')[0]} · {b.clientPostcode?.split(' ')[0]}
                      </div>
                    ))}
                    {working && (
                      <button className="rota-add" title={`Add booking for ${s.name.split(' ')[0]} on ${d}`}
                        onClick={() => openNewBooking({ staffId: s.id, date: d })}>+</button>
                    )}
                  </div>
                );
              })}
            </React.Fragment>
          ))}
        </div>
      </div>
      <p className="small muted" style={{ marginTop: 12 }}>
        Time off is blocked out and nobody on leave gets offered new work, including Guesty changeovers.
        Click a Kleaner's name (or use the dropdown) to see just their rota. Jobs are auto-matched to the Kleaner whose postcode patch is closest to the client, so routes stay tight.
      </p>
    </>
  );
}

// ---------- Bookings ----------
function Bookings({ openBooking, openNewBooking }) {
  const [rows, setRows] = useState(null);
  const [filter, setFilter] = useState('upcoming');
  const [settings, setSettings] = useState(null);
  const load = () => api.get('/api/admin/bookings').then(setRows);
  useEffect(() => { load(); api.get('/api/admin/settings').then(setSettings); }, []);
  if (!rows) return <p className="muted">Loading…</p>;
  const today = new Date().toISOString().slice(0, 10);
  const shown = rows.filter(b =>
    filter === 'upcoming' ? b.date >= today && b.status !== 'cancelled'
      : filter === 'past' ? b.date < today
        : true);

  const setMode = mode => api.post('/api/admin/settings', { bookingMode: mode }).then(setSettings);
  const approve = (e, b) => {
    e.stopPropagation();
    api.patch('/api/admin/bookings/' + b.id, { status: 'booked' }).then(load);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Bookings</h1>
        <button className="btn gold small" onClick={openNewBooking}>+ Add booking</button>
      </div>
      <div style={{ display: 'flex', gap: 8, margin: '14px 0', alignItems: 'center', flexWrap: 'wrap' }}>
        {['upcoming', 'past', 'all'].map(f => (
          <button key={f} className={'btn small ' + (filter === f ? 'gold' : 'ghost')} onClick={() => setFilter(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
        ))}
        {settings && (
          <span style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
            <span className="small muted">New website bookings:</span>
            <select value={settings.bookingMode} onChange={e => setMode(e.target.value)}
              style={{ padding: '6px 10px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)', fontSize: 13 }}>
              <option value="instant">Instant confirmation</option>
              <option value="request">Come in as requests</option>
            </select>
          </span>
        )}
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>When</th><th>Client</th><th>Service</th><th>Cleaner</th><th>Status</th><th style={{ textAlign: 'right' }}>Price</th></tr></thead>
          <tbody>
            {shown.map(b => (
              <tr key={b.id} onClick={() => openBooking(b.id)}>
                <td><b>{niceDate(b.date)}</b> <span className="muted">{b.start}</span></td>
                <td><b>{b.clientName}</b><div className="small muted">{b.clientPostcode}</div></td>
                <td>
                  {b.serviceName}
                  {b.seriesId && <span className="chip" style={{ marginLeft: 6 }}>↻</span>}
                  {b.source === 'guesty' && <span className="chip" style={{ marginLeft: 6 }}>Guesty</span>}
                  {b.sameDayTurnaround && <span className="chip bad" style={{ marginLeft: 6 }}>Same-day</span>}
                </td>
                <td><span className="dot" style={{ background: b.staffColour, display: 'inline-block', marginRight: 6 }} />{b.staffName}</td>
                <td>
                  <span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span>
                  {b.status === 'requested' && <button className="btn gold small" style={{ marginLeft: 8, padding: '3px 12px' }} onClick={e => approve(e, b)}>Approve</button>}
                </td>
                <td style={{ textAlign: 'right' }}><b>{gbp(b.price)}</b></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- Booking drawer (job sheet + checklist + photos) ----------
// Photos are resized in the browser before upload so the demo database stays small.
function resizeToDataUrl(file, maxPx = 900) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, maxPx / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.8));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function BookingDrawer({ id, onClose }) {
  const [b, setB] = useState(null);
  const [staff, setStaff] = useState([]);
  const [uploading, setUploading] = useState(false);
  const [recleanDone, setRecleanDone] = useState(null);
  useEffect(() => {
    api.get('/api/admin/bookings/' + id).then(setB);
    api.get('/api/admin/staff').then(r => setStaff(r.staff));
  }, [id]);

  if (!b) return null;
  const sections = [...new Set(b.checklist.map(i => i.section))];

  const toggle = item => api.post(`/api/admin/bookings/${b.id}/checklist/${item.id}`).then(setB);
  const update = patch => api.patch('/api/admin/bookings/' + b.id, patch).then(setB);

  const addPhoto = async file => {
    if (!file) return;
    setUploading(true);
    try {
      const dataUrl = await resizeToDataUrl(file);
      setB(await api.post(`/api/admin/bookings/${b.id}/photos`, { dataUrl, caption: file.name.replace(/\.[a-z]+$/i, '') }));
    } catch (e) { alert(e.message); }
    setUploading(false);
  };

  const bookReclean = async () => {
    try {
      const res = await api.post(`/api/admin/bookings/${b.id}/reclean`, {});
      setRecleanDone(res.reclean);
    } catch (e) { alert(e.message); }
  };

  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <div className="drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div>
            <h2 style={{ fontSize: 20 }}>{b.serviceName} <span className="chip" style={{ verticalAlign: 'middle' }}>{b.sizeLabel}</span></h2>
            <p className="muted small">
              {niceDate(b.date)} at {b.start} · approx {Math.round(b.durationMins / 60 * 10) / 10}h · {gbp(b.price)}{b.seriesId ? ' per visit' : ''}
              {b.teamClean && <span className="chip" style={{ marginLeft: 8 }}>Team ×2</span>}
              {b.recleanOf && <span className="chip warn" style={{ marginLeft: 8 }}>Free re-clean</span>}
            </p>
            {b.status === 'cancelled' && b.cancellationFee != null && (
              <p className="small" style={{ color: 'var(--bad)' }}>
                Cancellation fee: {gbp(b.cancellationFee)} {b.cancellationFee === 0 ? '(cancelled before midday the day before, free of charge)' : '(cancelled after midday the day before, 50% applies)'}
              </p>
            )}
          </div>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>

        <div className="card" style={{ margin: '16px 0' }}>
          <b>{b.clientName}</b>
          <div className="small muted">{b.clientAddress} · {b.clientPostcode} · {b.clientPhone}</div>
          {b.clientNotes && <div className="small" style={{ marginTop: 6 }}>📌 {b.clientNotes}</div>}
          {b.notes && <div className="small" style={{ marginTop: 6 }}>📝 {b.notes}</div>}
          {b.addonNames.length > 0 && <div style={{ marginTop: 8, display: 'flex', gap: 6, flexWrap: 'wrap' }}>{b.addonNames.map(a => <span key={a} className="chip">{a}</span>)}</div>}
        </div>

        <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
          <select className="field" style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)' }}
            value={b.staffId} onChange={e => update({ staffId: +e.target.value })}>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
          <select style={{ padding: '8px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)' }}
            value={b.status} onChange={e => update({ status: e.target.value })}>
            {['requested', 'booked', 'in_progress', 'completed', 'cancelled'].map(s => <option key={s} value={s}>{s === 'booked' && b.status === 'requested' ? 'booked (approve)' : s.replace('_', ' ')}</option>)}
          </select>
        </div>

        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Photos — {b.photoCount} on file</h3>
        <p className="small muted" style={{ marginBottom: 8 }}>Every clean is photographed. Upload finished-room photos before marking the clean complete.</p>
        {b.photos?.length > 0 && (
          <div className="photo-grid" style={{ marginBottom: 10 }}>
            {b.photos.map(p => (
              <div key={p.id} className="photo-cell">
                <img src={p.dataUrl} alt={p.caption || 'Job photo'} />
                <div className="cap">{p.caption || 'Photo'}</div>
                <button className="del" title="Delete photo" onClick={() => api.del(`/api/admin/bookings/${b.id}/photos/${p.id}`).then(setB)}>×</button>
              </div>
            ))}
          </div>
        )}
        <label className="btn ghost small" style={{ marginBottom: 18, display: 'inline-flex' }}>
          {uploading ? 'Uploading…' : '+ Add photo'}
          <input type="file" accept="image/*" style={{ display: 'none' }} onChange={e => { addPhoto(e.target.files[0]); e.target.value = ''; }} />
        </label>

        <h3 style={{ fontSize: 15, margin: '4px 0 4px' }}>Clean rating</h3>
        <div className="star-row" style={{ marginBottom: 14 }}>
          {[1, 2, 3, 4, 5].map(n => (
            <button key={n} className={b.rating >= n ? 'on' : ''} onClick={() => update({ rating: b.rating === n ? null : n })}>★</button>
          ))}
          <span className="small muted" style={{ marginLeft: 6 }}>{b.rating ? `${b.rating}/5` : 'Not rated yet'}</span>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18 }}>
          {!b.recleanOf && !recleanDone && (
            <button className="btn ghost small" onClick={bookReclean}>
              Book free re-clean (guarantee)
            </button>
          )}
          <button className="btn ghost small" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
            onClick={async () => {
              if (!window.confirm(`Remove this booking for ${b.clientName} on ${b.date}? This deletes it entirely (use the cancelled status instead if the cancellation fee should apply).`)) return;
              await api.del('/api/admin/bookings/' + b.id);
              onClose();
            }}>
            Remove booking
          </button>
        </div>
        {recleanDone && (
          <p className="small" style={{ color: 'var(--good)', marginBottom: 14 }}>
            ✓ Free re-clean booked for {niceDate(recleanDone.date)} at {recleanDone.start} with {recleanDone.staffName}. The client has been messaged.
          </p>
        )}

        <JobInvoice booking={b} />

        <h3 style={{ fontSize: 15, marginBottom: 6 }}>Checklist — {b.checklistDone}/{b.checklistTotal} done</h3>
        {sections.map(sec => (
          <div key={sec} style={{ marginBottom: 14 }}>
            <div className="small" style={{ fontWeight: 700, color: 'var(--beige-deep)', margin: '10px 0 2px' }}>{sec}</div>
            {b.checklist.filter(i => i.section === sec).map(i => (
              <div key={i.id} className={'check-item' + (i.done ? ' done' : '')} onClick={() => toggle(i)}>
                <div className="box">{i.done ? '✓' : ''}</div>
                <span className="txt">{i.label}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Clients ----------
function Clients({ openClient }) {
  const [rows, setRows] = useState(null);
  const [search, setSearch] = useState('');
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', phone: '', postcode: '', address: '', type: 'residential', notes: '' });
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);
  const load = () => api.get('/api/admin/clients').then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows) return <p className="muted">Loading…</p>;

  const addClient = async () => {
    setError(''); setSaved('');
    if (!form.name.trim()) { setError('Please enter the client\'s name.'); return; }
    if (!form.email.trim() && !form.phone.trim()) {
      setError('Add an email or a phone number so you can contact them.'); return;
    }
    setSaving(true);
    try {
      const c = await api.post('/api/admin/clients', form);
      setForm({ name: '', email: '', phone: '', postcode: '', address: '', type: 'residential', notes: '' });
      setAdding(false);
      setSaved(`${c.name} added.`);
      setTimeout(() => setSaved(''), 4000);
      await load();
    } catch (e) { setError(e.message); }
    setSaving(false);
  };

  const removeClient = async (e, c) => {
    e.stopPropagation();
    if (!window.confirm(`Remove ${c.name}? This also removes their bookings, invoices and messages.`)) return;
    try { await api.del('/api/admin/clients/' + c.id); load(); }
    catch (err) { window.alert(err.message); }
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Clients</h1>
        <button className="btn gold small" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add client'}</button>
      </div>
      {adding && (
        <div className="card" style={{ margin: '14px 0' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0 14px' }}>
            <div className="field"><label>Name (required)</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Email (optional)</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} placeholder="Needed only for their own login" /></div>
            <div className="field"><label>Phone</label><input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label>Postcode</label><input value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value.toUpperCase() })} /></div>
            <div className="field"><label>Address</label><input value={form.address} onChange={e => setForm({ ...form, address: e.target.value })} /></div>
            <div className="field"><label>Type</label>
              <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
                {['residential', 'airbnb', 'landlord', 'office', 'commercial'].map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>
          <div className="field"><label>Notes (keys, pets, access)</label><input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} /></div>
          <p className="small muted" style={{ marginBottom: 10 }}>An email or a phone number is needed. Email is only required if they want to sign in and manage their own cleans.</p>
          {error && (
            <div className="demo-banner" style={{ borderColor: 'var(--bad)', borderStyle: 'solid', color: 'var(--bad)', marginBottom: 10 }}>
              <b>Not saved.</b> {error}
            </div>
          )}
          <button className="btn" onClick={addClient} disabled={saving}>{saving ? 'Saving…' : 'Save client'}</button>
        </div>
      )}
      {saved && (
        <div className="demo-banner" style={{ borderColor: 'var(--good)', color: 'var(--good)', margin: '12px 0' }}>
          ✓ {saved}
        </div>
      )}
      <div style={{ display: 'flex', gap: 14, alignItems: 'center', margin: '10px 0 16px', flexWrap: 'wrap' }}>
        <input placeholder="Search name, email, postcode or address…" value={search} onChange={e => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 240, padding: '10px 14px', borderRadius: 12, border: '1.5px solid var(--line)', background: 'var(--surface)', color: 'var(--ink)' }} />
        <span className="muted small">{rows.length} clients · {rows.filter(r => r.subscriber).length} on repeat plans</span>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Client</th><th>Type</th><th>Next visit</th><th>Bookings</th><th style={{ textAlign: 'right' }}>Lifetime value</th><th /></tr></thead>
          <tbody>
            {rows.filter(c => {
              const q = search.trim().toLowerCase();
              if (!q) return true;
              return [c.name, c.email, c.postcode, c.address, c.phone].some(v => (v || '').toLowerCase().includes(q));
            }).map(c => (
              <tr key={c.id} onClick={() => openClient(c.id)}>
                <td><b>{c.name}</b><div className="small muted">{c.postcode} · {c.email}</div></td>
                <td><span className="chip" style={{ textTransform: 'capitalize' }}>{c.type}</span>{c.subscriber && <span className="chip" style={{ marginLeft: 6 }}>↻ repeat</span>}</td>
                <td>{c.nextVisit ? c.nextVisit : <span className="muted">—</span>}</td>
                <td>{c.totalBookings}</td>
                <td style={{ textAlign: 'right' }}><b>{gbp(c.lifetimeValue)}</b></td>
                <td style={{ textAlign: 'right', width: 40 }}>
                  <button className="btn ghost small" style={{ padding: '2px 9px', color: 'var(--bad)' }}
                    title={`Remove ${c.name}`} onClick={e => removeClient(e, c)}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function ClientDrawer({ id, onClose }) {
  const [c, setC] = useState(null);
  useEffect(() => { api.get('/api/admin/clients/' + id).then(setC); }, [id]);
  if (!c) return null;
  return (
    <>
      <div className="drawer-back" onClick={onClose} />
      <div className="drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
          <div><h2 style={{ fontSize: 20 }}>{c.name}</h2><p className="muted small">{c.address} · {c.postcode}<br />{c.email} · {c.phone}</p></div>
          <button className="btn ghost small" onClick={onClose}>Close</button>
        </div>
        <div className="card" style={{ margin: '14px 0' }}>
          <label className="small" style={{ fontWeight: 700, color: 'var(--muted)' }}>Notes (keys, pets, access, preferences)</label>
          <textarea rows="2" defaultValue={c.notes} id={'client-notes-' + c.id}
            style={{ width: '100%', marginTop: 6, padding: '10px 12px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)', color: 'var(--ink)', font: 'inherit' }} />
          <button className="btn ghost small" style={{ marginTop: 8 }}
            onClick={() => api.patch('/api/admin/clients/' + c.id, { notes: document.getElementById('client-notes-' + c.id).value }).then(setC)}>
            Save notes
          </button>
        </div>
        <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>Booking history</h3>
        {c.bookings.map(b => (
          <div key={b.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div><b>{b.serviceName}</b><div className="small muted">{niceDate(b.date)} at {b.start} · {b.staffName}</div></div>
            <div style={{ textAlign: 'right' }}><span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span><div><b>{gbp(b.price)}</b></div></div>
          </div>
        ))}
        <ClientInvoices clientId={c.id} invoices={c.invoices || []} onChanged={() => api.get('/api/admin/clients/' + c.id).then(setC)} />

        <h3 style={{ fontSize: 15, margin: '16px 0 8px' }}>Messages</h3>
        {c.messages.length === 0 && <p className="muted small">No messages yet.</p>}
        {c.messages.map(m => (
          <div key={m.id} className="msg">
            <div className="small muted" style={{ marginBottom: 4 }}>{m.channel.toUpperCase()} · {new Date(m.createdAt).toLocaleString('en-GB')}</div>
            {m.body}
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Staff ----------
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
function Staff({ openStaff }) {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/api/admin/staff').then(setData); }, []);
  if (!data) return <p className="muted">Loading…</p>;

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Staff</h1>
        <button className="btn gold small" onClick={() => openStaff(null)}>+ Add cleaner</button>
      </div>

      <Applicants />

      <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>Company legal documents</h2>
      <div className="card" style={{ padding: 0, marginBottom: 8 }}>
        <table className="tbl">
          <tbody>
            {data.companyLegal.map(d => (
              <tr key={d.id} style={{ cursor: 'default' }}>
                <td><b>{d.name}</b><div className="small muted">{d.detail}</div></td>
                <td style={{ textAlign: 'right' }}>
                  <span className={stateChip(d.state)}>
                    {d.state === 'ok' ? `Valid until ${d.expires}` : d.state === 'due-soon' ? `Renew soon · ${d.expires}` : `Overdue · ${d.expires}`}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginBottom: 18 }}>Employers' liability insurance is a legal requirement as soon as you employ anyone. New starters need a right to work check before their first shift.</p>

      <h2 style={{ fontSize: 16, margin: '4px 0 10px' }}>Cleaners</h2>
      <p className="small muted" style={{ marginBottom: 10 }}>Click a cleaner to open their full file: personal details, right to work, DBS, training, emergency contact and payroll details.</p>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {data.staff.map(s => (
          <div key={s.id} className="card" style={{ cursor: 'pointer' }} onClick={() => openStaff(s.id)}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
              <Avatar src={s.photo} name={s.name} size={52} />
              <div style={{ minWidth: 0 }}>
                <b>{s.name}</b> {!s.active && <span className="status cancelled">inactive</span>}
                <div className="small muted">{gbp(s.rate)}/hr · patch {s.postcode} · {s.phone}</div>
              </div>
            </div>
            {s.bio && <p className="small muted" style={{ fontStyle: 'italic', marginBottom: 8 }}>“{s.bio}”</p>}
            <div className="small muted" style={{ marginBottom: 10 }}>Works {s.days.map(d => DAY_NAMES[d]).join(', ')} · {s.start}–{s.end}</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
              {s.compliance.map(c => (
                <span key={c.label} className={stateChip(c.state)} title={c.detail}>
                  {c.state === 'ok' ? '✓' : c.state === 'due-soon' ? '⏳' : '✗'} {c.label}
                </span>
              ))}
            </div>
            {s.compliance.some(c => c.state !== 'ok') && (
              <p className="small" style={{ color: 'var(--warn)', marginBottom: 8 }}>
                {s.compliance.filter(c => c.state !== 'ok').map(c => `${c.label}: ${c.detail}`).join(' · ')}
              </p>
            )}
            <div style={{ display: 'flex', gap: 8 }}>
              <span className="chip">{s.jobsToday} today</span>
              <span className="chip">{s.jobsWeek} this week</span>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Payroll ----------
function Payroll({ openPayrollDetail }) {
  const [data, setData] = useState(null);
  const [paying, setPaying] = useState(null);
  const load = () => api.get('/api/admin/payroll').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <p className="muted">Loading…</p>;

  const totalDue = data.staff.reduce((t, s) => t + s.due, 0);

  const pay = async s => {
    setPaying(s.staffId);
    try { await api.post('/api/admin/payroll/pay', { staffId: s.staffId }); await load(); }
    catch (e) { alert(e.message); }
    setPaying(null);
  };

  return (
    <>
      <h1>Payroll</h1>
      <div className="demo-banner" style={{ marginTop: 12 }}>Demo mode — payouts are recorded here, no real bank transfer is made. Wages are hours on completed cleans plus logged extra time, at each cleaner's rate (weekend rate on Sat and Sun where set). Click a cleaner for their week-by-week breakdown.</div>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
        <div className="stat"><div className="big">{gbp(totalDue)}</div><div className="lbl">Total wages due</div></div>
        <div className="stat"><div className="big">{gbp(data.staff.reduce((t, s) => t + s.paid, 0))}</div><div className="lbl">Paid out to date</div></div>
        <div className="stat"><div className="big">{Math.round(data.staff.reduce((t, s) => t + s.hours, 0))}h</div><div className="lbl">Hours worked (all time)</div></div>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 24 }}>
        <table className="tbl">
          <thead><tr><th>Cleaner</th><th>Rate</th><th>Jobs done</th><th>Hours</th><th>Earned</th><th>Paid</th><th>Due</th><th /></tr></thead>
          <tbody>
            {data.staff.map(s => (
              <tr key={s.staffId} onClick={() => openPayrollDetail(s.staffId)}>
                <td><div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Avatar src={s.photo} name={s.name} size={34} /><b>{s.name}</b></div></td>
                <td>{gbp(s.rate)}/hr{s.weekendRate ? <span className="small muted"> · {gbp(s.weekendRate)} wknd</span> : ''}</td>
                <td>{s.jobsDone}</td>
                <td>{s.hours}h</td>
                <td>{gbp(s.earned)}</td>
                <td className="muted">{gbp(s.paid)}</td>
                <td><b style={s.due > 0 ? { color: 'var(--beige-deep)' } : {}}>{gbp(s.due)}</b></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn gold small" disabled={s.due <= 0 || paying === s.staffId} onClick={e => { e.stopPropagation(); pay(s); }}>
                    {paying === s.staffId ? 'Paying…' : 'Pay now'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Payout history</h2>
      {data.payouts.map(p => (
        <div key={p.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div><b>{p.staffName}</b><div className="small muted">{p.period} · {p.method}</div></div>
          <div style={{ textAlign: 'right' }}><b>{gbp(p.amount)}</b><div className="small muted">{niceDate(p.date)}</div></div>
        </div>
      ))}
    </>
  );
}

// ---------- Reports (P&L) ----------
function Reports() {
  const [data, setData] = useState(null);
  useEffect(() => { api.get('/api/admin/pnl').then(setData); }, []);
  if (!data) return <p className="muted">Loading…</p>;
  const cur = data.months.find(m => m.current);

  return (
    <>
      <h1>Reports</h1>
      <p className="muted">Profit and loss by month. Revenue counts money actually taken; wages come from completed cleans.</p>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="stat"><div className="big">{gbp(cur.revenue)}</div><div className="lbl">Revenue this month</div></div>
        <div className="stat"><div className="big">{gbp(cur.wages)}</div><div className="lbl">Wages this month</div></div>
        <div className="stat"><div className="big" style={{ color: cur.net >= 0 ? 'var(--good)' : 'var(--bad)' }}>{gbp(cur.net)}</div><div className="lbl">Net profit this month</div></div>
        <div className="stat"><div className="big">{cur.margin}%</div><div className="lbl">Net margin</div></div>
      </div>

      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 20 }}>
        <table className="tbl">
          <thead><tr><th />{data.months.map(m => <th key={m.label} style={{ textAlign: 'right' }}>{m.label}{m.current ? ' (so far)' : ''}</th>)}</tr></thead>
          <tbody>
            {[
              ['Cleans completed', m => m.jobs],
              ['Revenue', m => gbp(m.revenue)],
              ['Wages', m => '-' + gbp(m.wages)],
              ['Supplies and materials', m => '-' + gbp(m.supplies)],
              ['Gross profit', m => gbp(m.gross), true],
              ['Overheads', m => '-' + gbp(m.overheads)],
              ['Net profit', m => gbp(m.net), true],
              ['Net margin', m => m.margin + '%']
            ].map(([label, fn, strong]) => (
              <tr key={label} style={{ cursor: 'default' }}>
                <td>{strong ? <b>{label}</b> : label}</td>
                {data.months.map(m => (
                  <td key={m.label} style={{ textAlign: 'right', ...(label === 'Net profit' ? { color: m.net >= 0 ? 'var(--good)' : 'var(--bad)', fontWeight: 700 } : strong ? { fontWeight: 700 } : {}) }}>
                    {fn(m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 8 }}>This month's overheads by category ({gbp(cur.overheads)})</h2>
      <div className="card" style={{ padding: 0, maxWidth: 520 }}>
        <table className="tbl">
          <tbody>
            {Object.entries(cur.byCategory || {}).map(([cat, amt]) => (
              <tr key={cat} style={{ cursor: 'default' }}><td style={{ textTransform: 'capitalize' }}>{cat}</td><td style={{ textAlign: 'right' }}>{gbp(amt)}</td></tr>
            ))}
            {Object.keys(cur.byCategory || {}).length === 0 && <tr style={{ cursor: 'default' }}><td className="muted">No overheads recorded yet this month</td><td /></tr>}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ marginTop: 10 }}>Wages come from completed cleans × hourly rates. Supplies and overheads come from the expense ledger on the Costs &amp; stock page, so the P&amp;L always reflects what was actually spent.</p>
    </>
  );
}

// ---------- Messages ----------
function Messages() {
  const [rows, setRows] = useState(null);
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState({ clientId: '', channel: 'sms', body: '' });
  const load = () => api.get('/api/admin/messages').then(setRows);
  useEffect(() => { load(); api.get('/api/admin/clients').then(setClients); }, []);
  if (!rows) return <p className="muted">Loading…</p>;

  const send = async () => {
    if (!form.clientId || !form.body) return;
    await api.post('/api/admin/messages', form);
    setForm({ ...form, body: '' });
    load();
  };

  return (
    <>
      <h1>Messages</h1>
      <div className="demo-banner" style={{ marginTop: 12 }}>Demo mode — messages are logged here, not actually sent. Plug in Twilio / email keys to go live.</div>
      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>To</label>
            <select value={form.clientId} onChange={e => setForm({ ...form, clientId: e.target.value })}>
              <option value="">Choose a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>Channel</label>
            <select value={form.channel} onChange={e => setForm({ ...form, channel: e.target.value })}>
              <option value="sms">SMS</option><option value="email">Email</option>
            </select>
          </div>
        </div>
        <div className="field" style={{ marginTop: 12 }}>
          <label>Message</label>
          <textarea rows="3" value={form.body} onChange={e => setForm({ ...form, body: e.target.value })} placeholder="Hi, just confirming your clean tomorrow at 9am…" />
        </div>
        <button className="btn gold" onClick={send} disabled={!form.clientId || !form.body}>Send (demo)</button>
      </div>
      {rows.map(m => (
        <div key={m.id} className="msg">
          <div className="small muted" style={{ marginBottom: 4 }}>
            To <b>{m.clientName}</b> · {m.channel.toUpperCase()} · {new Date(m.createdAt).toLocaleString('en-GB')}
          </div>
          {m.body}
        </div>
      ))}
    </>
  );
}

// ---------- New booking drawer (admin) ----------
function NewBookingDrawer({ preStaffId, preDate, onClose }) {
  const [cat, setCat] = useState(null);
  const [clients, setClients] = useState([]);
  const [staff, setStaff] = useState([]);
  const [form, setForm] = useState({
    clientId: '', serviceId: 'house-regular', size: 3, addonIds: [], addonQty: {}, frequency: 'once',
    date: preDate || new Date().toISOString().slice(0, 10), time: '09:00',
    staffId: preStaffId || '', notes: '', customAmount: ''
  });
  const [quote, setQuote] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/api/catalogue').then(setCat);
    api.get('/api/admin/clients').then(setClients);
    api.get('/api/admin/staff').then(r => setStaff(r.staff.filter(s => s.active)));
  }, []);

  useEffect(() => {
    api.post('/api/quote', {
      serviceId: form.serviceId, size: +form.size || 1, addonIds: form.addonIds,
      addonQty: form.addonQty, frequency: form.frequency,
      customAmount: form.customAmount === '' ? null : form.customAmount
    }).then(setQuote).catch(() => setQuote(null));
  }, [form.serviceId, form.size, form.addonIds, form.addonQty, form.frequency, form.customAmount]);

  if (!cat) return null;
  const svc = cat.services.find(s => s.id === form.serviceId);
  const relevantAddons = cat.addons.filter(a => !a.for.length || a.for.includes(form.serviceId));
  const set = patch => setForm(f => ({ ...f, ...patch }));

  const submit = async () => {
    setError('');
    setBusy(true);
    try {
      await api.post('/api/admin/bookings', { ...form, size: +form.size || 1, staffId: form.staffId || null });
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <>
      <div className="drawer-back" onClick={() => onClose()} />
      <div className="drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 14 }}>
          <h2 style={{ fontSize: 20 }}>Add booking</h2>
          <button className="btn ghost small" onClick={() => onClose()}>Close</button>
        </div>
        <div className="field">
          <label>Client</label>
          <select value={form.clientId} onChange={e => set({ clientId: e.target.value })}>
            <option value="">Choose a client…</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.name} ({c.postcode})</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <div className="field">
            <label>Service</label>
            <select value={form.serviceId} onChange={e => set({ serviceId: e.target.value, addonIds: [] })}>
              {cat.services.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>{svc?.sized === 'bedrooms' ? 'Bedrooms' : 'Floor area (sqm)'}</label>
            <input type="number" min="1" value={form.size} onChange={e => set({ size: e.target.value })} />
          </div>
          <div className="field">
            <label>Frequency</label>
            <select value={form.frequency} onChange={e => set({ frequency: e.target.value })}>
              {cat.frequencies.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Cleaner</label>
            <select value={form.staffId} onChange={e => set({ staffId: e.target.value })}>
              <option value="">Auto (closest patch)</option>
              {staff.map(s => <option key={s.id} value={s.id}>{s.name} ({s.postcode.split(' ')[0]})</option>)}
            </select>
          </div>
          <div className="field"><label>Date</label><input type="date" value={form.date} onChange={e => set({ date: e.target.value })} /></div>
          <div className="field"><label>Start time</label><input type="time" step="1800" value={form.time} onChange={e => set({ time: e.target.value })} /></div>
        </div>
        <div className="field">
          <label>Add-ons</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {relevantAddons.map(ad => {
              const on = form.addonIds.includes(ad.id);
              const qty = form.addonQty[ad.id] || 1;
              return (
                <span key={ad.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                  <button type="button" className={'chip' + (on ? ' ok' : '')} style={{ cursor: 'pointer', border: 'none' }}
                    onClick={() => set({ addonIds: on ? form.addonIds.filter(x => x !== ad.id) : [...form.addonIds, ad.id] })}>
                    {on ? '✓ ' : ''}{ad.name} {gbp(ad.price)}{ad.perUnit ? ' each' : ''}
                  </button>
                  {on && ad.perUnit && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                      <button type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                        onClick={() => set({ addonQty: { ...form.addonQty, [ad.id]: Math.max(1, qty - 1) } })}>−</button>
                      <b className="small" style={{ minWidth: 16, textAlign: 'center' }}>{qty}</b>
                      <button type="button" className="btn ghost small" style={{ padding: '2px 8px' }}
                        onClick={() => set({ addonQty: { ...form.addonQty, [ad.id]: qty + 1 } })}>+</button>
                      <span className="small muted">{ad.unitLabel}</span>
                    </span>
                  )}
                </span>
              );
            })}
          </div>
        </div>
        <div className="field">
          <label>Custom amount (optional, overrides the calculated price)</label>
          <input value={form.customAmount} onChange={e => set({ customAmount: e.target.value })} placeholder="e.g. 95" />
        </div>
        <div className="field"><label>Notes</label><input value={form.notes} onChange={e => set({ notes: e.target.value })} placeholder="Access, priorities, anything the cleaner needs" /></div>
        {quote && (
          <div className="card" style={{ marginBottom: 14 }}>
            <div className="summary-line"><span>Approx {Math.round(quote.durationMins / 60 * 10) / 10}h on site</span>
              <b>{form.frequency === 'once' || quote.customAmount !== null ? gbp(quote.total) : `${gbp(quote.firstVisitTotal)} first, then ${gbp(quote.total)}`}</b></div>
            {quote.customAmount !== null && <p className="small" style={{ color: 'var(--beige-deep)' }}>Custom amount applied. Kleaners never see this figure.</p>}
            {form.frequency !== 'once' && <p className="small muted">Books the next 6 visits. First visit is charged at the reset-clean rate.</p>}
          </div>
        )}
        {error && <p className="small" style={{ color: 'var(--bad)', marginBottom: 10 }}>{error}</p>}
        <button className="btn gold" disabled={!form.clientId || busy} onClick={submit}>{busy ? 'Booking…' : 'Add booking'}</button>
      </div>
    </>
  );
}

// ---------- Staff drawer: the full cleaner file (personal + legal record) ----------
// Defined at top level so React keeps input identity (and focus) across renders.
function F({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div className="field"><label>{label}</label><input type={type} value={value || ''} placeholder={placeholder} onChange={e => onChange(e.target.value)} /></div>
  );
}

const EMPTY_STAFF = {
  name: '', email: '', phone: '', address: '', dob: '', postcode: '', rate: '12.50', bio: '', photo: '',
  niNumber: '', bank: '',
  emergencyContact: { name: '', phone: '' },
  legal: {
    rightToWork: { document: '', checkedOn: '' },
    dbs: { status: 'clear', certNumber: '', issued: '', recheckDue: '' },
    contract: { signedOn: '' },
    training: { coshh: '', healthSafety: '' }
  }
};

function StaffDrawer({ id, onClose }) {
  const isNew = id == null;
  const [form, setForm] = useState(isNew ? EMPTY_STAFF : null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isNew) return;
    api.get('/api/admin/staff').then(r => {
      const s = r.staff.find(x => x.id === id);
      setForm({
        ...EMPTY_STAFF, ...s,
        rate: String(s.rate ?? ''),
        emergencyContact: { ...EMPTY_STAFF.emergencyContact, ...(s.emergencyContact || {}) },
        legal: {
          rightToWork: { ...EMPTY_STAFF.legal.rightToWork, ...(s.legal?.rightToWork || {}) },
          dbs: { ...EMPTY_STAFF.legal.dbs, ...(s.legal?.dbs || {}) },
          contract: { ...EMPTY_STAFF.legal.contract, ...(s.legal?.contract || {}) },
          training: { ...EMPTY_STAFF.legal.training, ...(s.legal?.training || {}) }
        }
      });
    });
  }, [id]);

  if (!form) return null;
  const set = patch => setForm(f => ({ ...f, ...patch }));
  const setLegal = (section, patch) => setForm(f => ({ ...f, legal: { ...f.legal, [section]: { ...f.legal[section], ...patch } } }));

  const saveStaff = async () => {
    setError('');
    if (!form.name) { setError('Name is required.'); return; }
    setBusy(true);
    try {
      const payload = { ...form, rate: +form.rate || 12.5, weekendRate: form.weekendRate ? +form.weekendRate : null };
      if (isNew) await api.post('/api/admin/staff', payload);
      else await api.patch('/api/admin/staff/' + id, payload);
      onClose();
    } catch (e) { setError(e.message); setBusy(false); }
  };

  return (
    <>
      <div className="drawer-back" onClick={() => onClose()} />
      <div className="drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 6 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {!isNew && <Avatar src={form.photo} name={form.name} size={46} />}
            <h2 style={{ fontSize: 20 }}>{isNew ? 'New cleaner' : form.name}</h2>
          </div>
          <button className="btn ghost small" onClick={() => onClose()}>Close</button>
        </div>
        <p className="small muted" style={{ marginBottom: 14 }}>This is the cleaner's legal employment file. Right to work must be verified before their first shift; keep DBS, training and contract dates current.</p>

        <h3 style={{ fontSize: 15, margin: '8px 0 6px' }}>Personal details</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <F label="Full name" value={form.name} onChange={v => set({ name: v })} />
          <F label="Date of birth" type="date" value={form.dob} onChange={v => set({ dob: v })} />
          <F label="Email" value={form.email} onChange={v => set({ email: v })} />
          <F label="Phone" value={form.phone} onChange={v => set({ phone: v })} />
        </div>
        <F label="Home address" value={form.address} onChange={v => set({ address: v })} />

        <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Work</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <F label="Patch postcode" value={form.postcode} onChange={v => set({ postcode: v.toUpperCase() })} />
          <F label="Hourly rate (£)" value={form.rate} onChange={v => set({ rate: v })} />
          <F label="Weekend rate (£, optional)" value={form.weekendRate || ''} onChange={v => set({ weekendRate: v })} placeholder="Applies Sat and Sun" />
        </div>
        <F label="Profile line (shown to clients when booking)" value={form.bio} onChange={v => set({ bio: v })} />
        <F label="Photo URL" value={form.photo} onChange={v => set({ photo: v })} placeholder="Link to their profile photo" />

        <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Legal record</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <F label="National Insurance number" value={form.niNumber} onChange={v => set({ niNumber: v.toUpperCase() })} placeholder="QQ 12 34 56 A" />
          <F label="Right to work document" value={form.legal.rightToWork.document} onChange={v => setLegal('rightToWork', { document: v })} placeholder="e.g. UK passport" />
          <F label="Right to work checked on" type="date" value={form.legal.rightToWork.checkedOn} onChange={v => setLegal('rightToWork', { checkedOn: v })} />
          <F label="DBS certificate number" value={form.legal.dbs.certNumber} onChange={v => setLegal('dbs', { certNumber: v })} />
          <F label="DBS issued" type="date" value={form.legal.dbs.issued} onChange={v => setLegal('dbs', { issued: v })} />
          <F label="DBS recheck due" type="date" value={form.legal.dbs.recheckDue} onChange={v => setLegal('dbs', { recheckDue: v })} />
          <F label="Contract signed on" type="date" value={form.legal.contract.signedOn} onChange={v => setLegal('contract', { signedOn: v })} />
          <F label="COSHH training" type="date" value={form.legal.training.coshh} onChange={v => setLegal('training', { coshh: v })} />
          <F label="Health and safety training" type="date" value={form.legal.training.healthSafety} onChange={v => setLegal('training', { healthSafety: v })} />
        </div>

        {!isNew && <StaffDocuments staffId={id} />}

        <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Emergency contact</h3>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
          <F label="Name and relationship" value={form.emergencyContact.name} onChange={v => set({ emergencyContact: { ...form.emergencyContact, name: v } })} />
          <F label="Phone" value={form.emergencyContact.phone} onChange={v => set({ emergencyContact: { ...form.emergencyContact, phone: v } })} />
        </div>

        <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Payroll</h3>
        <F label="Bank account (masked, demo)" value={form.bank} onChange={v => set({ bank: v })} placeholder="e.g. Monzo •••• 1234" />

        {error && <p className="small" style={{ color: 'var(--bad)', margin: '6px 0' }}>{error}</p>}
        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button className="btn gold" disabled={busy} onClick={saveStaff}>{busy ? 'Saving…' : isNew ? 'Add cleaner' : 'Save changes'}</button>
          {!isNew && (
            <button className="btn ghost small" onClick={async () => { await api.patch('/api/admin/staff/' + id, { active: !form.active }); onClose(); }}>
              {form.active ? 'Mark inactive' : 'Reactivate'}
            </button>
          )}
        </div>
      </div>
    </>
  );
}

// ---------- Costs & stock ----------
const EXPENSE_CATS = ['supplies', 'fuel', 'equipment', 'insurance', 'software', 'marketing', 'other'];

function Costs() {
  const [data, setData] = useState(null);
  const [itemForm, setItemForm] = useState({ name: '', unitCost: '', stock: '', reorderAt: '' });
  const [expForm, setExpForm] = useState({ date: new Date().toISOString().slice(0, 10), category: 'supplies', description: '', amount: '' });
  const [addingItem, setAddingItem] = useState(false);
  const load = () => api.get('/api/admin/costs').then(setData);
  useEffect(() => { load(); }, []);
  if (!data) return <p className="muted">Loading…</p>;

  const adjust = (item, delta, purchase = false) => {
    if (purchase && !window.confirm(`Record buying ${delta} × ${item.name} at ${gbp(item.unitCost)} each? This adds ${gbp(delta * item.unitCost)} to the expense ledger.`)) return;
    api.post(`/api/admin/inventory/${item.id}/adjust`, { delta, purchase }).then(load);
  };

  const addItem = async () => {
    if (!itemForm.name) return;
    await api.post('/api/admin/inventory', itemForm);
    setItemForm({ name: '', unitCost: '', stock: '', reorderAt: '' });
    setAddingItem(false);
    load();
  };

  const addExpense = async () => {
    if (!expForm.amount) return;
    await api.post('/api/admin/expenses', expForm);
    setExpForm({ ...expForm, description: '', amount: '' });
    load();
  };

  return (
    <>
      <h1>Costs &amp; stock</h1>
      <p className="muted">Everything spent here flows straight into the P&amp;L on the Reports page.</p>
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="stat"><div className="big">{gbp(data.monthSpend)}</div><div className="lbl">Spent this month</div></div>
        <div className="stat"><div className="big">{gbp(data.stockValue)}</div><div className="lbl">Stock on hand (value)</div></div>
        <div className="stat"><div className="big" style={data.lowStock.length ? { color: 'var(--warn)' } : {}}>{data.lowStock.length}</div><div className="lbl">Items to reorder</div></div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '6px 0 10px' }}>
        <h2 style={{ fontSize: 16 }}>The Klea kit (inventory)</h2>
        <button className="btn gold small" onClick={() => setAddingItem(a => !a)}>{addingItem ? 'Cancel' : '+ Add item'}</button>
      </div>
      {addingItem && (
        <div className="card" style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
          <div className="field" style={{ margin: 0 }}><label>Item</label><input value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>Unit cost £</label><input value={itemForm.unitCost} onChange={e => setItemForm({ ...itemForm, unitCost: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>In stock</label><input value={itemForm.stock} onChange={e => setItemForm({ ...itemForm, stock: e.target.value })} /></div>
          <div className="field" style={{ margin: 0 }}><label>Reorder at</label><input value={itemForm.reorderAt} onChange={e => setItemForm({ ...itemForm, reorderAt: e.target.value })} /></div>
          <button className="btn" onClick={addItem}>Save</button>
        </div>
      )}
      <div className="card" style={{ padding: 0, overflowX: 'auto', marginBottom: 22 }}>
        <table className="tbl">
          <thead><tr><th>Item</th><th>Unit cost</th><th>In stock</th><th /><th style={{ textAlign: 'right' }}>Restock</th></tr></thead>
          <tbody>
            {data.inventory.map(i => (
              <tr key={i.id} style={{ cursor: 'default' }}>
                <td><b>{i.name}</b></td>
                <td>{gbp(i.unitCost)}</td>
                <td>
                  <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn ghost small" style={{ padding: '2px 10px' }} onClick={() => adjust(i, -1)}>−</button>
                    <b>{i.stock}</b>
                    <button className="btn ghost small" style={{ padding: '2px 10px' }} onClick={() => adjust(i, 1)}>+</button>
                  </span>
                </td>
                <td>{i.low && <span className="chip warn">Low, reorder at {i.reorderAt}</span>}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn gold small" onClick={() => adjust(i, 5, true)}>Buy 5 ({gbp(i.unitCost * 5)})</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="small muted" style={{ margin: '-12px 0 22px' }}>The − button records usage; Buy adds stock and logs the cost as a supplies expense automatically.</p>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Expense ledger</h2>
      <div className="card" style={{ marginBottom: 12, display: 'grid', gridTemplateColumns: '150px 150px 2fr 110px auto', gap: 12, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={expForm.date} onChange={e => setExpForm({ ...expForm, date: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label>Category</label>
          <select value={expForm.category} onChange={e => setExpForm({ ...expForm, category: e.target.value })}>
            {EXPENSE_CATS.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}><label>Description</label><input value={expForm.description} onChange={e => setExpForm({ ...expForm, description: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label>Amount £</label><input value={expForm.amount} onChange={e => setExpForm({ ...expForm, amount: e.target.value })} /></div>
        <button className="btn" onClick={addExpense}>Add</button>
      </div>
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Date</th><th>Category</th><th>Description</th><th style={{ textAlign: 'right' }}>Amount</th><th /></tr></thead>
          <tbody>
            {data.expenses.map(e => (
              <tr key={e.id} style={{ cursor: 'default' }}>
                <td>{niceDate(e.date)}</td>
                <td><span className="chip" style={{ textTransform: 'capitalize' }}>{e.category}</span></td>
                <td>{e.description || <span className="muted">—</span>}</td>
                <td style={{ textAlign: 'right' }}><b>{gbp(e.amount)}</b></td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost small" style={{ padding: '2px 10px' }} title="Delete expense"
                    onClick={() => { if (window.confirm(`Delete ${gbp(e.amount)} ${e.category} expense?`)) api.del('/api/admin/expenses/' + e.id).then(load); }}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ---------- Kleaner applications (hiring pipeline) ----------
const APP_STATUSES = ['new', 'interview', 'trial', 'offer', 'hired', 'rejected'];

function Applicants() {
  const [rows, setRows] = useState(null);
  const [hired, setHired] = useState(null);
  const load = () => api.get('/api/admin/applicants').then(setRows);
  useEffect(() => { load(); }, []);
  if (!rows || rows.length === 0) return null;
  const open = rows.filter(a => a.status !== 'rejected');
  if (open.length === 0) return null;

  const setStatus = (a, status) => api.patch('/api/admin/applicants/' + a.id, { status }).then(load);
  const hire = async a => {
    if (!window.confirm(`Hire ${a.name}? This creates their cleaner file, ready for onboarding.`)) return;
    const res = await api.post(`/api/admin/applicants/${a.id}/hire`, {});
    setHired(res.staff);
    load();
  };

  return (
    <>
      <h2 style={{ fontSize: 16, margin: '18px 0 8px' }}>Kleaner applications</h2>
      {hired && (
        <div className="demo-banner" style={{ borderColor: 'var(--good)' }}>
          ✓ <b>{hired.name} hired.</b> Their cleaner file has been created below. Complete onboarding there: right to work check, DBS, contract and training all show as outstanding until recorded.
        </div>
      )}
      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {open.map(a => (
          <div key={a.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', gap: 8 }}>
              <div>
                <b>{a.name}</b>
                <div className="small muted">{a.postcode} · {a.phone} · applied {niceDate(a.appliedAt.slice(0, 10))}</div>
              </div>
              <span className="chip" style={{ textTransform: 'capitalize' }}>{a.status}</span>
            </div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '10px 0' }}>
              <span className="chip">{(a.days || []).join(' ')}</span>
              <span className="chip">{a.hours}</span>
              <span className="chip">{a.transport}</span>
              <span className={'chip ' + (a.rightToWork === 'yes' ? 'ok' : 'bad')}>{a.rightToWork === 'yes' ? 'Right to work: yes (verify)' : 'No right to work'}</span>
              <span className={'chip ' + (a.dbs === 'have' ? 'ok' : 'warn')}>{a.dbs === 'have' ? 'Has DBS' : 'Needs DBS'}</span>
            </div>
            {a.experience && <p className="small" style={{ marginBottom: 6 }}><b>Experience:</b> {a.experience}</p>}
            {a.about && <p className="small muted" style={{ fontStyle: 'italic', marginBottom: 10 }}>"{a.about}"</p>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <select value={a.status} onChange={e => setStatus(a, e.target.value)}
                style={{ padding: '7px 10px', borderRadius: 10, border: '1.5px solid var(--line)', background: 'var(--bg)' }}>
                {APP_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              {a.status !== 'hired' && <button className="btn gold small" onClick={() => hire(a)}>Hire</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Payroll drawer: week-by-week breakdown per cleaner ----------
function PayrollDrawer({ id, onClose }) {
  const [d, setD] = useState(null);
  useEffect(() => { api.get('/api/admin/payroll/' + id).then(setD); }, [id]);
  if (!d) return null;
  return (
    <>
      <div className="drawer-back" onClick={() => onClose()} />
      <div className="drawer">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start', marginBottom: 8 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <Avatar src={d.staff.photo} name={d.staff.name} size={46} />
            <div>
              <h2 style={{ fontSize: 20 }}>{d.staff.name}</h2>
              <div className="small muted">{gbp(d.staff.rate)}/hr{d.staff.weekendRate ? ` · ${gbp(d.staff.weekendRate)}/hr weekends` : ''}</div>
            </div>
          </div>
          <button className="btn ghost small" onClick={() => onClose()}>Close</button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 16 }}>
          <span className="chip">{d.hours}h worked</span>
          <span className="chip">Earned {gbp(d.earned)}</span>
          <span className="chip ok">Paid {gbp(d.paid)}</span>
          <span className={'chip ' + (d.due > 0 ? 'warn' : '')}>Due {gbp(d.due)}</span>
        </div>

        {d.weeks.map(w => (
          <div key={w.weekStart} style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <b className="small" style={{ color: 'var(--beige-deep)' }}>Week of {niceDate(w.weekStart)}</b>
              <b>{gbp(w.total)}</b>
            </div>
            <div className="card" style={{ padding: 0 }}>
              <table className="tbl">
                <tbody>
                  {w.entries.map((e, i) => (
                    <tr key={i} style={{ cursor: 'default' }}>
                      <td className="small" style={{ width: 86 }}>{niceDate(e.date)}</td>
                      <td className="small">{e.label}{e.type === 'extra' && <span className="chip warn" style={{ marginLeft: 6 }}>extra time</span>}</td>
                      <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{e.hours}h × {gbp(e.rate)}</td>
                      <td className="small" style={{ textAlign: 'right' }}><b>{gbp(e.amount)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}

        <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Payouts</h3>
        {d.payouts.length === 0 && <p className="muted small">No payouts yet.</p>}
        {d.payouts.map(p => (
          <div key={p.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span className="small">{p.period}</span><b>{gbp(p.amount)}</b>
          </div>
        ))}
      </div>
    </>
  );
}

// ---------- Staff documents (uploaded by the cleaner or the office) ----------
function StaffDocuments({ staffId }) {
  const [docs, setDocs] = useState([]);
  const load = () => api.get(`/api/staff/${staffId}/documents`).then(setDocs);
  useEffect(() => { load(); }, [staffId]);

  const view = async doc => {
    const full = await api.get(`/api/staff/${staffId}/documents/${doc.id}`);
    const win = window.open();
    if (win) win.document.write(`<title>${doc.name}</title><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh">` +
      (full.dataUrl.startsWith('data:application/pdf')
        ? `<embed src="${full.dataUrl}" type="application/pdf" style="width:100vw;height:100vh" />`
        : `<img src="${full.dataUrl}" style="max-width:96vw;max-height:96vh" />`) + '</body>');
  };

  return (
    <>
      <h3 style={{ fontSize: 15, margin: '10px 0 6px' }}>Documents on file</h3>
      <p className="small muted" style={{ marginBottom: 8 }}>DBS certificates, passport, insurance and training certificates. Kleaners can also upload these from their app.</p>
      {docs.length === 0 && <p className="small muted" style={{ marginBottom: 10 }}>Nothing uploaded yet.</p>}
      {docs.map(doc => (
        <div key={doc.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px' }}>
          <span className="small"><b>{doc.name}</b> · {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}</span>
          <span style={{ display: 'flex', gap: 6 }}>
            <button className="btn ghost small" style={{ padding: '3px 12px' }} onClick={() => view(doc)}>View</button>
            <button className="btn ghost small" style={{ padding: '3px 12px', color: 'var(--bad)' }}
              onClick={() => { if (window.confirm(`Delete ${doc.name}?`)) api.del(`/api/staff/${staffId}/documents/${doc.id}`).then(load); }}>×</button>
          </span>
        </div>
      ))}
      <label className="btn ghost small" style={{ marginBottom: 14, display: 'inline-flex' }}>
        + Upload document
        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files[0];
          if (!f) return;
          const reader = new FileReader();
          reader.onload = () => api.post(`/api/staff/${staffId}/documents`, { name: f.name, dataUrl: reader.result }).then(setDocs).catch(err => alert(err.message));
          reader.readAsDataURL(f);
          e.target.value = '';
        }} />
      </label>
    </>
  );
}


// ---------- Activity: who actioned what ----------
function Activity() {
  const [rows, setRows] = useState(null);
  useEffect(() => { api.get('/api/admin/activity').then(setRows); }, []);
  if (!rows) return <p className="muted">Loading…</p>;
  return (
    <>
      <h1>Activity</h1>
      <p className="muted" style={{ marginBottom: 16 }}>A running trail of who actioned what, taken from who was signed in at the time.</p>
      <div className="demo-banner" style={{ marginBottom: 16 }}>
        <b>Demo tools</b>
        <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
          <button className="btn ghost small"
            onClick={() => { if (window.confirm('Reset all demo data back to the starting point? Team logins are kept.')) api.post('/api/admin/reset-demo').then(() => window.location.reload()); }}>
            Reset demo data
          </button>
          <button className="btn ghost small" style={{ color: 'var(--bad)', borderColor: 'var(--bad)' }}
            onClick={async () => {
              const ok = window.prompt('This clears every demo client, booking and Kleaner so you can start trading for real. Your logins and price list are kept.\n\nType START FRESH to confirm:');
              if (ok !== 'START FRESH') return;
              try { await api.post('/api/admin/start-fresh', { confirm: 'START FRESH' }); window.location.reload(); }
              catch (e) { window.alert(e.message); }
            }}>
            Clear everything and go live
          </button>
        </div>
        <p className="small muted" style={{ marginTop: 8, marginBottom: 0 }}>
          Use "Clear everything" once, on the day you start trading for real. It empties the demo people and jobs, ready for your own.
        </p>
      </div>
      {rows.length === 0 && <p className="muted">Nothing recorded yet.</p>}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>When</th><th>Who</th><th>Did what</th></tr></thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id} style={{ cursor: 'default' }}>
                <td className="small muted" style={{ whiteSpace: 'nowrap' }}>{new Date(r.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                <td><b>{r.userName}</b></td>
                <td>{r.action}{r.detail ? <span className="muted"> · {r.detail}</span> : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ---------- Team logins (admin only) ----------
const ROLE_NOTE = {
  admin: 'Everything, including team logins',
  office: 'Everything except team logins',
  kleaner: 'Their own jobs and rota only, never prices'
};

function Logins() {
  const [rows, setRows] = useState(null);
  const [staff, setStaff] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'office', staffId: '' });
  const [error, setError] = useState('');
  const load = () => api.get('/api/admin/users').then(setRows);
  useEffect(() => { load(); api.get('/api/admin/staff').then(r => setStaff(r.staff)); }, []);
  if (!rows) return <p className="muted">Loading…</p>;

  const create = async () => {
    setError('');
    try {
      await api.post('/api/admin/users', form);
      setForm({ name: '', email: '', password: '', role: 'office', staffId: '' });
      setAdding(false);
      load();
    } catch (e) { setError(e.message); }
  };

  const resetPassword = async u => {
    const pw = window.prompt(`New password for ${u.name}:`);
    if (!pw) return;
    await api.patch('/api/admin/users/' + u.id, { password: pw });
    window.alert(`Password updated. Give ${u.name.split(' ')[0]} the new password.`);
  };

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Team logins</h1>
        <button className="btn gold small" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add login'}</button>
      </div>
      <p className="muted" style={{ margin: '6px 0 14px' }}>Every team member gets their own login, so the activity trail shows who did what.</p>
      <NewPasswords />

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 14px' }}>
            <div className="field"><label>Name</label><input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label>Email (their username)</label><input type="email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} /></div>
            <div className="field"><label>Password</label><input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} placeholder="They can change it later" /></div>
            <div className="field"><label>Access level</label>
              <select value={form.role} onChange={e => setForm({ ...form, role: e.target.value })}>
                <option value="office">Office</option>
                <option value="admin">Admin</option>
                <option value="kleaner">Kleaner</option>
              </select>
            </div>
          </div>
          {form.role === 'kleaner' && (
            <div className="field"><label>Link to Kleaner record</label>
              <select value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}>
                <option value="">Choose…</option>
                {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          )}
          <p className="small muted" style={{ marginBottom: 10 }}>{ROLE_NOTE[form.role]}</p>
          {error && <p className="small" style={{ color: 'var(--bad)', marginBottom: 10 }}>{error}</p>}
          <button className="btn" onClick={create}>Create login</button>
        </div>
      )}

      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="tbl">
          <thead><tr><th>Name</th><th>Email</th><th>Access</th><th>Sees</th><th /></tr></thead>
          <tbody>
            {rows.map(u => (
              <tr key={u.id} style={{ cursor: 'default' }}>
                <td><b>{u.name}</b></td>
                <td className="small muted">{u.email}</td>
                <td><span className="chip" style={{ textTransform: 'capitalize' }}>{u.role}</span></td>
                <td className="small muted">{ROLE_NOTE[u.role]}</td>
                <td style={{ textAlign: 'right' }}>
                  <button className="btn ghost small" onClick={() => resetPassword(u)}>Reset password</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}


// ---------- Guesty: Airbnb changeovers pulled from their property manager ----------
function Guesty({ user, openBooking }) {
  const [status, setStatus] = useState(null);
  const [rows, setRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const load = () => Promise.all([
    api.get('/api/admin/guesty/status'),
    api.get('/api/admin/bookings')
  ]).then(([s, b]) => {
    setStatus(s);
    setRows(b.filter(x => x.source === 'guesty' && x.status !== 'cancelled')
      .sort((p, q) => (p.date + p.start).localeCompare(q.date + q.start)));
  });
  useEffect(() => { load(); }, []);
  if (!status) return <p className="muted">Loading…</p>;

  const run = async (path, label) => {
    setBusy(true); setMsg('');
    try {
      const r = await api.post(path);
      setMsg(`${label}: ${r.created} changeover${r.created === 1 ? '' : 's'} imported, ${r.skipped} already up to date${r.cancelled ? `, ${r.cancelled} cancelled` : ''}.`);
      await load();
    } catch (e) { setMsg(e.message); }
    setBusy(false);
  };

  const approve = async b => {
    await api.patch('/api/admin/bookings/' + b.id, { status: 'booked' });
    load();
  };

  const pending = rows.filter(r => r.status === 'requested');

  return (
    <>
      <h1>Guesty</h1>
      <p className="muted">Every checkout becomes a changeover clean, ready for you to approve.</p>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="stat">
          <div className="big" style={{ color: status.connected ? 'var(--good)' : 'var(--muted)' }}>{status.connected ? 'Connected' : 'Not yet'}</div>
          <div className="lbl">Guesty account</div>
        </div>
        <div className="stat"><div className="big">{status.properties}</div><div className="lbl">Properties</div></div>
        <div className="stat"><div className="big" style={pending.length ? { color: 'var(--warn)' } : {}}>{status.awaitingApproval}</div><div className="lbl">Awaiting approval</div></div>
        <div className="stat"><div className="big" style={status.sameDay ? { color: 'var(--bad)' } : {}}>{status.sameDay}</div><div className="lbl">Same-day turnarounds</div></div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <b>How it works</b>
        <p className="small muted" style={{ margin: '6px 0 10px' }}>
          Every listing is included. Each changeover is booked for {status.changeover.start}, when the guest leaves, and must be finished by {status.changeover.end}, when the next guest arrives.
          Nothing goes on the rota by itself: every changeover lands as a request for you to approve, exactly like a website booking.
          Where a guest checks out and another checks in the same day, it is flagged as a same-day turnaround so you can see the tight ones at a glance.
          If a guest cancels in Guesty, the clean cancels here too.
        </p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <button className="btn gold small" disabled={busy || !status.connected} onClick={() => run('/api/admin/guesty/sync', 'Synced')}>
            {busy ? 'Working…' : 'Sync from Guesty now'}
          </button>
          {!status.connected && user.role === 'admin' && (
            <button className="btn ghost small" disabled={busy} onClick={() => run('/api/admin/guesty/sample', 'Sample loaded')}>
              Load sample changeovers
            </button>
          )}
          {status.lastSync && <span className="small muted">Last sync {new Date(status.lastSync).toLocaleString('en-GB')}</span>}
        </div>
        {!status.connected && (
          <p className="small" style={{ color: 'var(--warn)', marginTop: 10 }}>
            Guesty API credentials are not installed yet, so live sync is switched off. Everything else here is working, and you can load sample changeovers to see exactly how it behaves.
          </p>
        )}
        {msg && <p className="small" style={{ marginTop: 10, color: 'var(--ink)' }}>{msg}</p>}
      </div>

      <h2 style={{ fontSize: 16, marginBottom: 10 }}>Changeovers</h2>
      {rows.length === 0 && <p className="muted">Nothing imported yet.</p>}
      {rows.length > 0 && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="tbl">
            <thead><tr><th>Checkout</th><th>Property</th><th>Kleaner</th><th>Status</th><th /></tr></thead>
            <tbody>
              {rows.map(b => (
                <tr key={b.id} onClick={() => openBooking(b.id)}>
                  <td>
                    <b>{niceDate(b.date)}</b> <span className="muted">{b.start}</span>
                    {b.sameDayTurnaround && <div><span className="chip bad">Same-day, finish by 15:00</span></div>}
                  </td>
                  <td><b>{b.clientName}</b><div className="small muted">{b.sizeLabel} · {b.clientPostcode}</div></td>
                  <td>
                    {b.staffName
                      ? <span><span className="dot" style={{ background: b.staffColour, display: 'inline-block', marginRight: 6 }} />{b.staffName}</span>
                      : <span className="chip bad">Nobody free, assign manually</span>}
                  </td>
                  <td><span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span></td>
                  <td style={{ textAlign: 'right' }}>
                    {b.status === 'requested' && (
                      <button className="btn gold small" onClick={e => { e.stopPropagation(); approve(b); }}>Approve</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}


// ---------- Time off: holidays and blocked-out days ----------
const ABSENCE_LABEL = { holiday: '🌴 Holiday', sick: '🤒 Off sick', training: '📘 Training', unavailable: '⛔ Unavailable' };

function TimeOff({ staff, absences, onChanged }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ staffId: '', from: today, to: today, type: 'holiday', note: '' });
  const [error, setError] = useState('');
  const [warn, setWarn] = useState(null);

  const add = async () => {
    setError(''); setWarn(null);
    try {
      const res = await api.post('/api/admin/absences', form);
      if (res.clashes?.length) setWarn(res.clashes);
      setForm({ ...form, note: '' });
      onChanged();
    } catch (e) { setError(e.message); }
  };

  const remove = async a => {
    if (!window.confirm(`Remove this time off for ${a.staffName || 'them'}?`)) return;
    await api.del('/api/admin/absences/' + a.id);
    onChanged();
  };

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <b>Book time off</b>
      <p className="small muted" style={{ margin: '4px 0 12px' }}>
        Holidays, sickness or any day someone should not be given work. Blocked days are greyed out on the rota and nobody on leave is offered new jobs.
      </p>
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr auto', gap: 12, alignItems: 'end' }}>
        <div className="field" style={{ margin: 0 }}><label>Who</label>
          <select value={form.staffId} onChange={e => setForm({ ...form, staffId: e.target.value })}>
            <option value="">Choose…</option>
            {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </div>
        <div className="field" style={{ margin: 0 }}><label>From</label>
          <input type="date" value={form.from} onChange={e => setForm({ ...form, from: e.target.value, to: e.target.value > form.to ? e.target.value : form.to })} />
        </div>
        <div className="field" style={{ margin: 0 }}><label>To</label>
          <input type="date" value={form.to} min={form.from} onChange={e => setForm({ ...form, to: e.target.value })} />
        </div>
        <div className="field" style={{ margin: 0 }}><label>Reason</label>
          <select value={form.type} onChange={e => setForm({ ...form, type: e.target.value })}>
            <option value="holiday">Holiday</option>
            <option value="sick">Off sick</option>
            <option value="training">Training</option>
            <option value="unavailable">Unavailable</option>
          </select>
        </div>
        <button className="btn gold" onClick={add} disabled={!form.staffId}>Block it out</button>
      </div>
      <div className="field" style={{ marginTop: 12, marginBottom: 0 }}>
        <input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="Note (optional), e.g. two weeks in Spain" />
      </div>
      {error && <p className="small" style={{ color: 'var(--bad)', marginTop: 10 }}>{error}</p>}
      {warn && (
        <div className="demo-banner" style={{ borderColor: 'var(--bad)', marginTop: 12 }}>
          ⚠ <b>They already have {warn.length} job{warn.length > 1 ? 's' : ''} booked in that period.</b> The time off is saved, but these still need reassigning:
          <ul className="tight" style={{ margin: '6px 0 0' }}>
            {warn.map(c => <li key={c.id} className="small">{niceDate(c.date)} {c.start} · {c.clientName}</li>)}
          </ul>
        </div>
      )}

      {absences.length > 0 && (
        <>
          <div className="small" style={{ fontWeight: 700, margin: '16px 0 6px' }}>Booked this week</div>
          {absences.map(a => (
            <div key={a.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
              <span className="small">
                <b>{staff.find(s => s.id === a.staffId)?.name || 'Someone'}</b> · {ABSENCE_LABEL[a.type] || a.type} · {niceDate(a.from)} to {niceDate(a.to)}
                {a.note && <span className="muted"> · {a.note}</span>}
              </span>
              <button className="btn ghost small" style={{ padding: '2px 12px', color: 'var(--bad)' }}
                onClick={() => remove({ ...a, staffName: staff.find(s => s.id === a.staffId)?.name })}>×</button>
            </div>
          ))}
        </>
      )}
    </div>
  );
}


// Generate strong passwords for everyone, shown once for copying
function NewPasswords() {
  const [issued, setIssued] = useState(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    const ok = window.prompt('This replaces the password for EVERY login with a strong random one and signs everyone out.\n\nYou will see the new passwords once, so have somewhere ready to save them.\n\nType NEW PASSWORDS to confirm:');
    if (ok !== 'NEW PASSWORDS') return;
    setBusy(true);
    try { const r = await api.post('/api/admin/users/regenerate-passwords', { confirm: 'NEW PASSWORDS' }); setIssued(r.issued); }
    catch (e) { window.alert(e.message); }
    setBusy(false);
  };

  if (issued) {
    const text = issued.map(i => `${i.role.toUpperCase()}  ${i.name}  ${i.email}  ${i.password}`).join('\n');
    return (
      <div className="demo-banner" style={{ borderColor: 'var(--good)', marginBottom: 16 }}>
        <b>✓ New passwords set. This is the only time they are shown.</b>
        <p className="small" style={{ margin: '6px 0' }}>Copy them into a password manager now, then give each person theirs. Everyone has been signed out.</p>
        <pre style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 10, padding: 12, fontSize: 12.5, overflowX: 'auto', margin: '8px 0' }}>{text}</pre>
        <button className="btn ghost small" onClick={() => { navigator.clipboard?.writeText(text); }}>Copy all</button>
        <button className="btn ghost small" style={{ marginLeft: 8 }} onClick={() => setIssued(null)}>Hide</button>
      </div>
    );
  }

  return (
    <div className="demo-banner" style={{ marginBottom: 16 }}>
      <b>Before you go live</b>
      <p className="small" style={{ margin: '6px 0' }}>
        The starting passwords are simple and have been shared in documents. Replace them all with strong ones before any real staff or client data goes in.
      </p>
      <button className="btn gold small" disabled={busy} onClick={run}>{busy ? 'Working…' : 'Generate strong passwords for everyone'}</button>
    </div>
  );
}


// ---------- Invoices ----------
const readFileAsDataUrl = file => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve({ name: file.name, dataUrl: r.result });
  r.onerror = reject;
  r.readAsDataURL(file);
});

function viewInvoiceFile(id, name) {
  api.get(`/api/admin/invoices/${id}/file`).then(f => {
    const w = window.open();
    if (!w) return;
    w.document.write(`<title>${name}</title><body style="margin:0;background:#222;display:flex;align-items:center;justify-content:center;min-height:100vh">` +
      (f.dataUrl.startsWith('data:application/pdf')
        ? `<embed src="${f.dataUrl}" type="application/pdf" style="width:100vw;height:100vh" />`
        : `<img src="${f.dataUrl}" style="max-width:96vw;max-height:96vh" />`) + '</body>');
  }).catch(e => window.alert(e.message));
}

function InvoiceRow({ inv, onChanged, showClient }) {
  const togglePaid = () =>
    api.patch('/api/admin/invoices/' + inv.id, { status: inv.status === 'paid' ? 'unpaid' : 'paid' }).then(onChanged);
  const remove = () => {
    if (!window.confirm(`Delete invoice ${inv.number} for ${gbp(inv.amount)}?`)) return;
    api.del('/api/admin/invoices/' + inv.id).then(onChanged);
  };
  return (
    <div className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
      <div style={{ minWidth: 0 }}>
        <b>{inv.number}</b> <span className="muted small">{gbp(inv.amount)}</span>
        {showClient && <div className="small muted">{inv.clientName}</div>}
        <div className="small muted">
          Issued {niceDate(inv.issuedDate)} · due {niceDate(inv.dueDate)}
          {inv.jobLabel && <span> · job {inv.jobLabel}</span>}
          {inv.status === 'paid' && inv.paidDate && <span> · paid {niceDate(inv.paidDate)}</span>}
        </div>
        {inv.notes && <div className="small muted">{inv.notes}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {inv.needsChasing && <span className="chip bad">{inv.overdueDays} day{inv.overdueDays === 1 ? '' : 's'} overdue</span>}
        {inv.status === 'paid'
          ? <span className="chip ok">Paid</span>
          : !inv.needsChasing && <span className="chip warn">Unpaid</span>}
        {inv.fileName && <button className="btn ghost small" style={{ padding: '3px 12px' }} onClick={() => viewInvoiceFile(inv.id, inv.fileName)}>View</button>}
        <button className={'btn small ' + (inv.status === 'paid' ? 'ghost' : 'gold')} style={{ padding: '3px 12px' }} onClick={togglePaid}>
          {inv.status === 'paid' ? 'Mark unpaid' : 'Mark paid'}
        </button>
        <button className="btn ghost small" style={{ padding: '3px 10px', color: 'var(--bad)' }} onClick={remove}>×</button>
      </div>
    </div>
  );
}

function InvoiceForm({ clientId, bookingId, onDone }) {
  const today = new Date().toISOString().slice(0, 10);
  const [form, setForm] = useState({ number: '', amount: '', issuedDate: today, dueDate: '', notes: '' });
  const [file, setFile] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setError(''); setBusy(true);
    try {
      await api.post('/api/admin/invoices', { ...form, clientId, bookingId, file });
      setForm({ number: '', amount: '', issuedDate: today, dueDate: '', notes: '' });
      setFile(null);
      onDone();
    } catch (e) { setError(e.message); }
    setBusy(false);
  };

  return (
    <div className="card" style={{ marginBottom: 12, background: 'var(--surface2)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 12px' }}>
        <div className="field" style={{ marginBottom: 10 }}><label>Invoice number (optional)</label>
          <input value={form.number} onChange={e => setForm({ ...form, number: e.target.value })} placeholder="Left blank, we number it" />
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label>Amount £</label>
          <input value={form.amount} onChange={e => setForm({ ...form, amount: e.target.value })} placeholder="120" />
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label>Issued</label>
          <input type="date" value={form.issuedDate} onChange={e => setForm({ ...form, issuedDate: e.target.value })} />
        </div>
        <div className="field" style={{ marginBottom: 10 }}><label>Due (blank = 14 days)</label>
          <input type="date" value={form.dueDate} onChange={e => setForm({ ...form, dueDate: e.target.value })} />
        </div>
      </div>
      <div className="field" style={{ marginBottom: 10 }}>
        <input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Note (optional), e.g. deep clean quoted by phone" />
      </div>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <label className="btn ghost small">
          {file ? `✓ ${file.name}` : '📎 Attach invoice (PDF or photo)'}
          <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }}
            onChange={async e => { const f = e.target.files[0]; if (f) setFile(await readFileAsDataUrl(f)); e.target.value = ''; }} />
        </label>
        <button className="btn gold small" onClick={submit} disabled={busy || !form.amount}>{busy ? 'Saving…' : 'Save invoice'}</button>
      </div>
      {error && <p className="small" style={{ color: 'var(--bad)', marginTop: 8 }}>{error}</p>}
    </div>
  );
}

function ClientInvoices({ clientId, invoices, onChanged }) {
  const [adding, setAdding] = useState(false);
  const outstanding = invoices.filter(i => i.status === 'unpaid').reduce((t, i) => t + i.amount, 0);
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '16px 0 8px' }}>
        <h3 style={{ fontSize: 15 }}>Invoices{outstanding > 0 && <span className="chip warn" style={{ marginLeft: 8 }}>{gbp(outstanding)} outstanding</span>}</h3>
        <button className="btn ghost small" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add invoice'}</button>
      </div>
      {adding && <InvoiceForm clientId={clientId} bookingId={null} onDone={() => { setAdding(false); onChanged(); }} />}
      {invoices.length === 0 && !adding && <p className="muted small">No invoices yet. Use this for clients who came direct rather than booking online.</p>}
      {invoices.map(inv => <InvoiceRow key={inv.id} inv={inv} onChanged={onChanged} />)}
    </>
  );
}

function JobInvoice({ booking }) {
  const [rows, setRows] = useState(null);
  const [adding, setAdding] = useState(false);
  const load = () => api.get('/api/admin/invoices').then(r => setRows(r.invoices.filter(i => i.bookingId === booking.id)));
  useEffect(() => { load(); }, [booking.id]);
  if (!rows) return null;
  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 6px' }}>
        <h3 style={{ fontSize: 15 }}>Invoice for this job</h3>
        <button className="btn ghost small" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add'}</button>
      </div>
      {adding && <InvoiceForm clientId={booking.clientId} bookingId={booking.id} onDone={() => { setAdding(false); load(); }} />}
      {rows.length === 0 && !adding && <p className="small muted" style={{ marginBottom: 12 }}>None attached.</p>}
      {rows.map(inv => <InvoiceRow key={inv.id} inv={inv} onChanged={load} />)}
    </>
  );
}

function Invoices({ openClient }) {
  const [data, setData] = useState(null);
  const [filter, setFilter] = useState('chasing');
  const [adding, setAdding] = useState(false);
  const [clients, setClients] = useState([]);
  const [pickClient, setPickClient] = useState('');
  const load = () => api.get('/api/admin/invoices').then(setData);
  useEffect(() => { load(); api.get('/api/admin/clients').then(setClients); }, []);
  if (!data) return <p className="muted">Loading…</p>;

  const shown = data.invoices.filter(i =>
    filter === 'chasing' ? i.needsChasing
      : filter === 'unpaid' ? i.status === 'unpaid'
        : filter === 'paid' ? i.status === 'paid'
          : true);

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>Invoices</h1>
        <button className="btn gold small" onClick={() => setAdding(a => !a)}>{adding ? 'Cancel' : '+ Add invoice'}</button>
      </div>
      <p className="muted">For clients who came direct. Upload the invoice, mark it paid when the money lands, and anything overdue flags itself.</p>

      <div className="stat-row" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
        <div className="stat"><div className="big">{gbp(data.outstanding)}</div><div className="lbl">Outstanding</div></div>
        <div className="stat"><div className="big" style={data.chasing ? { color: 'var(--bad)' } : {}}>{gbp(data.overdue)}</div><div className="lbl">Overdue</div></div>
        <div className="stat"><div className="big" style={data.chasing ? { color: 'var(--bad)' } : {}}>{data.chasing}</div><div className="lbl">Need chasing</div></div>
      </div>

      {adding && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="field"><label>Client</label>
            <select value={pickClient} onChange={e => setPickClient(e.target.value)}>
              <option value="">Choose a client…</option>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          {pickClient && <InvoiceForm clientId={pickClient} bookingId={null} onDone={() => { setAdding(false); setPickClient(''); load(); }} />}
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, margin: '10px 0 14px', flexWrap: 'wrap' }}>
        {[['chasing', 'Needs chasing'], ['unpaid', 'Unpaid'], ['paid', 'Paid'], ['all', 'All']].map(([k, label]) => (
          <button key={k} className={'btn small ' + (filter === k ? 'gold' : 'ghost')} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {shown.length === 0 && (
        <p className="muted">{filter === 'chasing' ? 'Nothing overdue. All invoices are within their terms.' : 'Nothing here.'}</p>
      )}
      {shown.map(inv => <InvoiceRow key={inv.id} inv={inv} onChanged={load} showClient />)}
    </>
  );
}
