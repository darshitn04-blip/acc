import React, { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MapContainer, Marker, TileLayer, useMapEvents, Popup } from 'react-leaflet';
import L from 'leaflet';
import { Activity, ArrowDownRight, ArrowUpRight, Check, ChevronDown, CircleDot, Clock3, Crosshair, Filter, LocateFixed, MapPin, Menu, Plus, Send, ShieldCheck, Sparkles, X } from 'lucide-react';
import 'leaflet/dist/leaflet.css';
import './styles.css';

const API = '/api';
const CATEGORIES = ['Pothole', 'Waste & sanitation', 'Streetlight', 'Water leak', 'Drainage & flooding', 'Sidewalk & accessibility', 'Other'];
const STATUSES = ['Reported', 'Acknowledged', 'In progress', 'Resolved'];
const pin = L.divIcon({ className: 'map-pin-wrap', html: '<span class="map-pin"></span>', iconSize: [22, 22], iconAnchor: [11, 11] });
const center = [12.9716, 77.5946];
const fmt = (value) => new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(value));

function LocationPicker({ position, setPosition }) {
  useMapEvents({ click(e) { setPosition([e.latlng.lat, e.latlng.lng]); } });
  return position ? <Marker position={position} icon={pin}><Popup>Selected report location</Popup></Marker> : null;
}

function App() {
  const [reports, setReports] = useState([]);
  const [stats, setStats] = useState({ total: 0, resolved: 0, in_progress: 0, open: 0 });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('All issues');
  const [modal, setModal] = useState(false);
  const [staffMode, setStaffMode] = useState(false);
  const [notice, setNotice] = useState('');
  const [position, setPosition] = useState(center);
  const [form, setForm] = useState({ title: '', description: '', address: '', photo: null });
  const [busy, setBusy] = useState(false);
  const [adminKey, setAdminKey] = useState('');
  const [statusDraft, setStatusDraft] = useState({});

  async function refresh() {
    try {
      const [issues, summary] = await Promise.all([fetch(`${API}/complaints`), fetch(`${API}/stats`)]);
      if (!issues.ok || !summary.ok) throw new Error();
      setReports(await issues.json()); setStats(await summary.json());
    } catch { setNotice('Could not reach CivicFix. Check that the server is running.'); }
    finally { setLoading(false); }
  }
  useEffect(() => { refresh(); }, []);
  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(''), 4500); return () => clearTimeout(t); }, [notice]);

  const filtered = useMemo(() => reports.filter(r => filter === 'All issues' || r.category === filter), [reports, filter]);
  const latest = reports[0];
  function locateMe() {
    if (!navigator.geolocation) return setNotice('Location is not available in this browser.');
    navigator.geolocation.getCurrentPosition(({ coords }) => setPosition([coords.latitude, coords.longitude]), () => setNotice('Location permission was not granted.'));
  }
  async function submit(e) {
    e.preventDefault(); setBusy(true);
    const body = new FormData(); body.append('title', form.title); body.append('description', form.description);
    body.append('latitude', String(position[0])); body.append('longitude', String(position[1])); body.append('address', form.address);
    if (form.photo) body.append('photo', form.photo);
    try {
      const res = await fetch(`${API}/complaints`, { method: 'POST', body });
      const data = await res.json(); if (!res.ok) throw new Error(data.detail || 'Could not submit your report.');
      setModal(false); setForm({ title: '', description: '', address: '', photo: null }); await refresh();
      setNotice(data.possible_duplicate ? `${data.reference} submitted. There may already be a report nearby.` : `${data.reference} submitted. Thanks for looking out for your neighborhood.`);
    } catch (err) { setNotice(err.message); } finally { setBusy(false); }
  }
  async function updateStatus(id) {
    try {
      const res = await fetch(`${API}/complaints/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-Admin-Key': adminKey }, body: JSON.stringify({ status: statusDraft[id] || 'Acknowledged' }) });
      const data = await res.json(); if (!res.ok) throw new Error(data.detail || 'Update failed.');
      await refresh(); setNotice(`${data.reference} updated to ${data.status.toLowerCase()}.`);
    } catch (err) { setNotice(err.message); }
  }

  return <div className="app-shell">
    <header className="topbar"><a className="brand" href="#top"><span className="brand-mark"><MapPin size={20} strokeWidth={2.6}/></span><span>Civic<span className="brand-light">Fix</span></span></a><nav><a href="#issues">Explore reports</a><a href="#how">How it works</a></nav><div className="top-actions"><button className="staff-link" onClick={() => setStaffMode(!staffMode)}><ShieldCheck size={16}/>{staffMode ? 'Community view' : 'Staff access'}</button><button className="button button-primary button-small" onClick={() => setModal(true)}><Plus size={16}/> Report an issue</button></div></header>
    <main id="top">
      <section className="hero"><div className="hero-copy"><div className="eyebrow"><span className="live-dot"/> YOUR NEIGHBORHOOD, IMPROVING TOGETHER</div><h1>See something?<br/><span>Let’s fix it.</span></h1><p>Report the little things that make a big difference. Follow local issues from the first report to the fix.</p><div className="hero-actions"><button className="button button-primary" onClick={() => setModal(true)}><Plus size={17}/> Report an issue</button><a className="button button-quiet" href="#issues">Explore the map <ArrowDownRight size={17}/></a></div><div className="social-proof"><div className="avatar-stack"><i>R</i><i>A</i><i>M</i><i>+</i></div><span><b>{stats.total} reports</b> from people nearby</span></div></div>
        <div className="hero-map"><div className="map-frame"><MapContainer center={center} zoom={13} scrollWheelZoom={false} zoomControl={false}><TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{reports.map(r => <Marker key={r.id} position={[r.latitude, r.longitude]} icon={pin}><Popup><b>{r.title}</b><br/>{r.category} · {r.status}</Popup></Marker>)}</MapContainer><div className="map-caption"><span className="map-caption-icon"><MapPin size={17}/></span><span><b>Small fixes. Better streets.</b><small>Every report helps build momentum.</small></span><span className="caption-arrow"><ArrowUpRight size={17}/></span></div></div><div className="map-floating"><span className="floating-icon"><Check size={15}/></span><span><b>{stats.resolved} issues resolved</b><small>and counting</small></span></div><span className="decor decor-one"/><span className="decor decor-two"/></div></section>
      <section className="stats-row"><Stat icon={<CircleDot size={18}/>} label="Total reports" value={stats.total} note="from your community" tone="green"/><Stat icon={<Clock3 size={18}/>} label="Needs attention" value={stats.open + stats.in_progress} note="being worked on" tone="amber"/><Stat icon={<Check size={18}/>} label="Resolved" value={stats.resolved} note="good work, everyone" tone="blue"/><div className="stat-note"><Sparkles size={18}/><span><b>Every voice counts.</b><br/>One good report can move things forward.</span></div></section>
      {staffMode && <section className="staff-panel"><div><span className="eyebrow">STAFF WORKSPACE</span><h2>Update a report</h2><p>Status changes require your staff key.</p></div><input type="password" placeholder="Staff key" value={adminKey} onChange={e => setAdminKey(e.target.value)}/></section>}
      <section className="issues-section" id="issues"><div className="section-heading"><div><div className="eyebrow">THE COMMUNITY PULSE</div><h2>What’s happening nearby</h2><p>Real reports from people who care about this place.</p></div><a className="text-link" href="#issues">View all reports <ArrowUpRight size={16}/></a></div><div className="content-grid"><div className="issue-list"><div className="list-toolbar"><div className="filter-label"><Filter size={15}/> Filter by</div><div className="filter-pills"><button className={filter === 'All issues' ? 'active' : ''} onClick={() => setFilter('All issues')}>All issues</button>{CATEGORIES.slice(0, 4).map(c => <button key={c} className={filter === c ? 'active' : ''} onClick={() => setFilter(c)}>{c}</button>)}</div></div>{loading ? <div className="empty-state">Loading community reports…</div> : filtered.length ? filtered.slice(0, 8).map(r => <article className="issue-card" key={r.id}><div className={`issue-symbol ${r.category === 'Pothole' ? 'symbol-orange' : r.category === 'Waste & sanitation' ? 'symbol-green' : r.category === 'Streetlight' ? 'symbol-purple' : 'symbol-blue'}`}><IssueIcon category={r.category}/></div><div className="issue-main"><div className="issue-meta"><span>{r.category}</span><i>·</i><span>{fmt(r.created_at)}</span></div><h3>{r.title}</h3><p>{r.address || `${r.latitude.toFixed(4)}, ${r.longitude.toFixed(4)}`}</p><div className="issue-dept">Routed to <b>{r.department}</b></div></div><div className="issue-end"><span className={`status status-${r.status.toLowerCase().replaceAll(' ', '-')}`}><i/>{r.status}</span><span className="reference">{r.reference}</span>{staffMode && <div className="staff-controls"><select value={statusDraft[r.id] || r.status} onChange={e => setStatusDraft({ ...statusDraft, [r.id]: e.target.value })}>{STATUSES.map(s => <option key={s}>{s}</option>)}</select><button onClick={() => updateStatus(r.id)}>Save</button></div>}</div></article>) : <div className="empty-state">{filter === 'All issues' ? 'No reports yet. Be the first to look out for your neighborhood.' : `No ${filter.toLowerCase()} reports yet.`}</div>}<button className="load-more" onClick={() => setFilter('All issues')}>Showing {filtered.length} {filtered.length === 1 ? 'report' : 'reports'} <ChevronDown size={15}/></button></div>
        <aside className="side-column"><div className="side-map"><div className="side-map-head"><span><MapPin size={16}/> Report map</span><span className="map-live"><i/> Live</span></div><MapContainer center={center} zoom={12} scrollWheelZoom={false} zoomControl={false} dragging={false}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>{filtered.map(r => <Marker key={r.id} position={[r.latitude, r.longitude]} icon={pin}><Popup><b>{r.title}</b><br/>{r.status}</Popup></Marker>)}</MapContainer><div className="side-map-foot">{filtered.length} reports on the map <span>·</span> OpenStreetMap</div></div><div className="latest-card"><div className="latest-top"><span className="latest-icon"><Activity size={16}/></span><span className="eyebrow">LATEST ACTIVITY</span></div>{latest ? <><h3>{latest.status === 'Resolved' ? 'A neighbor’s report was resolved' : 'A new issue was reported'}</h3><p><b>{latest.title}</b> · {latest.category}. {latest.status === 'Resolved' ? 'Thanks for helping make a difference.' : 'It’s now on the community map.'}</p><span className="latest-time">{fmt(latest.created_at)} <i>·</i> {latest.reference}</span></> : <><h3>Your community story starts here</h3><p>When neighbors report issues, you’ll see the updates here.</p></>}<div className="activity-line"/></div><div className="help-card"><div className="help-icon"><Crosshair size={19}/></div><div><b>Spot a problem?</b><p>It only takes a minute to report it.</p><button onClick={() => setModal(true)}>Make a report <ArrowUpRight size={14}/></button></div></div></aside></div></section>
      <section className="how-section" id="how"><div><span className="eyebrow">A BETTER BLOCK, STEP BY STEP</span><h2>From “someone should”<br/>to <span>“it’s taken care of.”</span></h2></div><div className="steps"><Step number="01" title="Spot it" text="See a pothole, broken light or overflowing bin? Grab a photo."/><Step number="02" title="Report it" text="Pin the location and tell us what’s going on. We’ll route it."/><Step number="03" title="Follow it" text="Keep up with progress as your community gets it fixed."/></div></section>
    </main><footer><a className="brand" href="#top"><span className="brand-mark"><MapPin size={18} strokeWidth={2.6}/></span><span>Civic<span className="brand-light">Fix</span></span></a><span>Built by neighbors, for neighborhoods.</span><span>Community powered <span className="footer-heart">♥</span></span></footer>
    {modal && <div className="modal-backdrop" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget) setModal(false); }}><form className="report-modal" onSubmit={submit}><div className="modal-head"><div><span className="eyebrow">MAKE YOUR VOICE COUNT</span><h2>Report an issue</h2><p>Help your community see what needs fixing.</p></div><button type="button" className="close-button" onClick={() => setModal(false)} aria-label="Close"><X/></button></div><label>What needs attention?<input required minLength="5" maxLength="100" placeholder="e.g. Pothole near the school crossing" value={form.title} onChange={e => setForm({ ...form, title: e.target.value })}/></label><label>Tell us a little more<textarea required minLength="10" maxLength="2000" rows="3" placeholder="What did you notice? Any details that could help…" value={form.description} onChange={e => setForm({ ...form, description: e.target.value })}/></label><div className="location-heading"><label>Where is it?</label><button type="button" onClick={locateMe}><LocateFixed size={15}/> Use my location</button></div><div className="pick-map"><MapContainer center={position} zoom={14} scrollWheelZoom={false} zoomControl={false}><TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/><LocationPicker position={position} setPosition={setPosition}/></MapContainer><span className="pick-map-hint">Tap the map to place a pin</span></div><input className="address-input" placeholder="Nearby street or landmark (optional)" value={form.address} onChange={e => setForm({ ...form, address: e.target.value })}/><label className="upload-label">Photo <span>optional · JPG, PNG or WebP, up to 5 MB</span><input type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setForm({ ...form, photo: e.target.files?.[0] || null })}/></label>{form.photo && <div className="file-name">{form.photo.name}<button type="button" onClick={() => setForm({ ...form, photo: null })}><X size={13}/></button></div>}<div className="privacy-note"><ShieldCheck size={15}/> Your location is shared publicly with this report.</div><button className="button button-primary submit-button" disabled={busy}>{busy ? 'Sending report…' : <>Send report <Send size={16}/></>}</button></form></div>}
    {notice && <div className="toast"><span><Check size={16}/></span>{notice}<button onClick={() => setNotice('')}><X size={15}/></button></div>}
  </div>;
}
function Stat({ icon, label, value, note, tone }) { return <div className="stat"><span className={`stat-icon ${tone}`}>{icon}</span><div><span className="stat-label">{label}</span><div className="stat-value">{value}</div><span className="stat-note-small">{note}</span></div></div>; }
function Step({ number, title, text }) { return <div className="step"><span>{number}</span><div><h3>{title}</h3><p>{text}</p></div></div>; }
function IssueIcon({ category }) { return category === 'Pothole' ? <CircleDot size={19}/> : category === 'Waste & sanitation' ? <Activity size={19}/> : category === 'Streetlight' ? <Sparkles size={19}/> : <MapPin size={19}/>; }

createRoot(document.getElementById('root')).render(<App/>);
