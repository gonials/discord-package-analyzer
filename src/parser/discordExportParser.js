/**
 * Parses Discord data export (ZIP or folder).
 * Discord export structure (from support docs):
 * - messages/ : folders named by Channel ID; each has channel metadata JSON + messages transcript JSON
 *   - Message fields: ID, Timestamp, Contents, Attachments
 *   - Channel metadata: Guild ID, Channel ID, Channel Name (or User IDs for DMs)
 * - activity/, account/, servers/ : optional JSON data
 */

import JSZip from 'jszip';
import { getLocalDateKey } from '../utils/dateUtils';

const CHANNEL_META_NAMES = ['channel.json', 'metadata.json'];
const MESSAGE_FILE_NAMES = ['messages.json', 'channel.json']; // some exports use channel.json for messages

/** Shift all timestamps by this many hours (export times were 5h late; subtract 5 to correct). */
const TZ_OFFSET_HOURS = -5;
const TZ_OFFSET_MS = TZ_OFFSET_HOURS * 60 * 60 * 1000;

function normalizeMessage(msg) {
  const id = msg.ID ?? msg.id;
  const ts = msg.Timestamp ?? msg.timestamp ?? msg.date;
  const contents = msg.Contents ?? msg.content ?? msg.contents ?? '';
  const attachments = msg.Attachments ?? msg.attachments ?? [];
  const arr = Array.isArray(attachments) ? attachments : (attachments ? [attachments] : []);
  const rawDate = ts ? new Date(ts) : null;
  const timestamp = rawDate && !isNaN(rawDate.getTime()) ? new Date(rawDate.getTime() + TZ_OFFSET_MS) : null;
  return {
    id,
    timestamp,
    contents: String(contents ?? ''),
    attachments: arr,
    channelId: null,
    guildId: null,
    channelName: null,
    guildName: null,
  };
}

function isMessageArray(data) {
  if (!Array.isArray(data) || data.length === 0) return false;
  const first = data[0];
  if (!first || typeof first !== 'object') return false;
  const hasContent = 'Contents' in first || 'content' in first || 'contents' in first;
  const hasTime = 'Timestamp' in first || 'timestamp' in first || 'date' in first;
  return hasContent || hasTime;
}

function isChannelMeta(data) {
  if (!data || typeof data !== 'object') return false;
  return (
    'Channel ID' in data ||
    'channel_id' in data ||
    'Channel Id' in data ||
    'channelId' in data ||
    ('Guild ID' in data && 'Channel Name' in data) ||
    ('Guild ID' in data && 'channel_name' in data) ||
    ('User IDs' in data && ('Channel ID' in data || 'channel_id' in data))
  );
}

function normalizeChannelMeta(data) {
  const recipients = data.Recipients ?? data.recipients ?? data['User IDs'];
  const firstRecipient = Array.isArray(recipients) ? recipients[0] : typeof recipients === 'object' ? recipients : null;
  const channelId = data['Channel ID'] ?? data.channel_id ?? data.ChannelId ?? data.channelId ?? null;
  const dmName = data.Name ?? data.name ?? data.display_name ?? (firstRecipient && (firstRecipient.username ?? firstRecipient.name ?? firstRecipient.global_name));
  const avatarUrl = data.icon_url ?? data.avatar ?? data.avatar_url ?? (firstRecipient && (firstRecipient.avatar ?? firstRecipient.avatar_url));
  const avatarFull =
    avatarUrl &&
    (avatarUrl.startsWith('http')
      ? avatarUrl
      : channelId
        ? `https://cdn.discordapp.com/avatars/${channelId}/${avatarUrl}.png`
        : null);
  return {
    guildId: data['Guild ID'] ?? data.guild_id ?? data.GuildId ?? null,
    channelId,
    channelName: data['Channel Name'] ?? data.channel_name ?? data.ChannelName ?? dmName ?? 'Unknown',
    guildName: data['Guild Name'] ?? data.guild_name ?? data.GuildName ?? null,
    userIds: data['User IDs'] ?? data.user_ids ?? null,
    avatarUrl: avatarFull || null,
    recipients: Array.isArray(recipients) ? recipients : firstRecipient ? [firstRecipient] : null,
  };
}

function looksLikeId(str) {
  if (str == null || typeof str !== 'string') return false;
  const s = str.trim();
  return /^[c~]?\d{15,}$/.test(s) || (s.length > 16 && /^\d+$/.test(s));
}

/**
 * Parse ZIP file (Discord export).
 * @param {File} zipFile
 * @param {{ onProgress?: (percent: number, message: string) => void }} options
 * @returns {Promise<{ messages: any[], channels: any[], guilds: any[], activity: any, account: any }>}
 */
export async function parseZip(zipFile, options = {}) {
  const { onProgress } = options;
  const report = (p, msg) => { try { onProgress?.(p, msg); } catch (_) {} };

  report(0, 'Opening ZIP…');
  const zip = await JSZip.loadAsync(zipFile);
  const files = [];
  zip.forEach((path, entry) => {
    if (!entry.dir) files.push({ path, entry });
  });
  report(5, 'Scanning files…');

  const readText = async (entry) => {
    const blob = await entry.async('blob');
    return await new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(blob);
    });
  };

  const result = {
    messages: [],
    channels: [],
    channelMetaByPath: {},
    channelIdToName: {},
    guilds: new Map(),
    activity: null,
    account: null,
  };

  const messageFiles = [];
  const metaFiles = [];

  for (const { path } of files) {
    const lower = path.toLowerCase();
    if (!lower.endsWith('.json')) continue;
    const parts = path.split('/');
    if (parts[0] === 'messages' && parts.length >= 3) {
      const channelPath = parts.slice(0, -1).join('/');
      const name = parts[parts.length - 1];
      const isMetaName = CHANNEL_META_NAMES.some((n) => name.toLowerCase() === n.toLowerCase());
      if (isMetaName) {
        metaFiles.push({ path, channelPath });
      }
      messageFiles.push({ path, channelPath });
    }
  }
  debug('parseZip: metaFiles', metaFiles.length, 'messageFiles', messageFiles.length);

  for (const { path, channelPath } of metaFiles) {
    try {
      const entry = zip.file(path);
      if (!entry) continue;
      const text = await readText(entry);
      const data = JSON.parse(text);
      if (isChannelMeta(data)) {
        const meta = normalizeChannelMeta(data);
        result.channelMetaByPath[channelPath] = meta;
        result.channels.push({ ...meta, path: channelPath });
        if (meta.guildId && meta.guildName) {
          result.guilds.set(meta.guildId, { id: meta.guildId, name: meta.guildName });
        }
        if (!meta.guildId && meta.channelId && meta.channelName && !looksLikeId(meta.channelName) && meta.channelName !== 'Unknown') {
          result.channelIdToName[meta.channelId] = meta.channelName;
          const pathId = channelPath.split('/').pop();
          if (pathId && pathId !== meta.channelId) result.channelIdToName[pathId] = meta.channelName;
        }
      }
    } catch (_) {}
  }
  report(10, 'Reading messages…');

  const totalMsgFiles = messageFiles.length;
  for (let i = 0; i < messageFiles.length; i++) {
    const { path, channelPath } = messageFiles[i];
    try {
      const entry = zip.file(path);
      if (!entry) continue;
      const text = await readText(entry);
      const data = JSON.parse(text);
      if (!isMessageArray(data)) continue;
      const meta = result.channelMetaByPath[channelPath] || {};
      for (const msg of data) {
        const m = normalizeMessage(msg);
        m.channelId = meta.channelId ?? channelPath.split('/').pop();
        m.guildId = meta.guildId;
        if (!meta.guildId) {
          m.channelName = (meta.channelName && !looksLikeId(meta.channelName)) ? meta.channelName : (result.channelIdToName[meta.channelId ?? m.channelId] ?? null);
        } else {
          m.channelName = meta.channelName ?? m.channelId;
        }
        m.guildName = meta.guildName;
        m.avatarUrl = meta.avatarUrl ?? null;
        result.messages.push(m);
      }
      if ((i + 1) % 5 === 0 || i === messageFiles.length - 1) {
        report(10 + Math.floor((70 * (i + 1)) / totalMsgFiles), 'Reading messages…');
      }
    } catch (_) {}
  }
  report(80, 'Building stats…');

  for (const { path } of files) {
    if (path.startsWith('account/') && path.toLowerCase().endsWith('.json')) {
      try {
        const entry = zip.file(path);
        if (entry) {
          const text = await readText(entry);
          result.account = JSON.parse(text);
        }
        break;
      } catch (_) {}
    }
  }

  const indexFile = files.find((f) => {
    const p = f.path.replace(/\\/g, '/').toLowerCase();
    return p === 'messages/index.json' || p.endsWith('/messages/index.json');
  });
  if (indexFile) {
    try {
      const entry = zip.file(indexFile.path);
      if (entry) {
        const text = await readText(entry);
        const indexData = JSON.parse(text);
        function setIndexName(id, name) {
          if (id && name != null) result.channelIdToName[String(id)] = String(name);
        }
        if (Array.isArray(indexData)) {
          indexData.forEach((c) => setIndexName(c.id ?? c.channel_id ?? c.channelId, c.name ?? c.channel_name ?? c.channelName));
        } else if (indexData.channels && Array.isArray(indexData.channels)) {
          indexData.channels.forEach((c) => setIndexName(c.id ?? c.channel_id ?? c.channelId, c.name ?? c.channel_name ?? c.channelName));
        } else if (typeof indexData === 'object') {
          Object.entries(indexData).forEach(([id, v]) => { result.channelIdToName[id] = typeof v === 'string' ? v : (v?.name ?? v?.channel_name ?? v?.channelName ?? id); });
        }
      }
    } catch (_) {}
  }

  result.guilds = Array.from(result.guilds.values());
  report(95, 'Finalizing…');
  return buildSummary(result);
}

/**
 * Build summary stats from raw parse result.
 */
function buildSummary(result) {
  const messages = result.messages.filter((m) => m.timestamp && !isNaN(m.timestamp.getTime()));
  const byChannel = new Map();
  const byGuild = new Map();
  const byDay = new Map();
  const byHour = new Map(Array.from({ length: 24 }, (_, i) => [i, 0]));
  const byDayOfWeek = new Map(Array.from({ length: 7 }, (_, i) => [i, 0]));
  let totalWords = 0;
  const wordCounts = new Map();
  const STOPWORDS = new Set(['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'it', 'i', 'you', 'we', 'they', 'this', 'that', 'be', 'are', 'was', 'were', 'been', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'can', 'if', 'as', 'so', 'my', 'me', 'your', 'he', 'she', 'his', 'her', 'its', 'just', 'not', 'no', 'yes', 'oh', 'um', 'uh', 'im', 'dont', 'cant', 'wont', 'thats', 'what', 'when', 'where', 'who', 'how', 'why', 'all', 'each', 'every', 'some', 'any', 'from', 'up', 'out', 'about', 'into', 'over', 'after', 'before', 'between', 'through', 'during', 'above', 'below', 'more', 'most', 'other', 'than', 'then', 'them', 'these', 'those', 'here', 'there']);

  function tokenize(text) {
    return text
      .toLowerCase()
      .replace(/[\s\u200b-\u200d\ufeff]+/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length > 1);
  }

  let firstTs = null;
  let lastTs = null;
  let attachmentCount = 0;

  for (const m of messages) {
    const ts = m.timestamp;
    if (ts) {
      if (!firstTs || ts < firstTs) firstTs = ts;
      if (!lastTs || ts > lastTs) lastTs = ts;
    }
    const key = m.channelId ?? 'dm';
    const idFromIndex =
      result.channelIdToName?.[key] ??
      (key && result.channelIdToName?.[key.replace(/^\D+/, '')]);
    let displayName = idFromIndex ?? m.channelName;
    if (!m.guildId && displayName && looksLikeId(displayName)) displayName = null;
    if (!byChannel.has(key)) {
      byChannel.set(key, {
        channelId: key,
        channelName: displayName,
        guildId: m.guildId,
        guildName: m.guildName,
        avatarUrl: m.avatarUrl ?? null,
        count: 0,
        messages: [],
      });
    }
    const ch = byChannel.get(key);
    ch.count += 1;
    ch.messages.push(m);
    if (m.avatarUrl && !ch.avatarUrl) ch.avatarUrl = m.avatarUrl;

    if (m.guildId) {
      if (!byGuild.has(m.guildId)) {
        byGuild.set(m.guildId, { guildId: m.guildId, guildName: m.guildName || m.guildId, count: 0 });
      }
      byGuild.get(m.guildId).count += 1;
    }

    const dayKey = ts ? getLocalDateKey(ts) : '';
    if (dayKey) byDay.set(dayKey, (byDay.get(dayKey) || 0) + 1);
    if (ts) {
      byHour.set(ts.getHours(), (byHour.get(ts.getHours()) || 0) + 1);
      byDayOfWeek.set(ts.getDay(), (byDayOfWeek.get(ts.getDay()) || 0) + 1);
    }

    const words = tokenize(m.contents);
    totalWords += words.length;
    for (const w of words) {
      if (STOPWORDS.has(w)) continue;
      wordCounts.set(w, (wordCounts.get(w) || 0) + 1);
    }
    const customEmojis = (m.contents || '').match(/:[\w~]+:/g);
    if (customEmojis) {
      for (const e of customEmojis) {
        const key = e.toLowerCase();
        wordCounts.set(key, (wordCounts.get(key) || 0) + 1);
      }
    }
    attachmentCount += (m.attachments && m.attachments.length) ? m.attachments.length : 0;
  }

  const sortedWords = [...wordCounts.entries()].sort((a, b) => b[1] - a[1]).filter(([w]) => !/^:[\w~]+:$/.test(w)).slice(0, 100);
  const topEmojis = [...wordCounts.entries()].filter(([w]) => /^:[\w~]+:$/.test(w)).sort((a, b) => b[1] - a[1]).slice(0, 24);

  for (const ch of byChannel.values()) {
    const chWordCounts = new Map();
    for (const m of ch.messages) {
      for (const w of tokenize(m.contents)) {
        if (STOPWORDS.has(w)) continue;
        chWordCounts.set(w, (chWordCounts.get(w) || 0) + 1);
      }
    }
    ch.topWords = [...chWordCounts.entries()].sort((a, b) => b[1] - a[1]).filter(([w]) => !/^:[\w~]+:$/.test(w)).slice(0, 30);
    const firstMsg = ch.messages.find((m) => m.timestamp && !isNaN(m.timestamp.getTime()));
    const lastMsg = [...ch.messages].reverse().find((m) => m.timestamp && !isNaN(m.timestamp.getTime()));
    ch.firstMessageAt = firstMsg?.timestamp ?? null;
    ch.lastMessageAt = lastMsg?.timestamp ?? null;
  }

  return {
    messages,
    channels: result.channels,
    guilds: result.guilds,
    account: result.account,
    activity: result.activity,
    stats: {
      totalMessages: messages.length,
      totalWords,
      avgWordsPerMessage: messages.length ? Math.round(totalWords / messages.length) : 0,
      attachmentCount,
      firstMessageAt: firstTs,
      lastMessageAt: lastTs,
      byChannel: Array.from(byChannel.values()).sort((a, b) => b.count - a.count),
      byGuild: Array.from(byGuild.values()).sort((a, b) => b.count - a.count),
      byDay: Array.from(byDay.entries()).sort((a, b) => a[0].localeCompare(b[0])).map(([date, count]) => ({ date, count })),
      byHour: Array.from(byHour.entries()).sort((a, b) => a[0] - b[0]).map(([hour, count]) => ({ hour, count })),
      byDayOfWeek: Array.from(byDayOfWeek.entries()).sort((a, b) => a[0] - b[0]).map(([day, count]) => ({ day, count })),
      topWords: sortedWords,
      topEmojis,
    },
  };
}

const DEBUG = true;
function debug(...args) {
  if (DEBUG) console.log('[Discord Analyzer]', ...args);
}
function debugError(...args) {
  if (DEBUG) console.error('[Discord Analyzer]', ...args);
}

/**
 * Normalize input: accept File[] (with webkitRelativePath) or { file, path }[].
 * Returns array of { file, path }.
 */
function normalizeFileList(fileList) {
  const out = [];
  const raw = Array.isArray(fileList) ? fileList : Array.from(fileList);
  for (const item of raw) {
    if (item && typeof item.getFile === 'function') {
      debugError('parseFileList: item looks like a handle; pass files or { file, path }');
      continue;
    }
    if (item && item.file != null && typeof item.path === 'string') {
      out.push({ file: item.file, path: item.path });
    } else if (item && item instanceof File) {
      const path = item.webkitRelativePath || item.name || '';
      out.push({ file: item, path });
    } else {
      debug('parseFileList: skipping unknown item', item);
    }
  }
  return out;
}

/**
 * Parse from a list of files (e.g. from folder input or drag-drop with webkitRelativePath).
 * Accepts: File[] (with webkitRelativePath set by browser) or { file: File, path: string }[].
 * Expects file paths like "messages/CHANNEL_ID/messages.json" or "messages/CHANNEL_ID/channel.json".
 * @param {Array} fileList
 * @param {{ onProgress?: (percent: number, message: string) => void }} options
 */
export async function parseFileList(fileList, options = {}) {
  const { onProgress } = options;
  const report = (p, msg) => { try { onProgress?.(p, msg); } catch (_) {} };

  debug('parseFileList: input length', Array.isArray(fileList) ? fileList.length : fileList?.length);
  report(0, 'Reading files…');
  const normalized = normalizeFileList(fileList);
  debug('parseFileList: normalized length', normalized.length);

  const result = {
    messages: [],
    channels: [],
    channelMetaByPath: {},
    guilds: new Map(),
    channelIdToName: {},
  };

  const metaFiles = [];
  const messageCandidates = [];

  for (const { file, path } of normalized) {
    const p = path.replace(/\\/g, '/').replace(/^\/+/, '');
    if (!p.toLowerCase().endsWith('.json')) continue;
    const parts = p.split('/').filter(Boolean);
    const name = parts[parts.length - 1] || '';
    let channelPath = null;
    if (parts.length >= 3 && parts[0].toLowerCase() === 'messages') {
      channelPath = parts.slice(0, -1).join('/');
    } else if (p.toLowerCase().includes('messages/') && parts.length >= 2) {
      const i = p.toLowerCase().indexOf('messages/');
      const fromMessages = p.slice(i);
      const segs = fromMessages.split('/').filter(Boolean);
      if (segs.length >= 2) channelPath = segs.slice(0, -1).join('/');
    } else if (parts.length === 2) {
      channelPath = parts[0];
    }
    if (!channelPath) continue;
    if (CHANNEL_META_NAMES.some((n) => name.toLowerCase() === n.toLowerCase())) {
      metaFiles.push({ path: p, channelPath, file });
    }
    messageCandidates.push({ path: p, channelPath, file });
  }

  if (messageCandidates.length === 0) {
    for (const { file, path } of normalized) {
      const p = path.replace(/\\/g, '/').replace(/^\/+/, '');
      const parts = p.split('/').filter(Boolean);
      const name = parts[parts.length - 1] || '';
      if (name.toLowerCase() !== 'messages.json') continue;
      const channelPath = parts.length >= 2 ? parts.slice(0, -1).join('/') : (parts[0] || 'unknown');
      messageCandidates.push({ path: p, channelPath, file });
    }
    debug('parseFileList: fallback (any file named messages.json):', messageCandidates.length, 'candidates');
  }

  const readFile = (file) =>
    new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = reject;
      r.readAsText(file);
    });

  const totalMeta = metaFiles.length;
  for (let mi = 0; mi < metaFiles.length; mi++) {
    const { channelPath, file } = metaFiles[mi];
    try {
      const text = await readFile(file);
      const data = JSON.parse(text);
      if (isChannelMeta(data)) {
        const meta = normalizeChannelMeta(data);
        result.channelMetaByPath[channelPath] = meta;
        if (meta.channelId) result.channelMetaByPath[meta.channelId] = meta;
        const lastSegment = channelPath.split('/').pop();
        if (lastSegment && lastSegment !== channelPath) result.channelMetaByPath[lastSegment] = meta;
        result.channels.push({ ...meta, path: channelPath });
        if (meta.guildId && meta.guildName) {
          result.guilds.set(meta.guildId, { id: meta.guildId, name: meta.guildName });
        }
        if (!meta.guildId && meta.channelId && meta.channelName && !looksLikeId(meta.channelName) && meta.channelName !== 'Unknown') {
          result.channelIdToName[meta.channelId] = meta.channelName;
          const pathId = channelPath.split('/').pop();
          if (pathId && pathId !== meta.channelId) result.channelIdToName[pathId] = meta.channelName;
        }
      }
      if (totalMeta > 0 && (mi + 1) % 5 === 0) report(Math.min(5, (5 * (mi + 1)) / totalMeta), 'Reading metadata…');
    } catch (e) {
      debugError('parseFileList: meta parse failed', channelPath, e?.message);
    }
  }
  report(5, 'Reading messages…');

  function getMeta(channelPath) {
    const last = channelPath.split('/').pop();
    return (
      result.channelMetaByPath[channelPath] ||
      result.channelMetaByPath[last] ||
      (last ? result.channelMetaByPath['messages/' + last] : null)
    ) || {};
  }

  const totalMsg = messageCandidates.length;
  for (let mi = 0; mi < messageCandidates.length; mi++) {
    const { path, channelPath, file } = messageCandidates[mi];
    try {
      const text = await readFile(file);
      const data = JSON.parse(text);
      if (!isMessageArray(data)) continue;
      const meta = getMeta(channelPath);
      for (const msg of data) {
        const m = normalizeMessage(msg);
        m.channelId = meta.channelId ?? channelPath.split('/').pop();
        m.guildId = meta.guildId;
        if (!meta.guildId) {
          m.channelName = (meta.channelName && !looksLikeId(meta.channelName)) ? meta.channelName : (result.channelIdToName[meta.channelId ?? m.channelId] ?? null);
        } else {
          m.channelName = meta.channelName ?? m.channelId;
        }
        m.guildName = meta.guildName;
        m.avatarUrl = meta.avatarUrl ?? null;
        result.messages.push(m);
      }
      if (totalMsg > 0 && (mi + 1) % 10 === 0) report(5 + Math.floor((80 * (mi + 1)) / totalMsg), 'Reading messages…');
    } catch (e) {
      debugError('parseFileList: message parse failed', path, e?.message);
    }
  }
  report(85, 'Building stats…');
  const accountFile = normalized.find(({ path }) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    return p.startsWith('account/') && p.endsWith('.json');
  });
  if (accountFile) {
    try {
      const text = await readFile(accountFile.file);
      result.account = JSON.parse(text);
    } catch (_) {}
  }

  const indexFile = normalized.find(({ path }) => {
    const p = path.replace(/\\/g, '/').toLowerCase();
    return p === 'messages/index.json' || p.endsWith('/messages/index.json') || p === 'index.json';
  });
  if (indexFile) {
    try {
      const text = await readFile(indexFile.file);
      const indexData = JSON.parse(text);
      function setIndexName(id, name) {
        if (id && name != null) result.channelIdToName[String(id)] = String(name);
      }
      if (Array.isArray(indexData)) {
        indexData.forEach((c) => {
          setIndexName(c.id ?? c.channel_id ?? c.channelId, c.name ?? c.channel_name ?? c.channelName);
        });
      } else if (indexData.channels && Array.isArray(indexData.channels)) {
        indexData.channels.forEach((c) => {
          setIndexName(c.id ?? c.channel_id ?? c.channelId, c.name ?? c.channel_name ?? c.channelName);
        });
      } else if (typeof indexData === 'object') {
        Object.entries(indexData).forEach(([id, v]) => {
          result.channelIdToName[id] = typeof v === 'string' ? v : (v?.name ?? v?.channel_name ?? v?.channelName ?? id);
        });
      }
    } catch (_) {}
  }

  result.guilds = Array.from(result.guilds.values());
  return buildSummary(result);
}

/**
 * Parse from FileSystemDirectoryHandle (e.g. from showDirectoryPicker).
 * Passes { file, path }[] to parseFileList so we never mutate File.webkitRelativePath (read-only).
 */
export async function parseDirectoryHandle(dirHandle, basePath = '', options = {}) {
  debug('parseDirectoryHandle: starting');
  const fileList = [];
  await collectFiles(dirHandle, basePath, fileList);
  debug('parseDirectoryHandle: collected', fileList.length, 'files');
  return parseFileList(fileList, options);
}

async function collectFiles(dirHandle, basePath, out) {
  for await (const entry of dirHandle.entries()) {
    const [key, handle] = Array.isArray(entry) ? entry : [undefined, entry];
    const name = (handle && handle.name) || (typeof key === 'string' ? key : '');
    const path = name ? (basePath ? `${basePath}/${name}` : name) : basePath;
    if (!path) continue;
    if (handle.kind === 'file') {
      const file = await handle.getFile();
      out.push({ path, file });
    } else if (handle.kind === 'directory') {
      await collectFiles(handle, path, out);
    }
  }
}
