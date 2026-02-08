import React from 'react';
import { downloadJson, downloadCsv } from '../utils/exportData';
import './Layout.css';

const NAV = [
  { id: 'overview', label: 'Overview', icon: '📊' },
  { id: 'messages', label: 'Activity graphs', icon: '📈' },
  { id: 'random', label: 'Message lookup', icon: '🔍' },
  { id: 'insights', label: 'Insights', icon: '💡' },
  { id: 'vocabulary', label: 'Vocabulary', icon: '📖' },
  { id: 'timeline', label: 'Timeline', icon: '📅' },
];


export default function Layout({ data, currentView, onViewChange, onLoadNew, onExport, onRegenerate, children }) {
  const hasData = data && !data.error && data.stats;

  const handleExportJson = () => {
    if (!hasData) return;
    downloadJson(
      {
        stats: data.stats,
        channels: data.stats.byChannel,
        guilds: data.stats.byGuild,
        byDay: data.stats.byDay,
        byHour: data.stats.byHour,
        byDayOfWeek: data.stats.byDayOfWeek,
        topWords: data.stats.topWords,
      },
      'discord-summary.json'
    );
  };

  const handleExportCsv = () => {
    if (!hasData || !data.stats.byChannel?.length) return;
    const headers = ['channelName', 'guildName', 'count'];
    const rows = data.stats.byChannel.map((c) => ({
      channelName: c.channelName ?? c.channelId,
      guildName: c.guildName ?? '',
      count: c.count,
    }));
    downloadCsv(rows, headers, 'discord-messages-by-channel.csv');
  };

  return (
    <div className="layout">
      {hasData && (
        <header className="dashboard-topbar">
          <div className="topbar-left">
            <span className="topbar-user">Discord Data Analyzer by <span className="brand-gold">gonials</span></span>
            <div className="topbar-icons" aria-hidden>
              <span className="topbar-icon" title="Messages">💬</span>
              <span className="topbar-icon" title="Connections">🔗</span>
              <span className="topbar-icon" title="Security">🛡</span>
              <span className="topbar-icon" title="Dev">{"</>"}</span>
              <span className="topbar-icon" title="Desktop">🖥</span>
              <span className="topbar-icon" title="Mobile">📱</span>
            </div>
          </div>
          <div className="topbar-right">
            <button type="button" className="btn-primary topbar-btn" onClick={onExport ?? handleExportJson}>
              Export Data
            </button>
            <button type="button" className="btn-secondary topbar-btn" onClick={onRegenerate ?? onLoadNew}>
              Regenerate Data
            </button>
            <button type="button" className="topbar-settings" aria-label="Settings" title="Settings">⚙</button>
          </div>
        </header>
      )}
      <div className="layout-body">
        <aside className="sidebar">
          <h2 className="sidebar-title">Menu</h2>
          <nav className="sidebar-nav">
            {NAV.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`sidebar-link ${currentView === item.id ? 'active' : ''}`}
                onClick={() => onViewChange(item.id)}
              >
                <span className="sidebar-link-label">{item.label}</span>
                <span className="sidebar-link-icon" aria-hidden>{item.icon}</span>
              </button>
            ))}
          </nav>
          {hasData && (
            <div className="sidebar-export">
              <span className="sidebar-export-label">Export</span>
              <button type="button" className="sidebar-btn" onClick={handleExportJson}>
                Summary (JSON)
              </button>
              <button type="button" className="sidebar-btn" onClick={handleExportCsv}>
                Channels (CSV)
              </button>
              {onLoadNew && (
                <button type="button" className="sidebar-btn sidebar-btn-new" onClick={onLoadNew}>
                  Load new export
                </button>
              )}
            </div>
          )}
        </aside>
        <main className="main-panel">{children}</main>
      </div>
    </div>
  );
}
