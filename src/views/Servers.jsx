import React from 'react';
import './Servers.css';

export default function Servers({ data }) {
  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  const byGuild = data.stats.byGuild ?? [];
  const byChannel = data.stats.byChannel ?? [];

  const serversWithChannels = byGuild.map((g) => {
    const channels = byChannel.filter((ch) => ch.guildId === g.guildId);
    return {
      ...g,
      channels: channels.sort((a, b) => (b.count ?? 0) - (a.count ?? 0)),
      totalMessages: channels.reduce((sum, c) => sum + (c.count ?? 0), 0),
    };
  });

  return (
    <div className="servers-view">
      <h2 className="view-heading">Servers</h2>
      <div className="panel">
        <h3 className="panel-title">Servers you are/were in</h3>
        <p className="servers-count">
          <strong>{serversWithChannels.length}</strong> server(s) with message data
        </p>
      </div>
      {serversWithChannels.length === 0 ? (
        <div className="panel">No server data in this export.</div>
      ) : (
        serversWithChannels.map((server) => (
          <div key={server.guildId} className="panel server-card">
            <h3 className="server-name">{server.guildName ?? server.guildId}</h3>
            <p className="server-meta">
              {server.channels.length} channel(s) · {server.totalMessages?.toLocaleString() ?? 0} messages
            </p>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Channel</th>
                    <th>Messages</th>
                  </tr>
                </thead>
                <tbody>
                  {server.channels.slice(0, 30).map((ch, i) => (
                    <tr key={ch.channelId ?? i}>
                      <td>{ch.channelName ?? ch.channelId ?? '—'}</td>
                      <td>{ch.count?.toLocaleString() ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {server.channels.length > 30 && (
              <p className="server-more">+ {server.channels.length - 30} more channels</p>
            )}
          </div>
        ))
      )}
    </div>
  );
}
