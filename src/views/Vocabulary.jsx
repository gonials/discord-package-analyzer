import React, { useMemo, useState } from 'react';
import './Overview.css';
import './Messages.css';
import './Vocabulary.css';

/** For each channel, words that appear more often there than globally (signature words). */
function getSignatureWords(byChannel, globalTopWords) {
  const globalCount = (globalTopWords ?? []).reduce((sum, [, c]) => sum + c, 0) || 1;
  const globalMap = new Map((globalTopWords ?? []).map(([w, c]) => [String(w).toLowerCase(), c]));

  return (byChannel ?? []).slice(0, 20).map((ch) => {
    const chWords = ch.topWords ?? [];
    const chTotal = ch.count ?? 1;
    const withScore = chWords
      .map(([word, count]) => {
        const w = String(word).toLowerCase();
        const g = globalMap.get(w) ?? 0;
        const chFreq = count / chTotal;
        const globalFreq = (g + 0.5) / globalCount;
        const ratio = globalFreq > 0 ? chFreq / globalFreq : chFreq * globalCount;
        return { word: w, count, ratio };
      })
      .filter((x) => x.word.length >= 2 && x.ratio > 1.1)
      .sort((a, b) => b.ratio - a.ratio)
      .slice(0, 8);
    return {
      channelId: ch.channelId,
      channelName: ch.channelName ?? ch.channelId ?? 'Unknown',
      guildName: ch.guildName,
      signatureWords: withScore,
    };
  }).filter((c) => c.signatureWords.length > 0);
}

export default function Vocabulary({ data }) {
  const [channelFilter, setChannelFilter] = useState('');

  const vocab = useMemo(() => {
    if (!data?.stats) return null;
    const s = data.stats;
    const byChannel = s.byChannel ?? [];
    const topWords = s.topWords ?? [];
    const signatureByChannel = getSignatureWords(byChannel, topWords);
    return {
      topWords: topWords.slice(0, 60),
      signatureByChannel,
      byChannel,
    };
  }, [data]);

  const filteredChannels = useMemo(() => {
    if (!vocab?.signatureByChannel) return [];
    const q = channelFilter.trim().toLowerCase();
    if (!q) return vocab.signatureByChannel.slice(0, 15);
    return vocab.signatureByChannel
      .filter(
        (c) =>
          (c.channelName ?? '').toLowerCase().includes(q) ||
          (c.guildName ?? '').toLowerCase().includes(q)
      )
      .slice(0, 15);
  }, [vocab, channelFilter]);

  if (!data?.stats) return <div className="panel">No data loaded.</div>;
  if (!vocab) return null;

  return (
    <div className="overview-view vocab-view">
      <h2 className="view-heading">Vocabulary</h2>

      <div className="panel">
        <h3 className="panel-title">Most-used words (all messages)</h3>
        <p className="vocab-muted">Stopwords filtered. Click a word to see count.</p>
        <div className="top-words vocab-top-words">
          {vocab.topWords.map(([word, count], i) => (
            <span key={i} className="top-word-tag" title={`${count} uses`}>
              {word} <span className="top-word-count">{count}</span>
            </span>
          ))}
        </div>
      </div>

      <div className="panel">
        <h3 className="panel-title">Signature words by channel</h3>
        <p className="vocab-muted">
          Words that show up more in this channel than in your messages overall.
        </p>
        <label className="vocab-filter-label">
          <span className="vocab-filter-text">Filter channels</span>
          <input
            type="text"
            className="vocab-filter-input"
            placeholder="Search channel or server name…"
            value={channelFilter}
            onChange={(e) => setChannelFilter(e.target.value)}
            aria-label="Filter channels"
          />
        </label>
        <div className="vocab-signature-list">
          {filteredChannels.length === 0 ? (
            <p className="vocab-empty">
              {channelFilter.trim()
                ? 'No channels match the filter.'
                : 'No signature words computed (need per-channel word counts).'}
            </p>
          ) : (
            filteredChannels.map((c) => (
              <div key={c.channelId} className="vocab-signature-card">
                <div className="vocab-signature-header">
                  <span className="vocab-channel-name">{c.channelName}</span>
                  {c.guildName && (
                    <span className="vocab-guild-name">{c.guildName}</span>
                  )}
                </div>
                <div className="vocab-signature-words">
                  {c.signatureWords.map(({ word, count, ratio }, i) => (
                    <span
                      key={i}
                      className="vocab-sig-tag"
                      title={`${count} uses here, ${(ratio * 100).toFixed(0)}% vs global`}
                    >
                      {word}
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
