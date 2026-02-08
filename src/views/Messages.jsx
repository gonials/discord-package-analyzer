import React, { useState, useMemo, useRef, useEffect } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { getLocalDateKey, parseLocalDate, addLocalDay } from '../utils/dateUtils';
import './Messages.css';

/** Expand daily counts to include every date in range with 0 where missing (local timezone). */
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

/** All messages from byChannel with channel info, for keyword filtering. */
function getAllMessages(byChannel) {
  if (!byChannel?.length) return [];
  return byChannel.flatMap((ch) =>
    (ch.messages ?? []).map((m) => ({
      ...m,
      channelId: ch.channelId,
      channelName: ch.channelName,
      guildId: ch.guildId,
      guildName: ch.guildName,
    }))
  );
}

export default function Messages({ data }) {
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [channelFromDate, setChannelFromDate] = useState('');
  const [channelToDate, setChannelToDate] = useState('');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [channelSearch, setChannelSearch] = useState('');
  const channelDetailRef = useRef(null);

  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  const s = data.stats;
  const byChannel = s.byChannel ?? [];

  const allMessages = useMemo(() => getAllMessages(byChannel), [byChannel]);
  const filteredMessages = useMemo(() => {
    const q = searchKeyword.trim().toLowerCase();
    if (!q) return allMessages;
    return allMessages.filter((m) => m.contents && String(m.contents).toLowerCase().includes(q));
  }, [allMessages, searchKeyword]);

  const filteredByDay = useMemo(() => {
    const dayCounts = new Map();
    for (const m of filteredMessages) {
      const key = getLocalDateKey(m.timestamp);
      if (!key) continue;
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    }
    const entries = Array.from(dayCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
    return fillMissingDays(entries);
  }, [filteredMessages]);

  const filteredByChannel = useMemo(() => {
    const byCh = new Map();
    for (const m of filteredMessages) {
      const id = m.channelId ?? 'unknown';
      if (!byCh.has(id)) byCh.set(id, { channelId: m.channelId, channelName: m.channelName, guildId: m.guildId, guildName: m.guildName, count: 0 });
      byCh.get(id).count += 1;
    }
    return [...byCh.values()].sort((a, b) => (b.count ?? 0) - (a.count ?? 0)).slice(0, 100);
  }, [filteredMessages]);

  const filteredSummary = useMemo(() => {
    const n = filteredMessages.length;
    const words = filteredMessages.reduce((acc, m) => {
      const t = (m.contents && String(m.contents).trim()) || '';
      return acc + (t ? t.split(/\s+/).length : 0);
    }, 0);
    return { totalMessages: n, totalWords: words, avgWordsPerMessage: n ? Math.round((words / n) * 10) / 10 : 0 };
  }, [filteredMessages]);

  const topChannels = searchKeyword.trim() ? filteredByChannel : byChannel.slice(0, 100);
  const channelsForTable = useMemo(() => {
    const q = channelSearch.trim().toLowerCase();
    if (!q) return topChannels;
    return topChannels.filter(
      (ch) =>
        (ch.channelName ?? '')
          .toLowerCase()
          .includes(q) || (ch.guildName ?? '')
          .toLowerCase()
          .includes(q)
    );
  }, [topChannels, channelSearch]);

  const channelMessages = selectedChannel?.messages;
  const hasChannelMessages = Array.isArray(channelMessages) && channelMessages.length > 0;
  const messagesForSelectedChannel = useMemo(() => {
    if (!selectedChannel || !hasChannelMessages) return [];
    const q = searchKeyword.trim().toLowerCase();
    const list = selectedChannel.messages ?? [];
    if (!q) return list;
    return list.filter((m) => m.contents && String(m.contents).toLowerCase().includes(q));
  }, [selectedChannel, hasChannelMessages, searchKeyword]);

  const channelByDay = useMemo(() => {
    if (!selectedChannel || messagesForSelectedChannel.length === 0) return [];
    let from = null;
    let to = null;
    if (channelFromDate.trim()) {
      from = parseLocalDate(channelFromDate);
      from.setHours(0, 0, 0, 0);
    }
    if (channelToDate.trim()) {
      to = parseLocalDate(channelToDate);
      to.setHours(23, 59, 59, 999);
    }
    const dayCounts = new Map();
    for (const m of messagesForSelectedChannel) {
      const key = getLocalDateKey(m.timestamp);
      if (!key) continue;
      const ts = m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp);
      if (from && ts.getTime() < from.getTime()) continue;
      if (to && ts.getTime() > to.getTime()) continue;
      dayCounts.set(key, (dayCounts.get(key) || 0) + 1);
    }
    const entries = Array.from(dayCounts.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, count]) => ({ date, count }));
    return fillMissingDays(entries);
  }, [selectedChannel, channelFromDate, channelToDate, messagesForSelectedChannel]);

  const byDayWithZeros = searchKeyword.trim() ? filteredByDay : fillMissingDays(s.byDay ?? []);
  const graphData = selectedChannel ? channelByDay : byDayWithZeros;
  const showGraph = selectedChannel ? (messagesForSelectedChannel.length > 0 && channelByDay.length > 0) : byDayWithZeros.length > 0;
  const summaryToShow = searchKeyword.trim() ? filteredSummary : { totalMessages: s.totalMessages, totalWords: s.totalWords, avgWordsPerMessage: s.avgWordsPerMessage };

  useEffect(() => {
    if (selectedChannel && channelDetailRef.current) {
      channelDetailRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [selectedChannel]);

  return (
    <div className="messages-view">
      <h2 className="view-heading">Activity graphs</h2>
      <div className="panel">
        <h3 className="panel-title">Summary</h3>
        <ul className="messages-summary-list">
          <li>Total messages: <strong>{summaryToShow.totalMessages?.toLocaleString() ?? 0}</strong></li>
          <li>Total words: <strong>{summaryToShow.totalWords?.toLocaleString() ?? 0}</strong></li>
          <li>Avg words per message: <strong>{summaryToShow.avgWordsPerMessage ?? 0}</strong></li>
          <li>Channels with messages: <strong>{searchKeyword.trim() ? filteredByChannel.length : byChannel.length}</strong></li>
        </ul>
      </div>
      <div ref={channelDetailRef} className="panel">
        <div className="messages-graph-header">
          <h3 className="panel-title">
            {selectedChannel
              ? `Messages over time — ${selectedChannel.channelName ?? selectedChannel.channelId ?? 'Channel'}${selectedChannel.guildName ? ` (${selectedChannel.guildName})` : ''}`
              : 'Messages over time (daily)'}
          </h3>
          <label className="messages-search-label">
            <span className="messages-date-label-text">Search</span>
            <input
              type="text"
              className="messages-search-input"
              placeholder="Filter by keyword…"
              value={searchKeyword}
              onChange={(e) => setSearchKeyword(e.target.value)}
              aria-label="Search messages by keyword"
            />
          </label>
          {searchKeyword.trim() && (
            <button
              type="button"
              className="messages-clear-dates-btn"
              onClick={() => setSearchKeyword('')}
            >
              Clear search
            </button>
          )}
          {selectedChannel && (
            <>
              <div className="messages-channel-date-filters">
                <label className="messages-date-label">
                  <span className="messages-date-label-text">From</span>
                  <input
                    type="date"
                    className="messages-date-input"
                    value={channelFromDate}
                    onChange={(e) => setChannelFromDate(e.target.value)}
                    aria-label="Filter from date"
                  />
                </label>
                <label className="messages-date-label">
                  <span className="messages-date-label-text">To</span>
                  <input
                    type="date"
                    className="messages-date-input"
                    value={channelToDate}
                    onChange={(e) => setChannelToDate(e.target.value)}
                    aria-label="Filter to date"
                  />
                </label>
                <button
                  type="button"
                  className="messages-clear-dates-btn"
                  onClick={() => { setChannelFromDate(''); setChannelToDate(''); }}
                >
                  Clear dates
                </button>
              </div>
              <button type="button" className="messages-back-btn" onClick={() => { setSelectedChannel(null); setChannelFromDate(''); setChannelToDate(''); }}>
                Back to all
              </button>
            </>
          )}
        </div>
        {!selectedChannel && showGraph && (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={graphData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="messagesBarGradAll" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#5865f2" />
                    <stop offset="100%" stopColor="#00b4d8" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="url(#messagesBarGradAll)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {selectedChannel && !hasChannelMessages && (
          <p className="messages-channel-empty">
            No message data available for this channel. The graph needs per-channel message timestamps from your export.
          </p>
        )}
        {selectedChannel && hasChannelMessages && !showGraph && (
          <p className="messages-channel-empty">
            No messages in this channel {channelFromDate || channelToDate ? 'for the selected date range' : ''}.
          </p>
        )}
        {selectedChannel && showGraph && (
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={graphData} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="messagesBarGradChannel" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#5865f2" />
                    <stop offset="100%" stopColor="#e6c04a" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="url(#messagesBarGradChannel)" radius={[4, 4, 0, 0]} name="Messages" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="panel">
        <h3 className="panel-title">Top active channels (messages per channel)</h3>
        <label className="messages-search-label messages-channel-search">
          <span className="messages-date-label-text">Search channels</span>
          <input
            type="text"
            className="messages-search-input"
            placeholder="Filter by channel or server name…"
            value={channelSearch}
            onChange={(e) => setChannelSearch(e.target.value)}
            aria-label="Search channels by name"
          />
        </label>
        <p className="messages-channel-hint">
          {searchKeyword.trim() ? `Showing channels with messages matching "${searchKeyword.trim()}". ` : ''}
          {channelSearch.trim() ? `Filtered to ${channelsForTable.length} channel(s). ` : ''}
          Click a channel to update the graph above and filter by date.
        </p>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Channel</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {channelsForTable.map((ch, i) => {
                const channelForSelection = ch.messages ? ch : byChannel.find((c) => c.channelId === ch.channelId) ?? ch;
                return (
                  <tr
                    key={ch.channelId ?? i}
                    className={selectedChannel?.channelId === ch.channelId ? 'selected' : ''}
                    onClick={(e) => { e.stopPropagation(); setSelectedChannel(channelForSelection); }}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setSelectedChannel(channelForSelection); } }}
                  >
                    <td>{i + 1}</td>
                    <td>{ch.channelName ?? ch.channelId ?? '—'}</td>
                    <td>{(ch.count ?? ch.messages?.length ?? 0).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {s.topWords?.length > 0 && (
        <div className="panel">
          <h3 className="panel-title">Most-used words (stopwords filtered)</h3>
          <div className="top-words">
            {s.topWords.slice(0, 50).map(([word, count], i) => (
              <span key={i} className="top-word-tag" title={`${count} uses`}>
                {word} <span className="top-word-count">{count}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
