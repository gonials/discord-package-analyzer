import React from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import './Activity.css';

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const HOUR_LABELS = Array.from({ length: 24 }, (_, i) => `${i}:00`);

export default function Activity({ data }) {
  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  const s = data.stats;
  const byHour = s.byHour ?? [];
  const byDayOfWeek = (s.byDayOfWeek ?? []).map((d) => ({ ...d, name: DAY_NAMES[d.day] ?? d.day }));
  const first = s.firstMessageAt ? new Date(s.firstMessageAt).toLocaleString() : '—';
  const last = s.lastMessageAt ? new Date(s.lastMessageAt).toLocaleString() : '—';

  const maxHour = Math.max(1, ...byHour.map((x) => x.count));

  return (
    <div className="activity-view">
      <h2 className="view-heading">Activity & time patterns</h2>
      <div className="panel">
        <h3 className="panel-title">First vs last message in dataset</h3>
        <p className="activity-range">
          First: <strong>{first}</strong>
        </p>
        <p className="activity-range">
          Last: <strong>{last}</strong>
        </p>
      </div>
      <div className="panel">
        <h3 className="panel-title">Active hours (messages by hour of day)</h3>
        <div className="heatmap-wrap">
          <div className="heatmap-grid">
            {byHour.length === 0 ? (
              <p className="activity-empty">No hourly data.</p>
            ) : (
              byHour.map(({ hour, count }) => (
                <div
                  key={hour}
                  className="heatmap-cell"
                  style={{
                    ['--intensity']: maxHour ? count / maxHour : 0,
                  }}
                  title={`${hour}:00 — ${count} messages`}
                >
                  <span className="heatmap-cell-value">{count}</span>
                </div>
              ))
            )}
          </div>
          <div className="heatmap-labels">
            {HOUR_LABELS.map((l, i) => (
              <span key={i} className="heatmap-label">
                {l}
              </span>
            ))}
          </div>
        </div>
      </div>
      {byDayOfWeek.length > 0 && (
        <div className="panel">
          <h3 className="panel-title">Activity by day of week</h3>
          <div className="chart-container">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={byDayOfWeek} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
                <defs>
                  <linearGradient id="activityBarGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#5865f2" />
                    <stop offset="100%" stopColor="#eb459e" />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--text-muted)" tick={{ fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 8 }}
                />
                <Bar dataKey="count" fill="url(#activityBarGrad)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </div>
  );
}
