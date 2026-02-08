import React, { useMemo, useState } from 'react';
import { parseLocalDate } from '../utils/dateUtils';
import './Overview.css';
import './Messages.css';
import './Insights.css';

/** Seeded RNG so the same seed = same sequence (stable), different seed = different. */
function createRng(seed) {
  let s = Math.floor(seed * 0xffffffff) >>> 0;
  if (s === 0) s = 1;
  return function () {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 1e9) / 1e9;
  };
}

function shuffle(arr, rng) {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function getAllMessages(byChannel) {
  if (!byChannel?.length) return [];
  return byChannel.flatMap((ch) => ch.messages ?? []);
}

/** Longest run of consecutive days that each have at least one message. */
function longestStreak(byDay) {
  if (!byDay?.length) return { length: 0, endDate: null };
  const sorted = [...byDay].sort((a, b) => a.date.localeCompare(b.date));
  let best = 0;
  let current = 0;
  let prev = null;
  let endDate = null;
  for (const { date, count } of sorted) {
    const has = (count ?? 0) > 0;
    if (has) {
      const isConsecutive = prev != null && daysDiff(prev, date) === 1;
      current = isConsecutive ? current + 1 : 1;
      if (current >= best) {
        best = current;
        endDate = date;
      }
      prev = date;
    } else {
      current = 0;
    }
  }
  return { length: best, endDate };
}

function daysDiff(a, b) {
  const d1 = parseLocalDate(a).getTime();
  const d2 = parseLocalDate(b).getTime();
  return Math.round((d2 - d1) / (24 * 60 * 60 * 1000));
}

function formatDate(ts) {
  if (!ts) return '—';
  const d = ts instanceof Date ? ts : new Date(ts);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { dateStyle: 'medium' });
}

export default function Insights({ data }) {
  const insights = useMemo(() => {
    if (!data?.stats) return null;
    const s = data.stats;
    const byChannel = s.byChannel ?? [];
    const allMessages = getAllMessages(byChannel);

    let longest = null;
    for (const m of allMessages) {
      const len = (m.contents && String(m.contents).length) || 0;
      if (len > 0 && (!longest || len > longest.length)) {
        longest = { length: len, contents: m.contents, timestamp: m.timestamp };
      }
    }

    const byDay = s.byDay ?? [];
    const busiest = byDay.length
      ? byDay.reduce((best, d) => ((d.count ?? 0) > (best.count ?? 0) ? d : best), byDay[0])
      : null;

    const streak = longestStreak(byDay);

    const byHour = s.byHour ?? [];
    const byDayOfWeek = s.byDayOfWeek ?? [];
    const topChannel = byChannel[0];
    const topWord = (s.topWords ?? [])[0];
    const dayCount = byDay.length
      ? Math.max(1, daysDiff(byDay[0].date, byDay[byDay.length - 1].date) + 1)
      : 0;
    const messagesPerDay = dayCount > 0 && s.totalMessages ? (s.totalMessages / dayCount).toFixed(1) : null;
    const peakHourEntry = byHour.length
      ? byHour.reduce((best, h) => ((h.count ?? 0) > (best.count ?? 0) ? h : best), byHour[0])
      : null;
    const peakDayEntry = byDayOfWeek.length
      ? byDayOfWeek.reduce((best, d) => ((d.count ?? 0) > (best.count ?? 0) ? d : best), byDayOfWeek[0])
      : null;
    const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const peakDayName = peakDayEntry != null ? DAY_NAMES[Number(peakDayEntry.day)] : null;
    const peakHour = peakHourEntry != null ? Number(peakHourEntry.hour) : null;
    const totalWords = s.totalWords ?? 0;
    const secondChannel = byChannel[1];
    const secondWord = (s.topWords ?? [])[1];
    const busiestCount = busiest?.count ?? 0;
    const busiestDate = busiest?.date ?? null;
    const streakLen = streak?.length ?? 0;

    return {
      longestMessage: longest,
      busiestDay: busiest,
      firstMessageAt: s.firstMessageAt,
      lastMessageAt: s.lastMessageAt,
      streak,
      topWords: (s.topWords ?? []).slice(0, 15),
      totalMessages: s.totalMessages,
      funFacts: {
        messagesPerDay,
        peakHour,
        peakDayName,
        topChannel,
        topWord,
        secondChannel,
        secondWord,
        channelCount: byChannel.length,
        totalWords,
        avgWordsPerMessage: s.avgWordsPerMessage,
        totalMessages: s.totalMessages,
        busiestCount,
        busiestDate,
        streakLen,
        longestLength: longest?.length,
      },
    };
  }, [data]);

  const [factRoll, setFactRoll] = useState(() => Math.random());

  if (!data?.stats) return <div className="panel">No data loaded.</div>;
  if (!insights) return null;

  const { longestMessage, busiestDay, firstMessageAt, lastMessageAt, streak, topWords, funFacts } = insights;
  const excerpt = longestMessage?.contents
    ? String(longestMessage.contents).slice(0, 120) + (longestMessage.contents.length > 120 ? '…' : '')
    : '';

  const facts = useMemo(() => {
    if (!funFacts) return [];
    const f = funFacts;
    const rng = createRng(factRoll);
    const icons = ['📊', '📅', '🕐', '💬', '✨', '📝', '🌐', '📏', '🔥', '🎯', '⚡', '🌈', '🧩', '🎲', '💡', '🪄'];
    const pool = [];

    if (f.messagesPerDay != null) {
      const msgs = [
        `You sent ~${f.messagesPerDay} messages per day on average.`,
        `That's roughly ${f.messagesPerDay} messages a day.`,
        `Daily average: ${f.messagesPerDay} messages.`,
        `You averaged ${f.messagesPerDay} messages per day.`,
        `Roughly ${f.messagesPerDay} messages per day.`,
      ];
      msgs.forEach((text) => pool.push({ category: 'daily', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.peakDayName) {
      const day = [
        `You're a ${f.peakDayName} person — that's when you're most active.`,
        `${f.peakDayName}s are your day. Peak activity.`,
        `Your vibe: ${f.peakDayName}.`,
        `Most active on ${f.peakDayName}s.`,
        `${f.peakDayName} hits different for you.`,
      ];
      day.forEach((text) => pool.push({ category: 'weekday', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.peakHour != null) {
      const hour12 = f.peakHour % 12 || 12;
      const ampm = f.peakHour < 12 ? 'am' : 'pm';
      const vibe = f.peakHour >= 22 || f.peakHour <= 4 ? 'Night owl' : f.peakHour <= 10 ? 'Early bird' : 'Afternoon chatter';
      const hour = [
        `Peak hour: ${hour12}${ampm}. ${vibe} energy.`,
        `You're most active around ${hour12}${ampm}. ${vibe} vibes.`,
        `Your power hour: ${hour12}${ampm}. Definitely ${vibe.toLowerCase()} energy.`,
        `${hour12}${ampm} = peak Discord time. ${vibe}.`,
        `The ${hour12}${ampm} hour is yours. ${vibe}.`,
      ];
      hour.forEach((text) => pool.push({ category: 'hour', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.topChannel?.channelName) {
      const name = f.topChannel.channelName;
      const server = f.topChannel.guildName ? ` (${f.topChannel.guildName})` : '';
      const count = (f.topChannel.count ?? 0).toLocaleString();
      [
        `Your favorite place: ${name}${server} — ${count} messages.`,
        `You love ${name}${server}. ${count} messages and counting.`,
        `Top channel: ${name}${server}. ${count} messages.`,
        `Most messages in ${name}${server}. That's ${count} messages.`,
        `${name}${server} is where you live. ${count} messages.`,
      ].forEach((text) => pool.push({ category: 'topCh', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.secondChannel?.channelName) {
      const name = f.secondChannel.channelName;
      const count = (f.secondChannel.count ?? 0).toLocaleString();
      [
        `Second favorite: ${name} with ${count} messages.`,
        `Runner-up channel: ${name} — ${count} messages.`,
        `You also love ${name}. ${count} messages there.`,
      ].forEach((text) => pool.push({ category: 'secondCh', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.topWord?.[0]) {
      const [word, count] = f.topWord;
      const c = count.toLocaleString();
      const plural = count !== 1 ? 's' : '';
      [
        `You said "${word}" ${c} time${plural}.`,
        `Your most-used word: "${word}" (${c} time${plural}).`,
        `"${word}" appears ${c} time${plural} in your messages.`,
        `You really like saying "${word}". ${c} time${plural}.`,
        `"${word}" — ${c} time${plural}. No judgment.`,
      ].forEach((text) => pool.push({ category: 'topWord', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.secondWord?.[0]) {
      const [word, count] = f.secondWord;
      [
        `Second favorite word: "${word}" — ${count.toLocaleString()} times.`,
        `You also love "${word}". ${count.toLocaleString()} times.`,
      ].forEach((text) => pool.push({ category: 'secondWord', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.totalWords > 0) {
      const novels = Math.floor(f.totalWords / 80000);
      const w = f.totalWords.toLocaleString();
      const novelLine = novels >= 1 ? ` That's like ${novels} novel${novels !== 1 ? 's' : ''}!` : '';
      [
        `${w} words total.${novelLine}`,
        `You've typed ${w} words in this export.${novelLine}`,
        `${w} words.${novelLine}`,
      ].forEach((text) => pool.push({ category: 'words', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.channelCount > 0) {
      const n = f.channelCount;
      [
        `You've been active in ${n} channel${n !== 1 ? 's' : ''}.`,
        `${n} channel${n !== 1 ? 's' : ''} with your messages.`,
        `Your messages span ${n} channel${n !== 1 ? 's' : ''}.`,
        `You hang out in ${n} channel${n !== 1 ? 's' : ''}.`,
      ].forEach((text) => pool.push({ category: 'channels', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.avgWordsPerMessage != null && f.avgWordsPerMessage > 0) {
      const a = f.avgWordsPerMessage;
      [
        `Average message: ${a} word${a !== 1 ? 's' : ''}.`,
        `You typically write ${a} word${a !== 1 ? 's' : ''} per message.`,
        `${a} word${a !== 1 ? 's' : ''} per message on average.`,
      ].forEach((text) => pool.push({ category: 'avgLen', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.busiestCount > 0) {
      const d = f.busiestDate || 'one day';
      [
        `Your busiest day had ${f.busiestCount.toLocaleString()} messages.`,
        `Peak day: ${f.busiestCount.toLocaleString()} messages on ${d}.`,
        `One day you sent ${f.busiestCount.toLocaleString()} messages. Legend.`,
      ].forEach((text) => pool.push({ category: 'busyDay', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.streakLen > 0) {
      [
        `You had a ${f.streakLen}-day streak of at least one message.`,
        `Longest streak: ${f.streakLen} consecutive day${f.streakLen !== 1 ? 's' : ''} with messages.`,
        `${f.streakLen} day${f.streakLen !== 1 ? 's' : ''} in a row with at least one message.`,
      ].forEach((text) => pool.push({ category: 'streak', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.longestLength > 0) {
      [
        `Your longest message was ${f.longestLength.toLocaleString()} characters.`,
        `One message had ${f.longestLength.toLocaleString()} characters. That's commitment.`,
        `${f.longestLength.toLocaleString()} characters in a single message. Wow.`,
      ].forEach((text) => pool.push({ category: 'longest', icon: icons[Math.floor(rng() * icons.length)], text }));
    }
    if (f.totalMessages > 0) {
      [
        `${f.totalMessages.toLocaleString()} messages in this export.`,
        `Total: ${f.totalMessages.toLocaleString()} messages.`,
        `You sent ${f.totalMessages.toLocaleString()} messages in this export.`,
      ].forEach((text) => pool.push({ category: 'total', icon: icons[Math.floor(rng() * icons.length)], text }));
    }

    if (pool.length === 0) return [];

    const categories = [...new Set(pool.map((x) => x.category))];
    const shuffledCats = shuffle(categories, rng);
    const howMany = 4 + Math.floor(rng() * 4);
    const pickedCats = shuffledCats.slice(0, Math.min(howMany, categories.length));

    const selected = [];
    for (const cat of pickedCats) {
      const inCat = pool.filter((x) => x.category === cat);
      const one = inCat[Math.floor(rng() * inCat.length)];
      selected.push(one);
    }
    return shuffle(selected, rng);
  }, [insights?.funFacts, factRoll]);

  return (
    <div className="overview-view">
      <h2 className="view-heading">Insights</h2>

      {facts.length > 0 && (
        <div className="panel insights-fun-facts">
          <div className="insights-fun-facts-header">
            <h3 className="panel-title">Fun facts</h3>
            <button
              type="button"
              className="insights-shuffle-btn"
              onClick={() => setFactRoll(Math.random())}
            >
              New facts
            </button>
          </div>
          <div className="insights-facts-grid">
            {facts.map((f, i) => (
              <div key={`${factRoll}-${i}-${f.text.slice(0, 20)}`} className="insights-fact-card">
                <span className="insights-fact-icon" aria-hidden>{f.icon}</span>
                <span className="insights-fact-text">{f.text}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="panel">
        <h3 className="panel-title">Highlights</h3>
        <ul className="insights-list">
          {firstMessageAt && (
            <li>
              <strong>First message</strong> in this export: {formatDate(firstMessageAt)}
            </li>
          )}
          {lastMessageAt && (
            <li>
              <strong>Last message</strong> in this export: {formatDate(lastMessageAt)}
            </li>
          )}
          {busiestDay && (
            <li>
              <strong>Busiest day</strong>: {busiestDay.date} with {(busiestDay.count ?? 0).toLocaleString()} messages
            </li>
          )}
          {streak.length > 0 && (
            <li>
              <strong>Longest streak</strong>: {streak.length} consecutive day{streak.length !== 1 ? 's' : ''} with at least one message
              {streak.endDate && ` (ending ${streak.endDate})`}
            </li>
          )}
          {longestMessage && (
            <li>
              <strong>Longest message</strong>: {longestMessage.length.toLocaleString()} characters
              {excerpt && (
                <blockquote className="insights-excerpt" title={longestMessage.contents}>
                  {excerpt}
                </blockquote>
              )}
            </li>
          )}
        </ul>
      </div>

      {topWords.length > 0 && (
        <div className="panel">
          <h3 className="panel-title">Your top words</h3>
          <p className="insights-muted">Most used words (excluding common stopwords)</p>
          <div className="top-words insights-top-words">
            {topWords.map(([word, count], i) => (
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
