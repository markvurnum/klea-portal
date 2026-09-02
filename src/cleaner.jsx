import React, { useEffect, useState } from 'react';
import { api } from './api.js';
import { Logo, ThemeToggle, Avatar, gbp, niceDate } from './ui.jsx';

// Kleaner app: mobile-first day view for cleaners.
// Demo has no login; the cleaner picks their own profile.
export default function CleanerApp({ user, onSignOut }) {
  const [tab, setTab] = useState('today');
  // Office staff can look at a Kleaner's view; a Kleaner only ever sees themselves
  const staffId = user.staffId;

  if (!staffId) {
    return (
      <div className="cleaner-shell">
        <header className="cleaner-head">
          <a href="#/admin" style={{ textDecoration: 'none' }}><Logo small /></a>
          <ThemeToggle />
        </header>
        <div style={{ padding: 30 }}>
          <p className="muted">This login is not linked to a Kleaner record. Use the <a href="#/admin">office dashboard</a> instead.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="cleaner-shell">
      <header className="cleaner-head">
        <Logo small />
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="btn ghost small" onClick={onSignOut}>Sign out</button>
          <ThemeToggle />
        </div>
      </header>
      <div style={{ display: 'flex', gap: 8, padding: '12px 16px 0' }}>
        <button className={'btn small ' + (tab === 'today' ? 'gold' : 'ghost')} onClick={() => setTab('today')}>My day</button>
        <button className={'btn small ' + (tab === 'rota' ? 'gold' : 'ghost')} onClick={() => setTab('rota')}>My rota</button>
      </div>
      {tab === 'today' ? <Day staffId={staffId} /> : <MyRota staffId={staffId} />}
    </div>
  );
}

// A Kleaner's own week. They never see other Kleaners or the dashboard.
function MyRota({ staffId }) {
  const [start, setStart] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState(null);
  useEffect(() => { api.get(`/api/cleaner/${staffId}/week?start=${start}`).then(setData); }, [staffId, start]);
  if (!data) return <p className="muted" style={{ padding: 30 }}>Loading…</p>;

  const shift = n => {
    const d = new Date(start + 'T12:00:00'); d.setDate(d.getDate() + n * 7);
    setStart(d.toISOString().slice(0, 10));
  };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: '10px 16px 60px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '10px 0 14px' }}>
        <b>Week of {niceDate(data.days[0])}</b>
        <span style={{ display: 'flex', gap: 6 }}>
          <button className="btn ghost small" onClick={() => shift(-1)}>←</button>
          <button className="btn ghost small" onClick={() => shift(1)}>→</button>
        </span>
      </div>
      {data.days.map(d => {
        const jobs = data.jobs.filter(j => j.date === d).sort((a, b) => a.start.localeCompare(b.start));
        const working = data.staff.days.includes(new Date(d + 'T12:00:00').getDay());
        return (
          <div key={d} style={{ marginBottom: 10 }}>
            <div className="small" style={{ fontWeight: 700, color: d === today ? 'var(--beige-deep)' : 'var(--muted)', marginBottom: 4 }}>
              {niceDate(d)}{d === today ? ' · today' : ''}
            </div>
            {jobs.length === 0 && (
              <div className="card" style={{ padding: '10px 14px', color: 'var(--muted)', fontSize: 13 }}>
                {working ? 'Nothing booked' : 'Not working'}
              </div>
            )}
            {jobs.map(j => (
              <div key={j.id} className="card" style={{ padding: '10px 14px', marginBottom: 6 }}>
                <b className="small">{j.start} · {j.clientName}</b>
                <div className="small muted">{j.serviceName} · {j.sizeLabel} · {j.clientPostcode}</div>
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}

function Day({ staffId }) {
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [data, setData] = useState(null);
  const [openJob, setOpenJob] = useState(null);
  const load = () => api.get(`/api/cleaner/${staffId}/day?date=${date}`).then(setData);
  useEffect(() => { setOpenJob(null); load(); }, [staffId, date]);
  if (!data) return <p className="muted" style={{ padding: 30 }}>Loading…</p>;

  const shift = n => {
    const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() + n);
    setDate(d.toISOString().slice(0, 10));
  };
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div style={{ padding: '6px 16px 60px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '12px 0' }}>
        <Avatar src={data.staff.photo} name={data.staff.name} size={38} />
        <div>
          <b>Hi {data.staff.name.split(' ')[0]}</b>
          <div className="small muted">{data.jobs.length} clean{data.jobs.length === 1 ? '' : 's'} · {niceDate(date)}{date === today ? ' (today)' : ''}</div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
        <button className="btn ghost small" onClick={() => shift(-1)}>← Prev day</button>
        <button className="btn ghost small" onClick={() => setDate(today)}>Today</button>
        <button className="btn ghost small" onClick={() => shift(1)}>Next day →</button>
      </div>

      {data.jobs.length === 0 && <div className="card" style={{ textAlign: 'center', padding: 30 }}>Day off. Enjoy it ✦</div>}

      {data.jobs.map(j => (
        <JobCard key={j.id} job={j} open={openJob === j.id} onToggle={() => setOpenJob(openJob === j.id ? null : j.id)} onChanged={load} />
      ))}

      <SelfService staffId={staffId} />
    </div>
  );
}

// My hours, extra time and documents: the cleaner's own self-service tools
const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function SelfService({ staffId }) {
  const [open, setOpen] = useState(null); // 'hours' | 'time' | 'docs'
  return (
    <div style={{ marginTop: 24 }}>
      <h3 style={{ fontSize: 16, marginBottom: 10 }}>My bits</h3>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
        {[['hours', '🕰 My hours'], ['time', '➕ Log extra time'], ['docs', '📄 My documents']].map(([k, label]) => (
          <button key={k} className={'btn small ' + (open === k ? 'gold' : 'ghost')} onClick={() => setOpen(open === k ? null : k)}>{label}</button>
        ))}
      </div>
      {open === 'hours' && <MyHours staffId={staffId} />}
      {open === 'time' && <LogTime staffId={staffId} />}
      {open === 'docs' && <MyDocuments staffId={staffId} />}
    </div>
  );
}

function MyHours({ staffId }) {
  const [me, setMe] = useState(null);
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    api.get(`/api/cleaner/${staffId}/week`).then(r => {
      setMe({ days: r.staff.days, start: r.staff.start, end: r.staff.end });
    });
  }, [staffId]);
  if (!me) return <p className="muted small">Loading…</p>;

  const saveHours = async () => {
    await api.patch(`/api/cleaner/${staffId}/hours`, me);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="card">
      <p className="small muted" style={{ marginBottom: 10 }}>Set the days and times you want to work. New bookings are only offered inside these hours.</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12 }}>
        {[1, 2, 3, 4, 5, 6, 0].map(d => {
          const on = me.days.includes(d);
          return (
            <button key={d} className={'chip' + (on ? ' ok' : '')} style={{ border: 'none', cursor: 'pointer', padding: '7px 13px' }}
              onClick={() => setMe({ ...me, days: on ? me.days.filter(x => x !== d) : [...me.days, d] })}>
              {on ? '✓ ' : ''}{DAY_LABELS[d]}
            </button>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}><label>Start</label><input type="time" step="1800" value={me.start} onChange={e => setMe({ ...me, start: e.target.value })} /></div>
        <div className="field" style={{ margin: 0 }}><label>Finish</label><input type="time" step="1800" value={me.end} onChange={e => setMe({ ...me, end: e.target.value })} /></div>
        <button className="btn gold small" onClick={saveHours}>{saved ? '✓ Saved' : 'Save my hours'}</button>
      </div>
    </div>
  );
}

function LogTime({ staffId }) {
  const [form, setForm] = useState({ date: new Date().toISOString().slice(0, 10), hours: '', note: '' });
  const [msg, setMsg] = useState('');
  const submit = async () => {
    setMsg('');
    try {
      await api.post(`/api/cleaner/${staffId}/timesheet`, form);
      setMsg('✓ Logged. It will show in your pay.');
      setForm({ ...form, hours: '', note: '' });
    } catch (e) { setMsg(e.message); }
  };
  return (
    <div className="card">
      <p className="small muted" style={{ marginBottom: 10 }}>Job hours are tracked automatically. Use this for anything extra, like a supply run or a job that genuinely ran over.</p>
      <div style={{ display: 'flex', gap: 12, alignItems: 'end', flexWrap: 'wrap' }}>
        <div className="field" style={{ margin: 0 }}><label>Date</label><input type="date" value={form.date} onChange={e => setForm({ ...form, date: e.target.value })} /></div>
        <div className="field" style={{ margin: 0, width: 90 }}><label>Hours</label><input type="number" step="0.25" min="0.25" max="12" value={form.hours} onChange={e => setForm({ ...form, hours: e.target.value })} /></div>
        <div className="field" style={{ margin: 0, flex: 1, minWidth: 160 }}><label>What was it?</label><input value={form.note} onChange={e => setForm({ ...form, note: e.target.value })} placeholder="e.g. supply run" /></div>
        <button className="btn gold small" onClick={submit} disabled={!form.hours}>Log it</button>
      </div>
      {msg && <p className="small" style={{ marginTop: 8, color: msg.startsWith('✓') ? 'var(--good)' : 'var(--bad)' }}>{msg}</p>}
    </div>
  );
}

function MyDocuments({ staffId }) {
  const [docs, setDocs] = useState([]);
  const [err, setErr] = useState('');
  const load = () => api.get(`/api/staff/${staffId}/documents`).then(setDocs);
  useEffect(() => { load(); }, [staffId]);
  return (
    <div className="card">
      <p className="small muted" style={{ marginBottom: 10 }}>Upload your DBS certificate, passport, insurance or training certificates. The office sees them on your staff file.</p>
      {docs.map(doc => (
        <div key={doc.id} className="msg" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px' }}>
          <span className="small"><b>{doc.name}</b> · {new Date(doc.uploadedAt).toLocaleDateString('en-GB')}</span>
        </div>
      ))}
      <label className="btn ghost small" style={{ display: 'inline-flex' }}>
        📄 Upload (photo or PDF)
        <input type="file" accept="image/*,application/pdf" style={{ display: 'none' }} onChange={e => {
          const f = e.target.files[0];
          if (!f) return;
          setErr('');
          const reader = new FileReader();
          reader.onload = () => api.post(`/api/staff/${staffId}/documents`, { name: f.name, dataUrl: reader.result }).then(setDocs).catch(x => setErr(x.message));
          reader.readAsDataURL(f);
          e.target.value = '';
        }} />
      </label>
      {err && <p className="small" style={{ color: 'var(--bad)', marginTop: 6 }}>{err}</p>}
    </div>
  );
}

function JobCard({ job, open, onToggle, onChanged }) {
  const [b, setB] = useState(job);
  const [uploading, setUploading] = useState(false);
  useEffect(() => setB(job), [job]);

  const sections = [...new Set(b.checklist.map(i => i.section))];
  const toggleItem = item => api.post(`/api/admin/bookings/${b.id}/checklist/${item.id}`).then(r => { setB(r); });
  const setStatus = status => api.patch('/api/admin/bookings/' + b.id, { status }).then(r => { setB(r); onChanged(); });

  const addPhoto = file => {
    if (!file) return;
    setUploading(true);
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 900 / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      api.post(`/api/admin/bookings/${b.id}/photos`, { dataUrl: canvas.toDataURL('image/jpeg', 0.8), caption: 'Uploaded by cleaner' })
        .then(r => { setB(r); setUploading(false); });
    };
    img.src = URL.createObjectURL(file);
  };

  return (
    <div className="card" style={{ marginBottom: 12, padding: 16 }}>
      <div onClick={onToggle} style={{ cursor: 'pointer' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <b style={{ fontSize: 16 }}>{b.start} · {b.clientName}</b>
          <span className={'status ' + b.status}>{b.status.replace('_', ' ')}</span>
        </div>
        <div className="small muted">{b.serviceName} · {b.sizeLabel}{b.teamClean ? ' · Team ×2' : ''} · approx {Math.round(b.durationMins / 60 * 10) / 10}h</div>
        <div className="small">{b.clientAddress} · {b.clientPostcode}</div>
      </div>

      {open && (
        <div style={{ marginTop: 12, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          {b.clientPhone && <a className="btn ghost small" href={'tel:' + b.clientPhone.replace(/\s/g, '')} style={{ marginBottom: 10 }}>📞 Call {b.clientName.split(' ')[0]}</a>}
          {b.clientNotes && <p className="small" style={{ margin: '8px 0' }}>🔑 {b.clientNotes}</p>}
          {b.notes && <p className="small" style={{ margin: '8px 0' }}>📝 {b.notes}</p>}
          {b.addonNames.length > 0 && (
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', margin: '8px 0' }}>
              {b.addonNames.map(a => <span key={a} className="chip">{a}</span>)}
            </div>
          )}

          <div style={{ display: 'flex', gap: 8, margin: '10px 0' }}>
            {b.status === 'booked' && <button className="btn gold small" onClick={() => setStatus('in_progress')}>Start clean</button>}
            {b.status === 'in_progress' && <button className="btn gold small" onClick={() => setStatus('completed')}>Finish clean</button>}
          </div>

          <h4 className="small" style={{ fontWeight: 700, margin: '10px 0 2px' }}>Checklist · {b.checklistDone}/{b.checklistTotal}</h4>
          {sections.map(sec => (
            <div key={sec}>
              <div className="small" style={{ fontWeight: 700, color: 'var(--beige-deep)', margin: '8px 0 0' }}>{sec}</div>
              {b.checklist.filter(i => i.section === sec).map(i => (
                <div key={i.id} className={'check-item' + (i.done ? ' done' : '')} onClick={() => toggleItem(i)}>
                  <div className="box">{i.done ? '✓' : ''}</div>
                  <span className="txt small">{i.label}</span>
                </div>
              ))}
            </div>
          ))}

          <h4 className="small" style={{ fontWeight: 700, margin: '12px 0 6px' }}>Photos · {b.photoCount}</h4>
          {b.photos?.length > 0 && (
            <div className="photo-grid" style={{ marginBottom: 8 }}>
              {b.photos.map(p => (
                <div key={p.id} className="photo-cell"><img src={p.dataUrl} alt={p.caption || 'Job photo'} /></div>
              ))}
            </div>
          )}
          <label className="btn ghost small">
            {uploading ? 'Uploading…' : '📷 Add photo'}
            <input type="file" accept="image/*" capture="environment" style={{ display: 'none' }} onChange={e => { addPhoto(e.target.files[0]); e.target.value = ''; }} />
          </label>
        </div>
      )}
    </div>
  );
}
