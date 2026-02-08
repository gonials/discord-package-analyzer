import React, { useMemo, useState } from 'react';
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { getLocalDateKey, parseLocalDate, addLocalDay } from '../utils/dateUtils';
import './Overview.css';
import './Timeline.css';

function fillMissingDays(dayEntries) {
  if (!Array.isArray(dayEntries) || dayEntries.length === 0) return [];
  const byDate = new Map();
  for (const e of dayEntries) {
    const date = e?.date;
    if (date != null && String(date).length >= 8) byDate.set(String(date).slice(0, 10), Number(e.count) || 0);
  }
  const sorted = [...byDate.keys()].sort();
  if (sorted.length === 0) return [];
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  const start = parseLocalDate(min);
  const end = parseLocalDate(max);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) return [];
  const out = [];
  const d = new Date(start);
  while (d <= end) {
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    out.push({ date: key, count: byDate.get(key) ?? 0 });
    addLocalDay(d);
  }
  return out;
}

function formatDate(dateStr) {
  if (dateStr == null || String(dateStr).length < 8) return '—';
  try {
    const d = parseLocalDate(String(dateStr).slice(0, 10));
    return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
  } catch {
    return '—';
  }
}

export default function Timeline({ data }) {
  const [channelFilter, setChannelFilter] = useState('');

  const { chartData, events } = useMemo(() => {
    try {
      if (!data?.stats) return { chartData: [], events: [] };
      const s = data.stats;
      const byChannel = Array.isArray(s.byChannel) ? s.byChannel : [];
      const byDay = Array.isArray(s.byDay) ? s.byDay : [];

      const rawChartData = fillMissingDays(byDay);
      const chartData = rawChartData.map((row) => ({
        date: row.date,
        count: Number(row.count) || 0,
      }));

      const eventList = [];
      const firstGlobalTs = s.firstMessageAt;
      if (firstGlobalTs) {
        const key = getLocalDateKey(firstGlobalTs);
        if (key) {
          eventList.push({
            date: key,
            sortKey: key + ' 0',
            type: 'first_global',
            label: 'First message in this export',
            count: null,
          });
        }
      }

      const MAX_CHANNEL_EVENTS = 150;
      for (let i = 0; i < byChannel.length && eventList.length < MAX_CHANNEL_EVENTS + 20; i++) {
        const ch = byChannel[i];
        if (!ch?.firstMessageAt) continue;
        const key = getLocalDateKey(ch.firstMessageAt);
        if (!key) continue;
        eventList.push({
          date: key,
          sortKey: key + ' 1 ' + (ch.channelId ?? '') + ' ' + i,
          type: 'first_channel',
          channelName: ch.channelName ?? ch.channelId ?? 'Channel',
          guildName: ch.guildName ?? null,
          channelId: ch.channelId ?? null,
          label: `First message in ${ch.channelName ?? ch.channelId ?? 'channel'}`,
          count: null,
        });
      }

      const topDays = [...byDay]
        .filter((d) => d && (Number(d.count) || 0) > 0)
        .sort((a, b) => (Number(b?.count) || 0) - (Number(a?.count) || 0))
        .slice(0, 10);
      for (const d of topDays) {
        const date = d?.date;
        if (date == null) continue;
        const count = Number(d.count) || 0;
        eventList.push({
          date: String(date).slice(0, 10),
          sortKey: date + ' 2 ' + count,
          type: 'peak',
          label: `Peak: ${count.toLocaleString()} messages`,
          count,
        });
      }

      eventList.sort((a, b) => String(a.sortKey).localeCompare(String(b.sortKey)));

      return { chartData, events: eventList };
    } catch (err) {
      console.error('[Timeline]', err);
      return { chartData: [], events: [] };
    }
  }, [data]);

  const filteredEvents = useMemo(() => {
    if (!Array.isArray(events)) return [];
    const q = String(channelFilter ?? '').trim().toLowerCase();
    if (!q) return events;
    return events.filter((e) => {
      if (e?.type === 'first_channel') {
        return (
          String(e.channelName ?? '').toLowerCase().includes(q) ||
          String(e.guildName ?? '').toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [events, channelFilter]);

  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  return (
    <div className="overview-view timeline-view">
      <h2 className="view-heading">Timeline</h2>

      <div className="panel">
        <h3 className="panel-title">Message frequency over time</h3>
        <p className="timeline-muted">Daily message count across all channels</p>
        {chartData.length > 0 ? (
          <div className="timeline-chart-wrap">
            <p className="timeline-muted timeline-chart-hint">Scroll horizontally to see the entire timeline.</p>
            <div className="timeline-chart-scroll">
              <div className="timeline-chart-inner" style={{ width: Math.max(600, chartData.length * 2.5) }}>
                <LineChart
                  width={Math.max(600, chartData.length * 2.5)}
                  height={260}
                  data={chartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 8 }}
                >
                  <defs>
                    <linearGradient id="timelineLineGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5865f2" />
                      <stop offset="50%" stopColor="#e6c04a" />
                      <stop offset="100%" stopColor="#23a559" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="date" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                  <Tooltip
                    contentStyle={{
                      background: 'var(--bg-secondary)',
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                    }}
                    formatter={(value) => [value != null ? value : 0, 'messages']}
                    labelFormatter={(label) => formatDate(label)}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    stroke="url(#timelineLineGrad)"
                    strokeWidth={2}
                    dot={false}
                    name="Messages"
                  />
                </LineChart>
              </div>
            </div>
          </div>
        ) : (
          <p className="timeline-empty">No daily data to show.</p>
        )}
      </div>

      <div className="panel">
        <h3 className="panel-title">Key moments</h3>
        <p className="timeline-muted">
          First messages and busiest days, in order. Filter to focus on specific channels.
        </p>
        <label className="timeline-filter-label">
          <span className="timeline-filter-text">Filter by channel or server</span>
          <input
            type="text"
            className="timeline-filter-input"
            placeholder="Search channel or server name…"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="Filter timeline events"
          />
        </label>
        <div className="timeline-list">
          {filteredEvents.length === 0 ? (
            <p className="timeline-empty">
              {channelFilter.trim() ? 'No events match the filter.' : 'No timeline events found.'}
            </p>
          ) : (
            filteredEvents.map((ev, i) => (
              <div key={(ev?.sortKey ?? ev?.date ?? i) + '-' + i} className={`timeline-item timeline-item--${ev?.type ?? 'peak'}`}>
                <time className="timeline-date" dateTime={ev?.date ?? ''}>
                  {formatDate(ev?.date)}
                </time>
                <div className="timeline-content">
                  <span className="timeline-label">{ev?.label ?? '—'}</span>
                  {ev?.guildName && ev?.type === 'first_channel' && (
                    <span className="timeline-meta"> {ev.guildName}</span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
