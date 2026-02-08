import React from 'react';
import './DMs.css';

export default function DMs({ data }) {
  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  const byChannel = data.stats.byChannel ?? [];
  const dms = byChannel.filter((ch) => !ch.guildId || ch.guildName === 'Direct Message');

  return (
    <div className="dms-view">
      <h2 className="view-heading">Direct messages</h2>
      <div className="panel">
        <h3 className="panel-title">Summary</h3>
        <p className="dms-count">
          <strong>{dms.length}</strong> DM / group conversation(s) with message data
        </p>
        <p className="dms-total">
          Total messages in DMs: <strong>{dms.reduce((sum, c) => sum + (c.count ?? 0), 0).toLocaleString()}</strong>
        </p>
      </div>
      <div className="panel">
        <h3 className="panel-title">Top people / groups (by message count)</h3>
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Channel / DM</th>
                <th>Messages</th>
              </tr>
            </thead>
            <tbody>
              {dms.length === 0 ? (
                <tr>
                  <td colSpan={3} className="dms-empty">
                    No DM data in this export, or DMs are grouped under server names.
                  </td>
                </tr>
              ) : (
                dms
                  .sort((a, b) => (b.count ?? 0) - (a.count ?? 0))
                  .slice(0, 50)
                  .map((ch, i) => (
                    <tr key={ch.channelId ?? i}>
                      <td>{i + 1}</td>
                      <td>{ch.channelName ?? ch.channelId ?? '—'}</td>
                      <td>{ch.count?.toLocaleString() ?? 0}</td>
                    </tr>
                  ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
