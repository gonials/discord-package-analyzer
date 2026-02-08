import React, { useState, useMemo } from 'react';
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { parseLocalDate, addLocalDay } from '../utils/dateUtils';
import './Overview.css';
import './Activity.css';

const HOUR_LABELS = ['12am', '1am', '2am', '3am', '4am', '5am', '6am', '7am', '8am', '9am', '10am', '11am', '12pm', '1pm', '2pm', '3pm', '4pm', '5pm', '6pm', '7pm', '8pm', '9pm', '10pm', '11pm'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function fillMissingDays(dayEntries) {
  if (!dayEntries?.length) return [];
  const byDate = new Map(dayEntries.map((e) => [e.date, e.count ?? 0]));
  const sorted = [...dayEntries].map((e) => e.date).sort();
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const out = [];
  const d = parseLocalDate(min);
  const end = parseLocalDate(max);
  while (d <= end) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, count: byDate.get(key) ?? 0 });
    addLocalDay(d);
  }
  return out;
}

function AvatarCircle({ url, name, className }) {
  const initial = name ? String(name).trim()[0]?.toUpperCase() || '?' : '?';
  if (url) {
    return (
      <>
        <img src={url} alt="" className={className} onError={(e) => { e.target.style.display = 'none'; const n = e.target.nextElementSibling; if (n) n.classList.add('avatar-fallback-visible'); }} />
        <span className={`avatar-fallback ${className}`}>{initial}</span>
      </>
    );
  }
  return <span className={`avatar-fallback ${className}`}>{initial}</span>;
}

export default function Overview({ data }) {
  const [userFilter, setUserFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');

  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  const s = data.stats;
  const account = data.account || {};
  const guildCount = data.stats.byGuild?.length ?? 0;
  const connections = account.connected_accounts ?? account.connections ?? [];
  const payments = account.payment_sources ?? account.payment_info ?? [];
  const transactions = account.payment_history ?? account.transactions ?? [];

  const activeHoursData = useMemo(() => {
    const byHour = s.byHour ?? [];
    return byHour.map(({ hour, count }) => ({
      hour: HOUR_LABELS[Number(hour)] ?? hour,
      messages: count,
    }));
  }, [s.byHour]);

  const dms = useMemo(() => {
    const list = (s.byChannel ?? []).filter((ch) => !ch.guildId || ch.guildName === 'Direct Message');
    return list.sort((a, b) => (b.count ?? 0) - (a.count ?? 0));
  }, [s.byChannel]);

  const channels = useMemo(() => (s.byChannel ?? []).slice(0, 100), [s.byChannel]);

  const filteredUsers = useMemo(() => {
    if (!userFilter.trim()) return dms.slice(0, 100);
    const q = userFilter.toLowerCase();
    return dms.filter((u) => (u.channelName ?? u.channelId ?? '').toLowerCase().includes(q)).slice(0, 100);
  }, [dms, userFilter]);

  const filteredChannels = useMemo(() => {
    if (!channelFilter.trim()) return channels.slice(0, 100);
    const q = channelFilter.toLowerCase();
    return channels.filter((c) => (c.channelName ?? c.guildName ?? '').toLowerCase().includes(q)).slice(0, 100);
  }, [channels, channelFilter]);

  const maxUserCount = useMemo(() => Math.max(1, ...filteredUsers.map((u) => u.count ?? 0)), [filteredUsers]);
  const maxChannelCount = useMemo(() => Math.max(1, ...filteredChannels.map((c) => c.count ?? 0)), [filteredChannels]);

  const topEmojis = s.topEmojis ?? [];
  const byDayWithZeros = useMemo(() => fillMissingDays(s.byDay ?? []), [s.byDay]);
  const byDayOfWeek = (s.byDayOfWeek ?? []).map((d) => ({ ...d, name: DAY_NAMES[d.day] ?? d.day }));
  const firstMsg = s.firstMessageAt ? new Date(s.firstMessageAt).toLocaleString() : '—';
  const lastMsg = s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleString() : '—';

  const messageSpan = useMemo(() => {
    const first = s.firstMessageAt ? new Date(s.firstMessageAt) : null;
    const last = s.lastMessageAt ? new Date(s.lastMessageAt) : null;
    if (!first || !last || isNaN(first.getTime()) || isNaN(last.getTime())) return null;
    const days = Math.floor((last - first) / (24 * 60 * 60 * 1000));
    const years = Math.floor(days / 365);
    const remainderDays = days % 365;
    return { days, years, remainderDays };
  }, [s.firstMessageAt, s.lastMessageAt]);

  const looksLikeIdsOnly = useMemo(() => {
    const sample = (s.byChannel ?? []).slice(0, 5).map((ch) => ch.channelName ?? ch.channelId ?? '');
    return sample.some((n) => /^[c~]?\d{15,}$/.test(String(n).trim()) || (n.length > 15 && /^\D?\d+$/.test(String(n).trim())));
  }, [s.byChannel]);

  return (
    <div className="overview-dashboard">
      {looksLikeIdsOnly && (
        <div className="overview-tip">
          <strong>Seeing only IDs?</strong> Load the <strong>full</strong> Discord export (the whole ZIP, or the folder that contains <code>messages/</code> with <code>index.json</code> inside it) so we can read channel and DM names from the index.
        </div>
      )}
      <div className="overview-row overview-row-top">
        <section className="panel overview-section overview-emojis">
          <h3 className="panel-title">YOUR TOP CUSTOM EMOJIS</h3>
          <div className="emoji-grid">
            {topEmojis.length === 0 ? (
              <span className="overview-muted">No :emoji: usage found in messages</span>
            ) : (
              topEmojis.slice(0, 18).map(([name, count], i) => (
                <div key={i} className="emoji-cell" title={`${name} (${count})`}>
                  <span className="emoji-name">{name}</span>
                  {count > 1 && <span className="emoji-count">×{count}</span>}
                </div>
              ))
            )}
          </div>
        </section>
        <section className="panel overview-section overview-preferences">
          <h3 className="panel-title">PREFERENCES &amp; CONNECTIONS</h3>
          <ul className="prefs-list">
            <li>You prefer Discord dark mode</li>
            <li>You are in <strong>{guildCount}</strong> guild{guildCount !== 1 ? 's' : ''}</li>
            {connections.length > 0 && (
              <li className="prefs-connections">
                <span>Your connections: </span>
                {connections.slice(0, 5).map((c, i) => (
                  <span key={i} className="connection-badge">{c.type ?? c.name ?? 'Connected'}</span>
                ))}
              </li>
            )}
          </ul>
          <div className="connections-icons">
            {connections.length > 0 ? (
              connections.slice(0, 4).map((c, i) => (
                <span key={i} className="connection-icon" title={c.type ?? c.name}>🔗</span>
              ))
            ) : (
              <span className="overview-muted">No connections in export</span>
            )}
          </div>
        </section>
      </div>

      <div className="overview-row overview-row-charts">
        <section className="panel overview-section overview-active-hours">
          <h3 className="panel-title">Active Hours</h3>
          <div className="chart-container chart-line">
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={activeHoursData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="overviewLineGrad" x1="0" y1="0" x2="1" y2="0">
                    <stop offset="0%" stopColor="#5865f2" />
                    <stop offset="50%" stopColor="#e6c04a" />
                    <stop offset="100%" stopColor="#23a559" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="hour" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} label={{ value: 'Messages', angle: -90, position: 'insideLeft', style: { fill: 'var(--text-muted)', fontSize: 11 } }} />
                <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Line type="monotone" dataKey="messages" stroke="url(#overviewLineGrad)" strokeWidth={2} dot={{ fill: 'var(--accent)', r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </section>
        {byDayWithZeros.length > 0 && (
          <section className="panel overview-section overview-by-day">
            <h3 className="panel-title">Messages over time (daily)</h3>
            <div className="chart-container chart-line">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDayWithZeros} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="overviewDailyBarGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#5865f2" />
                      <stop offset="100%" stopColor="#e6c04a" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 10 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }} />
                  <Bar dataKey="count" fill="url(#overviewDailyBarGrad)" radius={[4, 4, 0, 0]} name="Messages" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      <div className="overview-row overview-row-activity">
        <section className="panel overview-section overview-message-timeline">
          <h3 className="panel-title">Your message timeline</h3>
          <div className="timeline-visual">
            <div className="timeline-milestone timeline-milestone-first">
              <span className="timeline-milestone-icon" aria-hidden>📅</span>
              <div className="timeline-milestone-label">First message</div>
              <div className="timeline-milestone-value">{firstMsg}</div>
            </div>
            <div className="timeline-track">
              <div className="timeline-track-line" />
              {messageSpan && (
                <span className="timeline-track-badge">
                  {messageSpan.years > 0 && `${messageSpan.years} yr${messageSpan.years !== 1 ? 's' : ''} `}
                  {messageSpan.remainderDays > 0 && `${messageSpan.remainderDays} day${messageSpan.remainderDays !== 1 ? 's' : ''}`}
                  {messageSpan.years === 0 && messageSpan.remainderDays === 0 && 'Same day'}
                </span>
              )}
            </div>
            <div className="timeline-milestone timeline-milestone-last">
              <span className="timeline-milestone-icon" aria-hidden>✨</span>
              <div className="timeline-milestone-label">Last message</div>
              <div className="timeline-milestone-value">{lastMsg}</div>
            </div>
          </div>
        </section>
        {byDayOfWeek.length > 0 && (
          <section className="panel overview-section">
            <h3 className="panel-title">Activity by day of week</h3>
            <div className="chart-container">
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={byDayOfWeek} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                  <defs>
                    <linearGradient id="overviewDayOfWeekBarGrad" x1="0" y1="1" x2="0" y2="0">
                      <stop offset="0%" stopColor="#5865f2" />
                      <stop offset="100%" stopColor="#23a559" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                  />
                  <Bar dataKey="count" fill="url(#overviewDayOfWeekBarGrad)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>
        )}
      </div>

      <div className="overview-row overview-row-lists">
        <section className="panel overview-section overview-users">
          <h3 className="panel-title">TOP USERS</h3>
          <input
            type="text"
            className="overview-filter"
            placeholder="Filter users"
            value={userFilter}
            onChange={(e) => setUserFilter(e.target.value)}
          />
          <ul className="ranked-list">
            {filteredUsers.length === 0 ? (
              <li className="overview-muted">No DM data</li>
            ) : (
              filteredUsers.map((u, i) => (
                <li key={u.channelId ?? i} className="ranked-item">
                  <span className="rank-num">{i + 1}</span>
                  <div className="rank-avatar-wrap">
                    <AvatarCircle url={u.avatarUrl} name={u.channelName ?? u.channelId} className="rank-avatar" />
                  </div>
                  <div className="rank-content">
                    <span className="rank-name">{u.channelName ?? u.channelId ?? '—'}</span>
                    <span className="rank-meta">
                      <span className="rank-count">{(u.count ?? 0).toLocaleString()} messages</span>
                      <span className="rank-id">{u.channelId}</span>
                    </span>
                  </div>
                  <div className="rank-count-bar-wrap" title={`${(u.count ?? 0).toLocaleString()} messages`}>
                    <div className="rank-count-bar-track">
                      <div className="rank-count-bar-fill" style={{ width: `${Math.round((100 * (u.count ?? 0)) / maxUserCount)}%` }} />
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {dms.length > 0 && <p className="overview-showing">Showing {filteredUsers.length}/{dms.length}</p>}
        </section>
        <section className="panel overview-section overview-channels">
          <h3 className="panel-title">TOP CHANNELS</h3>
          <input
            type="text"
            className="overview-filter"
            placeholder="Filter channels"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
          />
          <ul className="ranked-list">
            {filteredChannels.length === 0 ? (
              <li className="overview-muted">No channels</li>
            ) : (
              filteredChannels.map((c, i) => (
                <li key={c.channelId ?? i} className="ranked-item">
                  <span className="rank-num">{i + 1}</span>
                  <div className="rank-avatar-wrap">
                    <AvatarCircle url={c.avatarUrl} name={c.channelName ?? c.channelId} className="rank-avatar" />
                  </div>
                  <div className="rank-content">
                    <span className="rank-name">{c.channelName ?? c.channelId ?? '—'}</span>
                    <span className="rank-meta">
                      <span className="rank-count">{(c.count ?? 0).toLocaleString()} messages</span>
                      {c.guildName ? <span className="rank-desc">{c.guildName}</span> : null}
                    </span>
                  </div>
                  <div className="rank-count-bar-wrap" title={`${(c.count ?? 0).toLocaleString()} messages`}>
                    <div className="rank-count-bar-track">
                      <div className="rank-count-bar-fill" style={{ width: `${Math.round((100 * (c.count ?? 0)) / maxChannelCount)}%` }} />
                    </div>
                  </div>
                </li>
              ))
            )}
          </ul>
          {channels.length > 0 && <p className="overview-showing">Showing {filteredChannels.length}/{Math.min(channels.length, 100)}</p>}
        </section>
      </div>

      <div className="overview-row overview-row-bottom">
        <section className="panel overview-section overview-payments">
          <h3 className="panel-title">YOUR PAYMENTS</h3>
          <p className="payments-total">You spent <strong>—</strong> on Discord (from export if available)</p>
          <div className="payments-sub">
            <h4>Your transactions</h4>
            <ul>
              {!Array.isArray(transactions) || transactions.length === 0 ? (
                <li className="overview-muted">No transaction data in export</li>
              ) : (
                transactions.slice(0, 5).map((t, i) => (
                  <li key={i}>{t.amount ?? t.total ?? '—'} at {t.date ?? t.created_at ?? '—'} for {t.description ?? '—'}</li>
                ))
              )}
            </ul>
          </div>
          <div className="payments-sub">
            <h4>Gifted Nitro / summary</h4>
            <ul>
              <li className="overview-muted">From account data if present in export</li>
            </ul>
          </div>
        </section>
      </div>
    </div>
  );
}
