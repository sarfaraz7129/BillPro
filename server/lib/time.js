'use strict';

/**
 * Standard Indian Time (IST) Utility Module
 * Region: UTC+05:30 (Asia/Kolkata)
 *
 * This operates at the software level globally, ensuring all invoice dates,
 * timestamps, financial years, and report periods are strictly anchored
 * to Indian Standard Time (+05:30) and do NOT rely on client/system clock.
 */

const IST_OFFSET_MINUTES = 330; // 5 hours 30 minutes
const IST_OFFSET_MS = IST_OFFSET_MINUTES * 60 * 1000; // 19,800,000 ms

/**
 * Convert any date or epoch into an IST Date object (shifted so UTC getters return IST values).
 * @param {Date|number|string} [input=new Date()]
 * @returns {Date}
 */
function toIstDate(input) {
  let epoch;
  if (!input) {
    epoch = Date.now();
  } else if (input instanceof Date) {
    epoch = input.getTime();
  } else if (typeof input === 'number') {
    epoch = input;
  } else if (typeof input === 'string') {
    // If it's a bare YYYY-MM-DD, parse as noon UTC to avoid date shifting
    if (/^\d{4}-\d{2}-\d{2}$/.test(input)) {
      return new Date(input + 'T12:00:00+05:30');
    }
    epoch = new Date(input).getTime();
  } else {
    epoch = Date.now();
  }
  if (isNaN(epoch)) epoch = Date.now();
  return new Date(epoch + IST_OFFSET_MS);
}

/**
 * Get current date string in IST ("YYYY-MM-DD").
 * @param {Date|number|string} [input]
 * @returns {string} e.g. "2026-10-21"
 */
function istToday(input) {
  return toIstDate(input).toISOString().slice(0, 10);
}

/**
 * Get current time string in IST ("HH:mm:ss").
 * @param {Date|number|string} [input]
 * @returns {string} e.g. "14:35:00"
 */
function istTime(input) {
  return toIstDate(input).toISOString().slice(11, 19);
}

/**
 * Get full ISO string with explicit +05:30 offset.
 * @param {Date|number|string} [input]
 * @returns {string} e.g. "2026-10-21T14:35:00+05:30"
 */
function istIso(input) {
  const d = toIstDate(input);
  return d.toISOString().slice(0, 19) + '+05:30';
}

/**
 * Format IST date nicely for Indian business documents (e.g. "21 Oct 2026").
 * @param {string|Date} input
 * @returns {string}
 */
function formatIstDate(input) {
  if (!input) return '-';
  const str = typeof input === 'string' ? input.slice(0, 10) : istToday(input);
  const parts = str.split('-');
  if (parts.length !== 3) return str;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${parts[2]} ${months[monthIdx] || parts[1]} ${parts[0]}`;
}

/**
 * Format IST date & time for thermal slips & audit trail (e.g. "21 Oct 2026, 02:35 PM").
 * @param {Date|number|string} [input]
 * @returns {string}
 */
function formatIstDateTime(input) {
  const d = toIstDate(input);
  const iso = d.toISOString();
  const dateStr = formatIstDate(iso.slice(0, 10));
  let hours = parseInt(iso.slice(11, 13), 10);
  const minutes = iso.slice(14, 16);
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const hoursStr = hours < 10 ? '0' + hours : '' + hours;
  return `${dateStr}, ${hoursStr}:${minutes} ${ampm} (IST)`;
}

/**
 * Get Indian Financial Year (April 1 to March 31) from an IST date.
 * e.g. "2026-10-21" -> "2026-27", "2027-02-15" -> "2026-27"
 * @param {Date|number|string} [input]
 * @returns {string}
 */
function istFinancialYear(input) {
  const d = toIstDate(input);
  const iso = d.toISOString();
  const y = parseInt(iso.slice(0, 4), 10);
  const m = parseInt(iso.slice(5, 7), 10);
  const start = m >= 4 ? y : y - 1;
  const end = (start + 1) % 100;
  return `${start}-${end < 10 ? '0' + end : end}`;
}

/**
 * Add days in IST.
 * @param {number} days
 * @param {Date|number|string} [input]
 * @returns {string} "YYYY-MM-DD"
 */
function istAddDays(days, input) {
  const epoch = input ? (input instanceof Date ? input.getTime() : new Date(input).getTime()) : Date.now();
  return istToday(epoch + (Number(days) || 0) * 86400000);
}

function isIstDate(str) {
  return typeof str === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(str);
}

module.exports = {
  IST_OFFSET_MINUTES,
  IST_OFFSET_MS,
  toIstDate,
  istToday,
  istTime,
  istIso,
  formatIstDate,
  formatIstDateTime,
  istFinancialYear,
  istAddDays,
  isIstDate
};
