/* Calendar maths for the Jalali (Persian) and Gregorian calendars.
   Self-contained on purpose: no library, no network, no font — the app must stay tiny
   and offline. Every helper takes a calendar id so the same UI can render either
   calendar (Persian for the Persian UI, Gregorian for the English one). */

const DAY_MS = 86400000;

/* ---------- Gregorian <-> Jalali ----------
   Standard arithmetic conversion (Birashk/Borkowski style). Verified against
   Intl.DateTimeFormat('en-u-ca-persian') for every day between 1900 and 2100. */

export function gregorianToJalali(gy, gm, gd) {
  const gregorianMonthOffset = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
  const leapAdjusted = gm > 2 ? gy + 1 : gy;
  let days = 355666 + (365 * gy)
    + Math.floor((leapAdjusted + 3) / 4)
    - Math.floor((leapAdjusted + 99) / 100)
    + Math.floor((leapAdjusted + 399) / 400)
    + gd + gregorianMonthOffset[gm - 1];

  let jy = -1595 + (33 * Math.floor(days / 12053));
  days %= 12053;
  jy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    jy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  if (days < 186) {
    return { year: jy, month: 1 + Math.floor(days / 31), day: 1 + (days % 31) };
  }
  return { year: jy, month: 7 + Math.floor((days - 186) / 30), day: 1 + ((days - 186) % 30) };
}

export function jalaliToGregorian(jy, jm, jd) {
  const shifted = jy + 1595;
  let days = -355668 + (365 * shifted)
    + (Math.floor(shifted / 33) * 8)
    + Math.floor(((shifted % 33) + 3) / 4)
    + jd
    + (jm < 7 ? (jm - 1) * 31 : ((jm - 7) * 30) + 186);

  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    days -= 1;
    gy += 100 * Math.floor(days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  const gd = days + 1;
  const leap = (gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0;
  const monthLengths = [0, 31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  let rest = gd;
  while (gm < 13 && rest > monthLengths[gm]) {
    rest -= monthLengths[gm];
    gm += 1;
  }
  return { year: gy, month: gm, day: rest };
}

/* ---------- calendar-agnostic helpers ---------- */

export function toCalendarParts(date, calendar) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return null;
  if (calendar !== 'persian') {
    return { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() };
  }
  return gregorianToJalali(date.getFullYear(), date.getMonth() + 1, date.getDate());
}

/* Noon keeps the date stable across daylight-saving switches. */
export function fromCalendarParts(year, month, day, calendar) {
  if (calendar === 'persian') {
    const gregorian = jalaliToGregorian(year, month, day);
    return new Date(gregorian.year, gregorian.month - 1, gregorian.day, 12, 0, 0, 0);
  }
  return new Date(year, month - 1, day, 12, 0, 0, 0);
}

export function daysInCalendarMonth(year, month, calendar) {
  const next = month >= 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 };
  const start = fromCalendarParts(year, month, 1, calendar);
  const end = fromCalendarParts(next.year, next.month, 1, calendar);
  return Math.max(28, Math.round((end - start) / DAY_MS));
}

export function addCalendarMonths(parts, delta, calendar) {
  const index = (parts.year * 12) + (parts.month - 1) + delta;
  const year = Math.floor(index / 12);
  const month = (((index % 12) + 12) % 12) + 1;
  return { year, month, day: Math.min(parts.day, daysInCalendarMonth(year, month, calendar)) };
}

export function clampCalendarParts(parts, calendar) {
  const year = Math.min(2200, Math.max(1300, Math.trunc(parts.year) || 1400));
  const month = Math.min(12, Math.max(1, Math.trunc(parts.month) || 1));
  const day = Math.min(daysInCalendarMonth(year, month, calendar), Math.max(1, Math.trunc(parts.day) || 1));
  return { year, month, day };
}

/* Weekday index with Saturday = 0, matching the Persian week order. */
export const dayIndex = (date) => (date.getDay() + 1) % 7;

/* ---------- plain date helpers (used by both the app and the picker) ---------- */
export const toInput = (date) => {
  const copy = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
  return copy.toISOString().slice(0, 10);
};
export const parseLocalDate = (value) => new Date(`${String(value).slice(0, 10)}T12:00:00`);
export const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());
