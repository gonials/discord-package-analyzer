/**
 * Date helpers using the user's local timezone so charts and stats match when they actually happened.
 * (Using UTC was making everything show ~5 hours early in timezones behind UTC.)
 */

/**
 * Get YYYY-MM-DD for the given date in local timezone.
 * @param {Date|string|number} ts
 * @returns {string|null}
 */
export function getLocalDateKey(ts) {
  if (ts == null) return null;
  try {
    const d = ts instanceof Date ? ts : new Date(ts);
    if (isNaN(d.getTime())) return null;
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  } catch {
    return null;
  }
}

/**
 * Parse YYYY-MM-DD as local date (noon to avoid DST edges).
 * @param {string} dateStr
 * @returns {Date}
 */
export function parseLocalDate(dateStr) {
  const s = String(dateStr).slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

/**
 * Add one calendar day in local time.
 * @param {Date} d
 */
export function addLocalDay(d) {
  d.setDate(d.getDate() + 1);
}
