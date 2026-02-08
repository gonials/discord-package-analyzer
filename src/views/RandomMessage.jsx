import React, { useState, useMemo, useEffect } from 'react';
import { parseLocalDate } from '../utils/dateUtils';
import './RandomMessage.css';
import './Overview.css';

const OPENAI_KEY_STORAGE = 'discord-analyzer-openai-key';

async function fetchAISummary(apiKey, ch, stats) {
  const totalMessages = stats?.totalMessages ?? 1;
  const globalWordCounts = new Map((stats?.topWords ?? []).map(([w, c]) => [String(w).toLowerCase(), c]));
  const chWords = (ch.topWords ?? []).slice(0, 30);
  const chCount = ch.count ?? 1;
  const total = Math.max(totalMessages, 1);
  const wordsWithScore = chWords
    .map(([word, count]) => {
      const w = String(word).toLowerCase();
      const globalCount = globalWordCounts.get(w) ?? 0;
      const chFreq = count / chCount;
      const globalFreq = (globalCount + 0.5) / total;
      return { w, distinctiveness: globalFreq > 0 ? chFreq / globalFreq : chFreq * total };
    })
    .sort((a, b) => b.distinctiveness - a.distinctiveness)
    .map((x) => x.w)
    .filter((w) => w.length >= 2)
    .slice(0, 30);

  const allWithContent = (ch.messages ?? []).filter((m) => m.contents && String(m.contents).trim());
  const sampleSize = Math.min(5000, allWithContent.length);
  const shuffled = [...allWithContent].sort(() => Math.random() - 0.5);
  const sampled = shuffled.slice(0, sampleSize);
  const excerptCount = Math.min(250, sampled.length);
  const excerpts = sampled
    .slice(0, excerptCount)
    .map((m) => String(m.contents).trim().slice(0, 100))
    .join('\n');

  const name = ch.channelName ?? ch.channelId ?? 'Unknown';
  const isFiltered = ch.channelId === 'filtered';
  const typeLabel = isFiltered ? 'Filtered results (user-applied filters: keyword, location, date range, etc.)' : (ch.guildId ? 'Server channel' : 'DM');
  const prompt = `You are writing an in-depth summary of what the user typically talks about in ${isFiltered ? 'the set of messages matching their current filters (e.g. keyword, location, date range). These are not necessarily from one channel — they are whatever messages match the filters.' : 'one specific Discord channel or DM.'} The message excerpts below are drawn from a random sample of up to 5000 messages — use them as the main evidence for your summary. Use ONLY this data. Write exactly 3 substantial, in-depth paragraphs. No bullet points, no keyword lists. Each paragraph should be several sentences and go into real detail.

Paragraph 1: What the conversation is mostly about. Describe the main topics, themes, and subjects in depth. Use the word list and the many message excerpts to infer what the user actually discusses and cares about here.

Paragraph 2: Secondary themes and how the user and others interact. Go into detail about the kinds of back-and-forth, whether they ask for feedback, share ideas, coordinate plans, or react to each other. Use the excerpts to support this.

Paragraph 3: Overall tone and how the user engages in this space. Be specific about the style of conversation (e.g. exploratory, collaborative, casual, focused on creation or problem-solving), and how the user shapes the discussion. Base this on the data.

Be specific and stick to the data; do not invent details. Write in clear, flowing prose.

Channel/DM name: ${name}
Type: ${typeLabel}
Total messages from user in this channel: ${ch.count ?? 0}
Messages sampled for excerpts: ${sampleSize}
Most frequent or distinctive words (in order): ${wordsWithScore.join(', ')}

Message excerpts (from random sample of up to 5000 messages, ${excerptCount} shown):
${excerpts || '(no message content)'}`;

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey.trim()}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 1500,
      temperature: 0.5,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error?.message || res.statusText || `HTTP ${res.status}`);
  }
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content?.trim() || '';
  return text;
}

function getGlobalWordCounts(stats) {
  const map = new Map();
  const arr = stats?.topWords ?? [];
  for (const [w, count] of arr) map.set(String(w).toLowerCase(), count);
  return map;
}

function getDistinctiveWords(ch, globalWordCounts, totalMessages) {
  const chWords = (ch.topWords ?? []).slice(0, 30);
  const chCount = ch.count ?? 1;
  const total = Math.max(totalMessages, 1);
  const out = [];
  for (const [word, count] of chWords) {
    const w = String(word).toLowerCase();
    if (w.length < 2) continue;
    const globalCount = globalWordCounts.get(w) ?? 0;
    const chFreq = count / chCount;
    const globalFreq = (globalCount + 0.5) / total;
    const distinctiveness = globalFreq > 0 ? chFreq / globalFreq : chFreq * total;
    out.push({ word: w, count, distinctiveness });
  }
  return out.sort((a, b) => b.distinctiveness - a.distinctiveness);
}

function formatWordList(words, max = 6) {
  const list = words.slice(0, max);
  if (list.length === 0) return '';
  if (list.length === 1) return list[0];
  if (list.length === 2) return `${list[0]} and ${list[1]}`;
  return list.slice(0, -1).join(', ') + ', and ' + list[list.length - 1];
}

/** Build a synthetic channel from a list of messages for overview/AI summary (filter-based). */
function buildFilteredChannel(messages, label = 'Filtered results') {
  if (!messages || messages.length === 0) return null;
  const wordCounts = new Map();
  for (const m of messages) {
    const text = m.contents && String(m.contents).trim();
    if (!text) continue;
    const words = text.toLowerCase().split(/\s+/).map((w) => w.replace(/[^a-z0-9\u00c0-\u024f]/gi, '').trim()).filter((w) => w.length >= 2);
    for (const w of words) wordCounts.set(w, (wordCounts.get(w) ?? 0) + 1);
  }
  const topWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 50).map(([word, count]) => [word, count]);
  return {
    messages,
    count: messages.length,
    topWords,
    channelName: label,
    channelId: 'filtered',
    guildId: null,
  };
}

function generateChannelOverview(ch, stats) {
  if (!ch) return null;
  const totalMessages = stats?.totalMessages ?? 1;
  const globalWordCounts = getGlobalWordCounts(stats);
  const distinctive = getDistinctiveWords(ch, globalWordCounts, totalMessages);
  const count = ch.count ?? 0;
  const isFiltered = ch.channelId === 'filtered';
  const isDM = !ch.guildId && !isFiltered;
  const name = ch.channelName ?? ch.channelId ?? (isDM ? 'this user' : 'this channel');
  const context = isFiltered ? 'In the messages matching your current filters' : isDM ? 'In conversations with this user' : 'In this channel';
  const conversation = isFiltered ? 'these messages' : isDM ? 'your conversations' : 'the discussion here';

  const signature = distinctive
    .filter((d) => d.word.length >= 3 && (d.distinctiveness > 1.15 || distinctive.indexOf(d) < 10))
    .map((d) => d.word)
    .slice(0, 12);
  const fallbackWords = (ch.topWords ?? []).slice(0, 10).map(([w]) => String(w).toLowerCase());

  let para1 = '';
  let para2 = '';
  let para3 = '';

  if (signature.length === 0 && fallbackWords.length === 0) {
    para1 = `${context}, there isn't enough repeated vocabulary in your messages to infer what you usually talk about. The chat may be very short or highly varied.`;
    para2 = `With more messages or more consistent wording, the overview could describe the main topics; for now the data doesn't show a clear theme.`;
    para3 = `Overall, ${name} is a place where your messages don't cluster around a few identifiable subjects in the data.`;
    return { para1, para2, para3 };
  }

  const wordsForProse = signature.length >= 3 ? signature : fallbackWords.filter((w) => w.length >= 3);
  const primaryList = wordsForProse.slice(0, 5);
  const secondaryList = wordsForProse.slice(5, 10).filter((w) => !primaryList.includes(w));

  const phrase = formatWordList(primaryList, 5);
  para1 = `${context}, the discussion most often centers around topics that show up in words like ${phrase}. `;
  para1 += `Your messages here repeatedly come back to these ideas, so this is what you ${isFiltered ? 'tend to talk about in these messages' : isDM ? 'and this user tend to talk about in ' + name : 'and others tend to talk about in ' + name} — not just in passing, but as a real theme of the conversation.`;

  if (secondaryList.length >= 2) {
    const secondPhrase = formatWordList(secondaryList, 4);
    para2 = `A lot of the conversation also touches on ${secondPhrase}. `;
    para2 += `So alongside the main thread, ${conversation} branch into these related topics; you're not stuck on one narrow subject.`;
  } else if (primaryList.length >= 4) {
    para2 = `The vocabulary you use here is quite focused on ${formatWordList(primaryList.slice(2, 5), 3)} in particular, so the chat tends to stay in that zone rather than jumping to unrelated things. You clearly ${isFiltered ? 'focus on a recognizable set of topics in these messages' : 'use this ' + (isDM ? 'DM' : 'channel') + ' for a recognizable set of topics'}.`;
  } else {
    para2 = `${conversation} tend to revolve around these themes rather than one-off mentions. You come back to the same kinds of subjects, which gives the thread a consistent focus.`;
  }

  const active = count > 500 ? 'very active' : count > 150 ? 'active' : count > 50 ? 'moderately active' : 'occasional';
  para3 = `Overall, ${conversation} ${isFiltered ? '' : 'in ' + name + ' '}are ${active}, and the things you talk about — ${formatWordList(wordsForProse.slice(0, 4), 4)} — ${isFiltered ? 'define this filtered set of messages. You\'re clearly engaged in this slice of your data.' : 'are what make this ' + (isDM ? 'DM' : 'channel') + ' distinct from your other chats. You\'re clearly engaged in this space and shape where the discussion goes.'}`;
  return { para1, para2, para3 };
}

function getAllMessages(data) {
  const byChannel = data?.stats?.byChannel ?? [];
  const out = [];
  for (const ch of byChannel) {
    const messages = ch?.messages ?? [];
    for (let i = 0; i < messages.length; i++) {
      const m = messages[i];
      if (m == null || typeof m !== 'object') continue;
      out.push({
        ...m,
        channelName: m.channelName ?? ch.channelName ?? ch.channelId,
        guildName: m.guildName ?? ch.guildName,
        channelId: m.channelId ?? ch.channelId,
        guildId: m.guildId ?? ch.guildId,
        avatarUrl: m.avatarUrl ?? ch.avatarUrl ?? null,
      });
    }
  }
  return out;
}

function SmallAvatar({ url, name }) {
  const initial = name ? String(name).trim()[0]?.toUpperCase() || '?' : '?';
  if (url) {
    return (
      <>
        <img src={url} alt="" className="random-msg-avatar-img" onError={(e) => { e.target.style.display = 'none'; e.target.nextElementSibling?.classList.add('random-msg-avatar-fallback-visible'); }} />
        <span className="random-msg-avatar-fallback">{initial}</span>
      </>
    );
  }
  return <span className="random-msg-avatar-fallback random-msg-avatar-fallback-visible">{initial}</span>;
}

function MessageCard({ message, title }) {
  if (!message) return null;
  const ts = message.timestamp instanceof Date ? message.timestamp : (message.timestamp != null ? new Date(message.timestamp) : null);
  const dateStr = ts && !isNaN(ts.getTime()) ? ts.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : '—';
  const attachments = Array.isArray(message.attachments) ? message.attachments : message.attachments ? [message.attachments] : [];
  const attachmentList = attachments.map((a, i) => {
    const url = typeof a === 'string' ? a : (a.url ?? a.URL ?? a);
    const name = typeof a === 'object' && (a.filename ?? a.name) ? (a.filename ?? a.name) : `Attachment ${i + 1}`;
    return url ? <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="random-msg-attachment">{name}</a> : <span key={i} className="random-msg-attachment random-msg-attachment-plain">{name}</span>;
  });

  return (
    <div className="random-msg-card">
      <div className="random-msg-card-header">
        <SmallAvatar url={message.avatarUrl} name={message.channelName ?? message.channelId} />
        <div className="random-msg-card-header-text">
          {title && <h4 className="random-msg-card-title">{title}</h4>}
          <span className="random-msg-card-location">{getLocationLabel(message)}</span>
        </div>
      </div>
      <div className="random-msg-content">{message.contents || '(no text)'}</div>
      <dl className="random-msg-meta">
        <dt>Date & time</dt>
        <dd>{dateStr}</dd>
        <dt>Message ID</dt>
        <dd className="random-msg-mono">{message.id ?? '—'}</dd>
        {attachmentList.length > 0 && (
          <>
            <dt>Attachments</dt>
            <dd className="random-msg-attachments">{attachmentList}</dd>
          </>
        )}
      </dl>
    </div>
  );
}

const PREVIEW_LEN = 80;
const MAX_DISPLAY = 500;

function safeTimestamp(m) {
  const t = m?.timestamp;
  if (t == null) return null;
  const d = t instanceof Date ? t : new Date(t);
  return isNaN(d.getTime()) ? null : d;
}

/** True if the string looks like a Discord channel/snowflake ID (long numeric). */
function looksLikeId(str) {
  if (str == null || typeof str !== 'string') return true;
  const s = str.trim();
  return /^[c~]?\d{15,}$/.test(s) || (s.length > 16 && /^\d+$/.test(s));
}

/** Display-friendly channel name: never show raw numeric ID for DMs. */
function getDisplayChannelName(message) {
  const raw = message.channelName ?? message.channelId ?? '';
  const isDM = !message.guildId;
  if (isDM && looksLikeId(raw)) return null;
  return raw || null;
}

function getLocationLabel(message) {
  const guild = message.guildName;
  if (guild) {
    const name = getDisplayChannelName(message) ?? message.channelId ?? 'Channel';
    return `${guild} › ${name}`;
  }
  const name = getDisplayChannelName(message);
  if (name) return `DM with ${name}`;
  return 'DM';
}

/** Same format as Activity graphs: Channel name, then Server (or DM). Never show raw ID for DMs. */
function getChannelAndServerLabel(message) {
  const isDM = !message.guildId;
  const rawName = message.channelName ?? message.channelId ?? '—';
  const channelName = isDM && looksLikeId(rawName) ? 'DM' : rawName;
  const serverName = message.guildName ?? (message.guildId ? 'Server' : 'DM');
  const displayChannel = isDM && !looksLikeId(rawName) ? `DM with ${channelName}` : channelName;
  return { channelName: displayChannel, serverName };
}

const MessageRow = React.memo(function MessageRow({ message, onSelect, isSelected }) {
  if (!message) return null;
  const text = message.contents != null ? String(message.contents) : '';
  const len = text.length;
  const preview = text.length <= PREVIEW_LEN ? text : text.slice(0, PREVIEW_LEN) + '…';
  const ts = safeTimestamp(message);
  const dateStr = ts ? ts.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
  const { channelName, serverName } = getChannelAndServerLabel(message);
  const channelLabel = serverName === 'DM' ? channelName : `${channelName} (${serverName})`;
  return (
    <button
      type="button"
      className={`random-msg-row ${isSelected ? 'random-msg-row-selected' : ''}`}
      onClick={() => onSelect(message)}
    >
      <span className="random-msg-row-preview">{preview || '(no text)'}</span>
      <span className="random-msg-row-meta">
        {len.toLocaleString()} chars · Channel: {channelLabel} · {dateStr}
      </span>
    </button>
  );
});

function toDateOnly(dateStr) {
  if (!dateStr || !dateStr.trim()) return null;
  const d = parseLocalDate(dateStr.trim());
  d.setHours(0, 0, 0, 0);
  return isNaN(d.getTime()) ? null : d;
}

export default function RandomMessage({ data }) {
  const allMessages = useMemo(() => getAllMessages(data), [data]);
  const [searchKeyword, setSearchKeyword] = useState('');
  const [afterDate, setAfterDate] = useState('');
  const [beforeDate, setBeforeDate] = useState('');
  const [minLength, setMinLength] = useState('');
  const [locationFilter, setLocationFilter] = useState('');
  const [selectedMessage, setSelectedMessage] = useState(null);
  const [randomMessage, setRandomMessage] = useState(null);
  const [randomMessageHistory, setRandomMessageHistory] = useState([]);
  const [randomHistoryIndex, setRandomHistoryIndex] = useState(-1);
  const [apiKeyInput, setApiKeyInput] = useState(() => (typeof localStorage !== 'undefined' ? (localStorage.getItem(OPENAI_KEY_STORAGE) || '') : ''));
  const [aiSummary, setAiSummary] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState(null);
  const [showAiOverview, setShowAiOverview] = useState(false);

  const s = data?.stats;

  const locationOptions = useMemo(() => {
    const byChannel = data?.stats?.byChannel ?? [];
    return byChannel.map((ch) => {
      const isDM = !ch.guildId;
      const rawName = ch.channelName ?? ch.channelId;
      const label = ch.guildId
        ? `${ch.guildName ?? 'Server'} › ${rawName}`
        : (looksLikeId(rawName) ? 'DM' : `DM with ${rawName}`);
      return { channelId: ch.channelId, label };
    });
  }, [data?.stats?.byChannel]);

  const searchResults = useMemo(() => {
    let filtered = allMessages;
    if (locationFilter) filtered = filtered.filter((m) => m.channelId === locationFilter);
    const q = searchKeyword.trim().toLowerCase();
    if (q) filtered = filtered.filter((m) => m.contents && String(m.contents).toLowerCase().includes(q));
    const after = toDateOnly(afterDate);
    if (after) filtered = filtered.filter((m) => { const t = safeTimestamp(m); return t && t.getTime() >= after.getTime(); });
    const before = toDateOnly(beforeDate);
    if (before) {
      const endOfDay = new Date(before);
      endOfDay.setHours(23, 59, 59, 999);
      filtered = filtered.filter((m) => { const t = safeTimestamp(m); return t && t.getTime() <= endOfDay.getTime(); });
    }
    const minLen = minLength.trim() === '' ? null : parseInt(minLength.trim(), 10);
    if (minLen != null && !isNaN(minLen) && minLen > 0) filtered = filtered.filter((m) => (m.contents && String(m.contents).length >= minLen));
    filtered = [...filtered].sort((a, b) => {
      const ta = safeTimestamp(a)?.getTime() ?? 0;
      const tb = safeTimestamp(b)?.getTime() ?? 0;
      return tb - ta;
    });
    return filtered;
  }, [allMessages, searchKeyword, afterDate, beforeDate, minLength, locationFilter]);

  const filteredSummarySource = useMemo(
    () => buildFilteredChannel(searchResults, `Filtered results (${searchResults.length} messages)`),
    [searchResults]
  );
  const overviewParagraphs = useMemo(() => generateChannelOverview(filteredSummarySource, s), [filteredSummarySource, s]);

  useEffect(() => {
    setAiSummary(null);
    setAiError(null);
  }, [searchKeyword, afterDate, beforeDate, minLength, locationFilter]);

  const handleSaveApiKey = () => {
    if (typeof localStorage !== 'undefined') localStorage.setItem(OPENAI_KEY_STORAGE, apiKeyInput.trim());
  };
  const handleGenerateAISummary = async () => {
    const key = typeof localStorage !== 'undefined' ? localStorage.getItem(OPENAI_KEY_STORAGE) : null;
    if (!key?.trim()) {
      setAiError('Add your OpenAI API key below and click Save to enable AI summary.');
      return;
    }
    if (!filteredSummarySource || filteredSummarySource.count === 0) {
      setAiError('No messages match the current filters. Adjust filters or clear them to include all messages.');
      return;
    }
    setAiError(null);
    setAiLoading(true);
    try {
      const text = await fetchAISummary(key, filteredSummarySource, s);
      setAiSummary(text);
    } catch (e) {
      setAiError(e?.message || 'Request failed.');
    } finally {
      setAiLoading(false);
    }
  };
  const handleRandomMessage = (fromResults = false) => {
    const pool = fromResults && searchResults.length > 0 ? searchResults : allMessages;
    if (pool.length === 0) return;
    const idx = Math.floor(Math.random() * pool.length);
    const picked = pool[idx];
    const nextHistory = [...randomMessageHistory, picked].slice(-30);
    setRandomMessageHistory(nextHistory);
    setRandomHistoryIndex(nextHistory.length - 1);
    setRandomMessage(picked);
    setSelectedMessage(null);
  };

  const displayedResults = useMemo(() => searchResults.slice(0, MAX_DISPLAY), [searchResults]);
  const hasMore = searchResults.length > MAX_DISPLAY;

  const viewedMessage = selectedMessage ?? randomMessage;
  const viewedIndex = viewedMessage ? displayedResults.findIndex((m) => m === viewedMessage) : -1;
  const isViewingRandomHistory = randomMessage && !selectedMessage && viewedIndex === -1;
  const canPrev = isViewingRandomHistory
    ? randomHistoryIndex > 0
    : displayedResults.length > 0 && viewedIndex > 0;
  const canNext = isViewingRandomHistory
    ? randomHistoryIndex < randomMessageHistory.length - 1 || displayedResults.length > 0
    : displayedResults.length > 0 && viewedIndex >= 0 && viewedIndex < displayedResults.length - 1;

  const handlePrevMessage = () => {
    if (isViewingRandomHistory && randomHistoryIndex > 0) {
      const newIndex = randomHistoryIndex - 1;
      setRandomHistoryIndex(newIndex);
      setRandomMessage(randomMessageHistory[newIndex]);
      return;
    }
    setRandomMessage(null);
    setRandomHistoryIndex(-1);
    if (viewedIndex > 0) setSelectedMessage(displayedResults[viewedIndex - 1]);
  };
  const handleNextMessage = () => {
    if (isViewingRandomHistory && randomHistoryIndex < randomMessageHistory.length - 1) {
      const newIndex = randomHistoryIndex + 1;
      setRandomHistoryIndex(newIndex);
      setRandomMessage(randomMessageHistory[newIndex]);
      return;
    }
    if (isViewingRandomHistory && displayedResults.length > 0) {
      setRandomMessage(null);
      setRandomHistoryIndex(-1);
      setSelectedMessage(displayedResults[0]);
      return;
    }
    setRandomMessage(null);
    setRandomHistoryIndex(-1);
    if (viewedIndex >= 0 && viewedIndex < displayedResults.length - 1) setSelectedMessage(displayedResults[viewedIndex + 1]);
  };

  const hasFilters = searchKeyword.trim() || afterDate.trim() || beforeDate.trim() || (minLength.trim() !== '' && !isNaN(parseInt(minLength.trim(), 10))) || locationFilter;

  if (!data?.stats) return <div className="panel">No data loaded.</div>;

  return (
    <div className="random-message-view">
      <h2 className="view-heading">Message lookup</h2>
      <p className="random-message-intro">Search by keyword, filter by location, date range, or minimum message length. Results are newest first.</p>

      <section className="random-message-section random-msg-random">
        <h3 className="panel-title">Random message</h3>
        <div className="random-msg-random-actions">
          <button type="button" className="overview-btn overview-btn-ai" onClick={() => handleRandomMessage(false)} disabled={allMessages.length === 0}>
            Get random message
          </button>
          {searchResults.length > 0 && (
            <button type="button" className="overview-btn" onClick={() => handleRandomMessage(true)}>
              Random from current results
            </button>
          )}
        </div>
        {viewedMessage && (
          <>
            <MessageCard message={viewedMessage} title={randomMessage && !selectedMessage ? 'Random message' : 'Message details'} />
            <div className="random-msg-nav">
              <button type="button" className="overview-btn random-msg-nav-btn" onClick={handlePrevMessage} disabled={!canPrev} aria-label="Previous message">
                ← Previous
              </button>
              <span className="random-msg-nav-position">
                {viewedIndex >= 0
                  ? `${viewedIndex + 1} of ${displayedResults.length}`
                  : randomMessageHistory.length > 1
                    ? `Random ${randomHistoryIndex + 1} of ${randomMessageHistory.length}`
                    : 'Random message'}
              </span>
              <button type="button" className="overview-btn random-msg-nav-btn" onClick={handleNextMessage} disabled={!canNext} aria-label="Next message">
                Next →
              </button>
            </div>
          </>
        )}
      </section>

      <label className="random-msg-toggle-ai">
        <input
          type="checkbox"
          checked={showAiOverview}
          onChange={(e) => setShowAiOverview(e.target.checked)}
          aria-label="Show AI overview section"
        />
        <span className="random-msg-toggle-ai-label">Show AI overview</span>
      </label>

      {showAiOverview && (
      <section className="panel overview-section overview-summary-dropdown random-msg-overview-section">
        <h3 className="panel-title">AI overview (based on current filters)</h3>
        <p className="random-msg-overview-desc">
          The summary is based on the messages that match your current filters (location, keyword, dates, min length). Use the filters below to focus on a different set of messages. {searchResults.length > 0 ? `${searchResults.length.toLocaleString()} message${searchResults.length !== 1 ? 's' : ''} currently match.` : 'No messages match — clear or adjust filters.'}
        </p>
        <div className="overview-ai-toolbar">
          <input
            type="password"
            className="overview-api-key-input"
            placeholder="OpenAI API key (optional)"
            value={apiKeyInput}
            onChange={(e) => setApiKeyInput(e.target.value)}
            aria-label="OpenAI API key"
          />
          <button type="button" className="overview-btn overview-btn-save" onClick={handleSaveApiKey}>Save</button>
          <button
            type="button"
            className="overview-btn overview-btn-ai"
            onClick={handleGenerateAISummary}
            disabled={!filteredSummarySource || filteredSummarySource.count === 0 || aiLoading}
          >
            {aiLoading ? 'Generating…' : 'Generate AI summary'}
          </button>
        </div>
        {aiError && <p className="overview-ai-error">{aiError}</p>}
        {aiSummary && (
          <div className="overview-summary-card overview-summary-ai">
            <h4 className="overview-summary-label">AI summary</h4>
            {(aiSummary.split(/\n\n+/).filter(Boolean).length >= 2 ? aiSummary.split(/\n\n+/) : [aiSummary]).map((para, i) => (
              <p key={i} className="overview-summary-para">{para.trim()}</p>
            ))}
          </div>
        )}
        {overviewParagraphs && (
          <div className="overview-summary-card">
            <h4 className="overview-summary-label overview-summary-label-local">Word-based summary (from your data, no API)</h4>
            <p className="overview-summary-para">{overviewParagraphs.para1}</p>
            <p className="overview-summary-para">{overviewParagraphs.para2}</p>
            <p className="overview-summary-para">{overviewParagraphs.para3}</p>
          </div>
        )}
      </section>
      )}

      <section className="random-message-section random-msg-filters">
        <div className="random-msg-filter-row">
          <label className="random-msg-label">
            <span className="random-msg-label-text">Location</span>
            <select
              className="random-msg-select"
              value={locationFilter}
              onChange={(e) => { setLocationFilter(e.target.value); setSelectedMessage(null); }}
              aria-label="Filter by channel or DM"
            >
              <option value="">All channels / DMs</option>
              {locationOptions.map((opt) => (
                <option key={opt.channelId} value={opt.channelId}>{opt.label}</option>
              ))}
            </select>
          </label>
          <label className="random-msg-label">
            <span className="random-msg-label-text">Keyword</span>
            <input
              type="text"
              className="random-msg-search-input"
              placeholder="Search message content…"
              value={searchKeyword}
              onChange={(e) => { setSearchKeyword(e.target.value); setSelectedMessage(null); }}
              aria-label="Search by keyword"
            />
          </label>
          <label className="random-msg-label">
            <span className="random-msg-label-text">After date</span>
            <input
              type="date"
              className="random-msg-date-input"
              value={afterDate}
              onChange={(e) => { setAfterDate(e.target.value); setSelectedMessage(null); }}
              aria-label="Messages after this date"
            />
          </label>
          <label className="random-msg-label">
            <span className="random-msg-label-text">Before date</span>
            <input
              type="date"
              className="random-msg-date-input"
              value={beforeDate}
              onChange={(e) => { setBeforeDate(e.target.value); setSelectedMessage(null); }}
              aria-label="Messages before this date"
            />
          </label>
          <label className="random-msg-label">
            <span className="random-msg-label-text">Min length (chars)</span>
            <input
              type="number"
              className="random-msg-length-input"
              placeholder="e.g. 100"
              min={1}
              value={minLength}
              onChange={(e) => { setMinLength(e.target.value); setSelectedMessage(null); }}
              aria-label="Minimum message length in characters"
            />
          </label>
        </div>
      </section>

      <p className="random-msg-result-count">
        {searchResults.length.toLocaleString()} message{searchResults.length !== 1 ? 's' : ''} {hasFilters ? 'match' : ''} (newest first)
        {hasMore && ` — showing first ${MAX_DISPLAY.toLocaleString()} of ${searchResults.length.toLocaleString()}. Use filters to narrow.`}
      </p>

      <div className="random-msg-list">
        {displayedResults.map((m, i) => (
          <MessageRow
            key={`${m.channelId}-${m.id}-${i}`}
            message={m}
            onSelect={setSelectedMessage}
            isSelected={selectedMessage === m}
          />
        ))}
      </div>
      {searchResults.length === 0 && (
        <p className="random-msg-muted">No messages match the current filters. Try changing keyword, dates, or min length.</p>
      )}
    </div>
  );
}
