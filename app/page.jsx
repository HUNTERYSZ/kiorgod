'use client';
import { useCallback, useEffect, useState } from 'react';

const INTERVALS = [
  { label: '30s',  value: 30 },
  { label: '1 min', value: 60 },
  { label: '2 min', value: 120 },
  { label: '5 min', value: 300 },
  { label: '10 min', value: 600 },
  { label: '30 min', value: 1800 },
];

function dateText(v) {
  if (!v) return '—';
  const d = new Date(v);
  return isNaN(d) ? '—' : d.toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
}

function relText(v) {
  if (!v) return '—';
  const s = Math.max(0, Math.ceil((new Date(v) - Date.now()) / 1000));
  if (s < 60) return `${s}s`;
  return `${Math.ceil(s / 60)}m`;
}

const EMPTY_FORM = { token: '', label: '', message: '', channelInput: '', channelIds: [], intervalSeconds: 120 };

export default function Home() {
  const [auth, setAuth]       = useState('checking');
  const [password, setPassword] = useState('');
  const [tokens, setTokens]   = useState([]);
  const [form, setForm]       = useState(EMPTY_FORM);
  const [busy, setBusy]       = useState(false);
  const [notice, setNotice]   = useState({ msg: '', type: 'info' });
  const [expandedLogs, setExpandedLogs] = useState({});

  const showNotice = (msg, type = 'info') => setNotice({ msg, type });

  const loadState = useCallback(async (quiet = false) => {
    try {
      const r = await fetch('/api/settings', { cache: 'no-store' });
      if (r.status === 401) {
        setAuth(current => {
          if (current === 'checking') return 'logged-out';
          showNotice('Your session could not be verified. Refresh and sign in again.', 'error');
          return current;
        });
        return false;
      }
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Load failed.');
      setTokens(d.tokens || []);
      setAuth('logged-in');
    } catch (e) {
      // A successful login should still reveal the dashboard if the first
      // state read fails, so the user can see the storage error and retry.
      setAuth(cur => cur === 'checking' ? 'error' : 'logged-in');
      if (!quiet) showNotice(e.message, 'error');
      return false;
    }
    return true;
  }, []);

  useEffect(() => {
    loadState();
    const t = setInterval(() => loadState(true), 8000);
    return () => clearInterval(t);
  }, [loadState]);

  async function login(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Login failed.');
      setPassword('');
      // Switch views immediately after the cookie is set. If Redis is
      // unavailable, the dashboard can show the actionable storage error.
      setAuth('logged-in');
      await loadState();
      showNotice('Welcome to @Kior Selfbot.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function logout() {
    await fetch('/api/logout', { method: 'POST' });
    setAuth('logged-out');
    setTokens([]);
  }

  function addChannelToForm() {
    const id = form.channelInput.trim();
    if (!/^\d{17,20}$/.test(id)) { showNotice('Enter a valid Discord channel ID (17–20 digits).', 'error'); return; }
    if (form.channelIds.includes(id)) { showNotice('Already added.', 'error'); return; }
    setForm(f => ({ ...f, channelIds: [...f.channelIds, id], channelInput: '' }));
  }

  async function addToken() {
    if (!form.token.trim())   { showNotice('Token is required.', 'error'); return; }
    if (!form.message.trim()) { showNotice('Message is required.', 'error'); return; }
    if (!form.channelIds.length) { showNotice('Add at least one channel ID.', 'error'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'add',
          token: form.token,
          label: form.label,
          message: form.message,
          channelIds: form.channelIds,
          intervalSeconds: form.intervalSeconds,
        }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not save.');
      setForm(EMPTY_FORM);
      await loadState();
      showNotice('Token added and saved.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function removeToken(id) {
    if (!confirm('Remove this token entry?')) return;
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'remove', id }),
    });
    await loadState(true);
  }

  async function startToken(id) {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not start.');
      await loadState(true);
      showNotice('Started.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function stopToken(id) {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not stop.');
      await loadState(true);
      showNotice('Stopped.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function startAll() {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not start all.');
      await loadState(true);
      showNotice(`Started ${d.started} token(s).`, 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  async function stopAll() {
    setBusy(true);
    try {
      const r = await fetch('/api/campaign/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Could not stop all.');
      await loadState(true);
      showNotice('All stopped.', 'success');
    } catch (e) {
      showNotice(e.message, 'error');
    } finally { setBusy(false); }
  }

  if (auth === 'checking') {
    return <main className="center-screen"><div className="loader-orbit" /><p>Connecting…</p></main>;
  }

  if (auth !== 'logged-in') {
    return (
      <main className="login-shell">
        <div className="space-glow" />
        <section className="login-card glass-card">
          <div className="logo-frame"><img src="/lion-logo.png" alt="Kior" /></div>
          <div className="eyebrow"><span className="tiny-star">✦</span> PRIVATE CONTROL ROOM</div>
          <h1><span>@</span>Kior</h1>
          <p className="login-copy">Self-account token spammer. Authorized use only.</p>
          {notice.msg && <div className={`notice ${notice.type}`}>{notice.msg}</div>}
          <form onSubmit={login} className="login-form">
            <label htmlFor="pw">Dashboard password</label>
            <input id="pw" type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter password" required />
            <button className="button button-primary button-wide" type="submit" disabled={busy}>
              {busy ? 'Opening…' : 'Enter'} <span>↗</span>
            </button>
          </form>
        </section>
      </main>
    );
  }

  const runningCount = tokens.filter(t => t.status === 'running').length;

  return (
    <main className="app-shell">
      <div className="space-glow glow-one" /><div className="space-glow glow-two" />

      <header className="topbar">
        <div className="brand-lockup">
          <div className="brand-logo"><img src="/lion-logo.png" alt="" /></div>
          <div>
            <div className="brand-name"><span>@</span>Kior</div>
            <div className="brand-subtitle">SELFBOT CONTROL ROOM</div>
          </div>
        </div>
        <div className="topbar-right">
          <div className="connection-pill"><span className="live-dot" /> {runningCount} RUNNING</div>
          <button className="button button-ghost button-small" onClick={logout}>Log out</button>
        </div>
      </header>

      {notice.msg && (
        <div className={`notice page-notice ${notice.type}`}>
          <span>{notice.msg}</span>
          <button onClick={() => setNotice({ msg: '', type: 'info' })} aria-label="Dismiss">×</button>
        </div>
      )}

      {/* GLOBAL CONTROLS */}
      <section className="global-controls glass-card">
        <div className="gc-left">
          <div className="section-kicker">GLOBAL CONTROLS</div>
          <p>{tokens.length} token(s) saved · {runningCount} running</p>
        </div>
        <div className="gc-right">
          <button className="button button-primary" onClick={startAll} disabled={busy}>▶ Start All</button>
          <button className="button button-danger"  onClick={stopAll}  disabled={busy}>■ Stop All</button>
        </div>
      </section>

      {/* ADD TOKEN FORM */}
      <section className="panel glass-card add-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">ADD TOKEN</div>
            <h2>New selfbot entry</h2>
          </div>
          <div className="heading-icon">✧</div>
        </div>

        <div className="add-grid">
          <div className="field-col">
            <label className="field-label" htmlFor="tok-token">User Token</label>
            <input id="tok-token" type="password" className="field-input" value={form.token}
              onChange={e => setForm(f => ({ ...f, token: e.target.value }))}
              placeholder="Your Discord user account token" />
          </div>
          <div className="field-col">
            <label className="field-label" htmlFor="tok-label">Label (optional)</label>
            <input id="tok-label" type="text" className="field-input" value={form.label}
              onChange={e => setForm(f => ({ ...f, label: e.target.value }))}
              placeholder="e.g. Main account" />
          </div>
        </div>

        <label className="field-label" htmlFor="tok-msg">Message</label>
        <textarea id="tok-msg" className="message-box" rows={4} maxLength={2000}
          value={form.message}
          onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
          placeholder="Message to send to every channel…" />
        <div className="field-meta"><span /><span>{form.message.length}/2000</span></div>

        <label className="field-label">Interval</label>
        <div className="interval-pills">
          {INTERVALS.map(opt => (
            <button key={opt.value}
              className={`pill ${form.intervalSeconds === opt.value ? 'pill-active' : ''}`}
              onClick={() => setForm(f => ({ ...f, intervalSeconds: opt.value }))}>
              {opt.label}
            </button>
          ))}
        </div>

        <label className="field-label">Channel IDs</label>
        <div className="channel-add-row">
          <input className="field-input" value={form.channelInput}
            onChange={e => setForm(f => ({ ...f, channelInput: e.target.value }))}
            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChannelToForm(); }}}
            inputMode="numeric" placeholder="123456789012345678" />
          <button className="button button-secondary" onClick={addChannelToForm}>+ Add</button>
        </div>

        {form.channelIds.length > 0 && (
          <div className="channel-tags">
            {form.channelIds.map(id => (
              <span key={id} className="tag">
                #{id}
                <button onClick={() => setForm(f => ({ ...f, channelIds: f.channelIds.filter(c => c !== id) }))}>×</button>
              </span>
            ))}
          </div>
        )}

        <div className="button-row" style={{ marginTop: '1.5rem' }}>
          <button className="button button-primary" onClick={addToken} disabled={busy}>
            <span>＋</span> Add Token
          </button>
        </div>
      </section>

      {/* TOKEN QUEUE */}
      <section className="panel glass-card queue-panel">
        <div className="panel-heading">
          <div>
            <div className="section-kicker">TOKEN QUEUE</div>
            <h2>Active entries</h2>
          </div>
          <div className="count-badge">{tokens.length}</div>
        </div>

        {tokens.length === 0 ? (
          <div className="empty-state">
            <div className="empty-orbit">✧</div>
            <strong>No tokens yet</strong>
            <p>Add a token above to get started.</p>
          </div>
        ) : tokens.map(t => (
          <div key={t.id} className={`token-card ${t.status === 'running' ? 'tc-running' : t.status === 'stopped' ? 'tc-stopped' : ''}`}>
            <div className="tc-header">
              <div className="tc-info">
                <div className="tc-label">{t.label}</div>
                <div className="tc-token-masked">{t._hasToken ? '••••••••••…' : '(no token)'}</div>
              </div>
              <div className="tc-status-badge" data-status={t.status}>{(t.status || 'idle').toUpperCase()}</div>
            </div>

            <div className="tc-body">
              <div className="tc-row">
                <span className="tc-key">Message</span>
                <span className="tc-val tc-msg">{t.message || '—'}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Channels</span>
                <span className="tc-val">{(t.channelIds || []).join(', ') || '—'}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Interval</span>
                <span className="tc-val">{t.intervalSeconds}s</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Sent</span>
                <span className="tc-val">{t.sentCount || 0}</span>
              </div>
              <div className="tc-row">
                <span className="tc-key">Next send</span>
                <span className="tc-val">{t.status === 'running' ? `${relText(t.nextSendAt)} · ${dateText(t.nextSendAt)}` : '—'}</span>
              </div>
            </div>

            <div className="tc-actions">
              {t.status !== 'running'
                ? <button className="button button-primary button-small" onClick={() => startToken(t.id)} disabled={busy}>▶ Start</button>
                : <button className="button button-danger button-small"  onClick={() => stopToken(t.id)}  disabled={busy}>■ Stop</button>
              }
              <button className="button button-ghost button-small"
                onClick={() => setExpandedLogs(x => ({ ...x, [t.id]: !x[t.id] }))}>
                {expandedLogs[t.id] ? 'Hide logs' : 'Logs'}
              </button>
              <button className="button button-ghost button-small remove-btn" onClick={() => removeToken(t.id)}>Remove</button>
            </div>

            {expandedLogs[t.id] && (
              <div className="tc-logs">
                {!(t.logs || []).length
                  ? <div className="logs-empty">No activity yet.</div>
                  : t.logs.map(log => (
                    <div key={log.id} className={`log-row log-${log.status}`}>
                      <span className="log-time">{dateText(log.timestamp)}</span>
                      <span className="log-detail">{log.detail}</span>
                    </div>
                  ))
                }
              </div>
            )}
          </div>
        ))}
      </section>

      <footer className="app-footer">
        <span>✦ @LYON CONTROL ROOM</span>
        <span>Use only on accounts and channels you own.</span>
      </footer>
    </main>
  );
}
