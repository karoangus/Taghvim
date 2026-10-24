import React, { Component, Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronDown,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Edit3,
  Flame,
  GripVertical,
  Keyboard,
  Languages,
  ListChecks,
  Monitor,
  Zap,
  Moon,
  MoreHorizontal,
  Minus,
  Plus,
  Search,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import './style.css';
import {
  dayIndex,
  isValidDate,
  parseLocalDate,
  toInput,
} from './calendar.js';
import {
  createFormat,
  getLanguage,
  languages,
  loadLanguage,
  saveLanguage,
  translator,
} from './i18n.js';
import { DateField } from './date-picker.jsx';

const planColors = ['#6558e8', '#ee7b53', '#16a37d', '#d95782', '#d89a25', '#3186d5'];
const PLANS_KEY = 'taghvim-plans';
const EXAMS_KEY = 'taghvim-exams';
const THEME_KEY = 'taghvim-theme';
const FONT_SCALE_KEY = 'taghvim-font-scale';
const MOTION_KEY = 'taghvim-motion';
const FONT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2];
const stickerOptions = ['✨', '📚', '🧠', '✏️', '🎯', '💡', '🌱', '📝', '🎨', '💻', '🏃', '🎵', '🧪', '☕', '🏆', '🚀', '🔥', '📌', '🧩', '💪', '🌈', '❤️', '🌙', '⭐'];

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;

/* ---------- normalisation: legacy/hand-edited data must never break the UI ---------- */
function normalizeSticker(value) {
  if (typeof value !== 'string') return '';
  return Array.from(value.trim()).slice(0, 12).join('');
}

function normalizeTask(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.name ?? '').trim();
  if (!title) return null;
  return {
    id: raw.id ? String(raw.id) : uid(),
    title: title.slice(0, 80),
    sticker: normalizeSticker(raw.sticker),
    // "done" stores the week it was completed in, so it resets automatically every week.
    done: typeof raw.done === 'string' ? raw.done : '',
  };
}

/* Exam topics are a plain checklist: unlike sub-tasks they never reset by themselves. */
function normalizeTopic(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.name ?? '').trim();
  if (!title) return null;
  return {
    id: raw.id ? String(raw.id) : uid(),
    title: title.slice(0, 80),
    done: raw.done === true || raw.done === 'true',
  };
}

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.name ?? '').trim();
  if (!title) return null;
  const day = Number(raw.day);
  const time = typeof raw.time === 'string' && /^\d{1,2}:\d{2}$/.test(raw.time) ? raw.time : '';
  const rawOrder = typeof raw.order === 'number' || (typeof raw.order === 'string' && raw.order.trim() !== '')
    ? Number(raw.order)
    : Number.NaN;
  const tasks = Array.isArray(raw.tasks)
    ? raw.tasks.map(normalizeTask).filter(Boolean).slice(0, 40)
    : [];
  return {
    id: raw.id ? String(raw.id) : uid(),
    title: title.slice(0, 80),
    description: String(raw.description ?? raw.desc ?? '').trim().slice(0, 500),
    sticker: normalizeSticker(raw.sticker),
    day: Number.isFinite(day) ? Math.min(6, Math.max(0, Math.trunc(day))) : 0,
    time,
    color: typeof raw.color === 'string' && /^#[0-9a-f]{3,8}$/i.test(raw.color) ? raw.color : planColors[0],
    // Manual position inside the day. Missing for legacy data; filled in by loadPlans().
    order: Number.isFinite(rawOrder) && rawOrder >= 0 ? Math.trunc(rawOrder) : undefined,
    tasks,
  };
}

function normalizeExam(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const name = String(raw.name ?? raw.title ?? '').trim();
  const date = String(raw.date ?? '').slice(0, 10);
  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    id: raw.id ? String(raw.id) : uid(),
    name: name.slice(0, 80),
    date,
    description: String(raw.description ?? raw.desc ?? '').trim().slice(0, 500),
    topics: Array.isArray(raw.topics) ? raw.topics.map(normalizeTopic).filter(Boolean).slice(0, 60) : [],
  };
}

function taskSticker(index) {
  const number = index + 1;
  if (number === 10) return '🔟';
  return String(number).split('').map((digit) => `${digit}️⃣`).join('');
}

function isPlanComplete(plan, weekKey) {
  return plan.tasks.length > 0 && plan.tasks.every((task) => task.done === weekKey);
}

/* ---------- manual order inside a day ----------
   Every plan has an integer `order` that is unique within its day. The week view sorts by
   (completed last, then order). Legacy plans without `order` are ordered by time once,
   when their day is first loaded, so the old default is kept until the user moves something. */
const timeKey = (plan) => (plan.time ? plan.time.padStart(5, '0') : '99:99');

function compareDisplayOrder(a, b, weekKey) {
  const aDone = isPlanComplete(a, weekKey) ? 1 : 0;
  const bDone = isPlanComplete(b, weekKey) ? 1 : 0;
  if (aDone !== bDone) return aDone - bDone;
  return (a.order ?? 0) - (b.order ?? 0);
}

/* Gives every plan of `day` a sequential order. Keeps existing orders when they are complete. */
function withDayOrder(items, day) {
  const dayItems = items.filter((item) => Number(item.day) === day);
  if (dayItems.every((item) => Number.isInteger(item.order))) return items;
  const ids = [...dayItems].sort((a, b) => timeKey(a).localeCompare(timeKey(b))).map((item) => item.id);
  return writeDayOrder(items, day, ids);
}

/* Writes order = position for the plans of `day` listed in `ids`. */
function writeDayOrder(items, day, ids) {
  return items.map((item) => {
    if (Number(item.day) !== day || !ids.includes(item.id)) return item;
    return { ...item, order: ids.indexOf(item.id) };
  });
}

/* Adds a new plan (or a plan moved to another day) at its time position inside that day. */
function placeInDay(items, plan) {
  const day = Number(plan.day);
  const base = withDayOrder(items, day).concat([{ ...plan, order: 0 }]);
  const ids = base
    .filter((item) => Number(item.day) === day && item.id !== plan.id)
    .sort((a, b) => a.order - b.order);
  const at = ids.findIndex((item) => timeKey(item) > timeKey(plan));
  const orderedIds = ids.map((item) => item.id);
  orderedIds.splice(at < 0 ? orderedIds.length : at, 0, plan.id);
  return writeDayOrder(base, day, orderedIds);
}

/* Drag & drop: puts `planId` at visual position `targetIndex` of `targetDay`.
   Completed plans always stay grouped at the bottom of their day. */
function movePlanToPosition(items, planId, targetDay, targetIndex, weekKey) {
  const moving = items.find((item) => item.id === planId);
  if (!moving) return items;
  const day = Number(targetDay);
  if (!Number.isInteger(day) || day < 0 || day > 6) return items;
  const base = withDayOrder(items, day);
  const siblings = base
    .filter((item) => Number(item.day) === day && item.id !== planId)
    .sort((a, b) => compareDisplayOrder(a, b, weekKey));
  const ids = siblings.map((item) => item.id);
  const firstDone = ids.findIndex((id) => isPlanComplete(base.find((item) => item.id === id), weekKey));
  let min = 0;
  let max = ids.length;
  if (isPlanComplete(moving, weekKey)) min = firstDone < 0 ? ids.length : firstDone;
  else if (firstDone >= 0) max = firstDone;
  const at = Math.min(Math.max(Number(targetIndex) || 0, min), max);
  ids.splice(at, 0, planId);
  const moved = { ...moving, day };
  return writeDayOrder(base.filter((item) => item.id !== planId).concat([moved]), day, ids);
}

function loadPlans() {
  const plans = loadList(PLANS_KEY, normalizePlan);
  return [0, 1, 2, 3, 4, 5, 6].reduce((items, day) => withDayOrder(items, day), plans);
}

/* ---------- storage: blocked or old storage must never break the app ---------- */
function loadList(key, normalize) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    if (!Array.isArray(value)) return [];
    return value.map(normalize).filter(Boolean);
  } catch {
    return [];
  }
}

function saveList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false; /* private mode / quota — keep working in memory */
  }
}

function loadTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return ['auto', 'light', 'dark'].includes(value) ? value : 'auto';
  } catch {
    return 'auto';
  }
}

function normalizeFontScale(value) {
  const numeric = Number(value);
  return FONT_SCALE_OPTIONS.find((option) => Math.abs(option - numeric) < 0.001) ?? 1;
}

function loadFontScale() {
  try {
    return normalizeFontScale(localStorage.getItem(FONT_SCALE_KEY));
  } catch {
    return 1;
  }
}

function loadMotion() {
  try {
    return localStorage.getItem(MOTION_KEY) !== 'false';
  } catch {
    return true;
  }
}

/* ---------- date helpers ---------- */

/* Saturday-based week start, used as the key that auto-resets weekly progress. */
function weekStartKey(now) {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - dayIndex(start));
  return toInput(start);
}

function daysUntil(value, now) {
  const target = parseLocalDate(value);
  if (!isValidDate(target)) return Number.POSITIVE_INFINITY;
  target.setHours(0, 0, 0, 0);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

/* ---------- countdown: live time left until the day of the exam begins ---------- */
function countdownParts(exam, now) {
  const target = parseLocalDate(exam.date);
  if (!isValidDate(target)) return null;
  target.setHours(0, 0, 0, 0);
  const diff = target.getTime() - now.getTime();
  if (diff <= 0) return null; // the exam day has already begun
  return {
    days: Math.floor(diff / 86400000),
    hours: Math.floor((diff % 86400000) / 3600000),
    minutes: Math.floor((diff % 3600000) / 60000),
    seconds: Math.floor((diff % 60000) / 1000),
    diff,
  };
}

/* Monospace clock: "d:hh:mm:ss" or "hh:mm:ss". */
function countdownClock(exam, now, format) {
  const parts = countdownParts(exam, now);
  if (!parts) return '';
  const pad = (value) => format.digits(String(value).padStart(2, '0'));
  const clock = `${pad(parts.hours)}:${pad(parts.minutes)}:${pad(parts.seconds)}`;
  return parts.days > 0 ? `${format.digits(parts.days)}:${clock}` : clock;
}

function countdownText(exam, now, t, format) {
  const parts = countdownParts(exam, now);
  if (!parts) return t('countdown.now');
  if (parts.days > 0) {
    return t('countdown.daysHours', { days: format.num(parts.days), hours: format.num(parts.hours) });
  }
  if (parts.hours > 0) {
    return t('countdown.hoursMinutes', { hours: format.num(parts.hours), minutes: format.num(parts.minutes) });
  }
  return t('countdown.minutesLeft', { minutes: format.num(parts.minutes) });
}

/* exam → "امروز" / "فردا" / "n روز مانده" / "برگزار شده" */
function remainingLabel(exam, now, t, format) {
  const days = daysUntil(exam.date, now);
  if (!Number.isFinite(days)) return '';
  if (days < 0) return t('countdown.passed');
  if (days === 0) return t('exams.today');
  if (days === 1) return t('exams.tomorrow');
  return t('exams.daysLeft', { count: format.num(days) });
}

/* ---------- file helpers ---------- */
function downloadFile(filename, content, type) {
  try {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    // Revoking straight away can cancel the download in some browsers.
    setTimeout(() => URL.revokeObjectURL(url), 10000);
    return true;
  } catch {
    return false;
  }
}

/* Standard iCalendar file so exams can be pushed into Google/Apple calendars. */
function buildIcs(exams) {
  const stamp = new Date().toISOString().replace(/[-:]|\.\d{3}/g, '');
  const escape = (text) => String(text || '').replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Taghvim//FA//', 'CALSCALE:GREGORIAN'];
  for (const exam of exams) {
    const start = exam.date.replace(/-/g, '');
    const end = parseLocalDate(exam.date);
    end.setDate(end.getDate() + 1);
    /* The topic checklist travels inside the description, so nothing is lost. */
    const notes = [exam.description];
    if (exam.topics.length) {
      notes.push(exam.topics.map((topic) => `${topic.done ? '[x]' : '[ ]'} ${topic.title}`).join('\n'));
    }
    lines.push(
      'BEGIN:VEVENT',
      `UID:${exam.id}@taghvim`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${toInput(end).replace(/-/g, '')}`,
      `SUMMARY:${escape(exam.name)}`,
      `DESCRIPTION:${escape(notes.filter(Boolean).join('\n\n') || exam.name)}`,
      'BEGIN:VALARM',
      'TRIGGER:-P1D',
      'ACTION:DISPLAY',
      `DESCRIPTION:${escape(exam.name)}`,
      'END:VALARM',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/* ---------- resilient fallback ---------- */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  render() {
    if (this.state.error) {
      const t = translator(loadLanguage());
      const hardReset = () => {
        try {
          localStorage.removeItem(PLANS_KEY);
          localStorage.removeItem(EXAMS_KEY);
        } catch { /* ignore */ }
        window.location.reload();
      };
      return (
        <div className="fatal" dir={getLanguage(loadLanguage()).dir}>
          <div className="fatal-icon"><CalendarDays size={34} /></div>
          <h1>{t('fatal.title')}</h1>
          <p>{t('fatal.desc')}</p>
          <div className="fatal-actions">
            <button className="button primary" onClick={() => window.location.reload()}>{t('fatal.retry')}</button>
            <button className="button secondary" onClick={hardReset}>{t('fatal.reset')}</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

/* ---------- accessible dialog behaviour: Esc, focus trap, focus restore, scroll lock ---------- */
function useDialog(onClose) {
  const ref = useRef(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement;
    const { body } = document;
    const previousOverflow = body.style.overflow;
    body.style.overflow = 'hidden';

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onClose();
        return;
      }
      if (event.key !== 'Tab' || !ref.current) return;
      const focusable = [...ref.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => !el.disabled && el.getAttribute('aria-hidden') !== 'true');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      body.style.overflow = previousOverflow;
      if (previouslyFocused?.focus) {
        try { previouslyFocused.focus(); } catch { /* ignore */ }
      }
    };
  }, [onClose]);

  return ref;
}

function StickerPicker({ value = '', onChange, onSelect, label, compact = false, t }) {
  const sticker = normalizeSticker(value);
  const chooseSticker = (nextSticker) => (onSelect || onChange)?.(nextSticker);

  return (
    <fieldset className={`sticker-picker ${compact ? 'compact' : ''}`}>
      <legend>{label}</legend>
      {!compact && (
        <div className="sticker-preview-row">
          <span className="sticker-preview-label">{sticker ? t('sticker.preview') : t('sticker.optional')}</span>
          <span className="sticker-preview" aria-hidden="true">{sticker || '＋'}</span>
        </div>
      )}
      <div className="sticker-options" aria-label={t('sticker.options')}>
        {stickerOptions.map((option) => (
          <button
            key={option}
            className={sticker === option ? 'selected' : ''}
            type="button"
            aria-label={t('sticker.choose', { sticker: option })}
            aria-pressed={sticker === option}
            title={option}
            onClick={() => chooseSticker(option)}
          >
            {option}
          </button>
        ))}
      </div>
      <div className="sticker-custom-row">
        <label className="sticker-custom-field">
          <span>{t('sticker.custom')}</span>
          <input
            type="text"
            maxLength={24}
            value={sticker}
            onChange={(event) => onChange?.(normalizeSticker(event.target.value))}
            placeholder={t('sticker.customPlaceholder')}
            aria-label={t('sticker.customLabel', { label })}
          />
        </label>
        {sticker && (
          <button className="sticker-clear" type="button" onClick={() => chooseSticker('')} aria-label={t('sticker.remove', { label })}>
            {t('sticker.clear')}
          </button>
        )}
      </div>
      {!compact && <small className="sticker-hint">{t('sticker.hint')}</small>}
    </fieldset>
  );
}

function Modal({ data, onClose, onPlan, onExam, t, format }) {
  const isExam = data.type === 'exam';
  const isEditing = Boolean(data.id);
  const dialogRef = useDialog(onClose);
  const [value, setValue] = useState({
    ...data,
    title: data.title || '',
    name: data.name || '',
    day: data.day ?? 0,
    date: data.date || toInput(new Date()),
    time: data.time || '',
    color: data.color || planColors[(data.day ?? 0) % planColors.length],
    sticker: normalizeSticker(data.sticker),
    description: String(data.description ?? data.desc ?? ''),
  });

  const heading = `${isEditing ? t('action.edit') : t('action.add')} ${isExam ? t('word.exam') : t('word.plan')}`;
  const label = isExam ? value.name : value.title;
  const canSubmit = label.trim().length > 0 && (!isExam || Boolean(value.date));

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="modal"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canSubmit) return;
          if (isExam) {
            onExam({
              id: value.id,
              name: value.name.trim(),
              date: value.date,
              description: value.description.trim(),
            });
          } else {
            onPlan({
              id: value.id,
              title: value.title.trim(),
              day: Number(value.day),
              time: value.time,
              color: value.color,
              sticker: value.sticker,
              description: value.description.trim(),
            });
          }
        }}
      >
        <div className="modal-head">
          <div>
            <span className="eyebrow">{isExam ? t('modal.eyebrowExam') : t('modal.eyebrowPlan')}</span>
            <h2 id="modal-title">{heading}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label={t('action.close')}><X size={20} /></button>
        </div>

        <label className="field">
          <span>{isExam ? t('modal.examName') : t('modal.planTitle')}</span>
          <input
            autoFocus
            required
            maxLength={80}
            value={label}
            onChange={(event) => setValue({ ...value, [isExam ? 'name' : 'title']: event.target.value })}
            placeholder={isExam ? t('modal.examNamePlaceholder') : t('modal.planTitlePlaceholder')}
          />
        </label>

        {isExam ? (
          <DateField
            label={t('modal.examDate')}
            value={value.date}
            onChange={(date) => setValue({ ...value, date })}
            t={t}
            format={format}
          />
        ) : (
          <div className="field-row">
            <label className="field">
              <span>{t('modal.dayOfWeek')}</span>
              <select value={value.day} onChange={(event) => setValue({ ...value, day: event.target.value })}>
                {format.days.map((day) => <option value={day.index} key={day.name}>{day.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>{t('modal.time')} <small>{t('modal.optional')}</small></span>
              <input type="time" value={value.time} onChange={(event) => setValue({ ...value, time: event.target.value })} />
            </label>
          </div>
        )}

        <label className="field description-field">
          <span>{t('modal.description')} <small>{t('modal.optional')}</small></span>
          <textarea
            value={value.description}
            maxLength={500}
            rows={3}
            onChange={(event) => setValue({ ...value, description: event.target.value })}
            placeholder={isExam ? t('modal.examDescriptionPlaceholder') : t('modal.planDescriptionPlaceholder')}
          />
        </label>

        {!isExam && (
          <StickerPicker
            t={t}
            label={t('modal.planSticker')}
            value={value.sticker}
            onChange={(sticker) => setValue((current) => ({ ...current, sticker }))}
          />
        )}

        {!isExam && (
          <fieldset className="color-field">
            <legend>{t('modal.planColor')}</legend>
            <div className="color-options">
              {planColors.map((color) => (
                <button
                  key={color}
                  className={value.color === color ? 'selected' : ''}
                  style={{ '--swatch': color }}
                  type="button"
                  aria-pressed={value.color === color}
                  aria-label={t('modal.colorOption', { color })}
                  onClick={() => setValue({ ...value, color })}
                >
                  {value.color === color && <CheckCircle2 size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>{t('action.cancel')}</button>
          <button className="button primary" type="submit" disabled={!canSubmit}>
            {isEditing ? t('action.save') : t('action.addToCalendar')}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsPanel({
  theme, setTheme, fontScale, setFontScale, lang, setLang,
  reduceMotion, setReduceMotion,
  plansCount, examsCount, examTotal,
  onExport, onExportIcs, onImport, onClearAll, onClose,
  t, format,
}) {
  const dialogRef = useDialog(onClose);
  const fileRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fontScaleIndex = FONT_SCALE_OPTIONS.indexOf(fontScale);

  const themes = [
    { id: 'auto', label: t('settings.theme.auto'), icon: Monitor },
    { id: 'light', label: t('settings.theme.light'), icon: Sun },
    { id: 'dark', label: t('settings.theme.dark'), icon: Moon },
  ];

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal settings-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">{t('settings.eyebrow')}</span>
            <h2 id="settings-title">{t('settings.title')}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label={t('action.close')}><X size={20} /></button>
        </div>

        <div className="setting-block">
          <div className="setting-copy">
            <b><Languages size={14} /> {t('settings.language')}</b>
            <span>{t('settings.languageHint')}</span>
          </div>
          <div className="language-options" role="group" aria-label={t('settings.language')}>
            {languages.map((language) => (
              <button
                key={language.id}
                className={lang === language.id ? 'selected' : ''}
                aria-pressed={lang === language.id}
                lang={language.id}
                onClick={() => setLang(language.id)}
              >
                <span>{language.nativeLabel}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-block">
          <div className="setting-copy">
            <b>{t('settings.theme')}</b>
            <span>{t('settings.themeHint')}</span>
          </div>
          <div className="theme-options">
            {themes.map(({ id, label, icon: Icon }) => (
              <button key={id} className={theme === id ? 'selected' : ''} aria-pressed={theme === id} onClick={() => setTheme(id)}>
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-block font-setting">
          <div className="setting-copy">
            <b>{t('settings.font')}</b>
            <span>{t('settings.fontHint')}</span>
          </div>
          <div className="font-scale-control" role="group" aria-label={t('settings.font')}>
            <button
              className="font-scale-button"
              type="button"
              aria-label={t('settings.fontSmaller')}
              disabled={fontScaleIndex <= 0}
              onClick={() => setFontScale((current) => {
                const index = FONT_SCALE_OPTIONS.indexOf(current);
                return FONT_SCALE_OPTIONS[Math.max(0, index - 1)];
              })}
            ><span aria-hidden="true">{lang === 'fa' ? 'ا' : 'A'}</span><Minus size={16} /></button>
            <strong aria-live="polite">{format.num(Math.round(fontScale * 100))}{t('format.percent')}</strong>
            <button
              className="font-scale-button"
              type="button"
              aria-label={t('settings.fontBigger')}
              disabled={fontScaleIndex >= FONT_SCALE_OPTIONS.length - 1}
              onClick={() => setFontScale((current) => {
                const index = FONT_SCALE_OPTIONS.indexOf(current);
                return FONT_SCALE_OPTIONS[Math.min(FONT_SCALE_OPTIONS.length - 1, index + 1)];
              })}
            ><span aria-hidden="true">{lang === 'fa' ? 'ا' : 'A'}</span><Plus size={16} /></button>
          </div>
        </div>

        <div className="setting-block motion-setting">
          <div className="setting-copy">
            <b><Zap size={14} /> {t('settings.motion')}</b>
            <span>{t('settings.motionHint')}</span>
          </div>
          <button
            className={reduceMotion ? 'selected' : ''}
            aria-pressed={reduceMotion}
            type="button"
            role="switch"
            aria-checked={reduceMotion}
            onClick={() => setReduceMotion((current) => !current)}
          >
            {reduceMotion ? t('settings.motionOn') : t('settings.motionOff')}
          </button>
        </div>

        <div className="setting-block data-setting">
          <div className="setting-copy">
            <b>{t('settings.data')}</b>
            <span>{t('settings.dataHint', { plans: format.num(plansCount), exams: format.num(examsCount) })}</span>
          </div>
          <div className="setting-buttons">
            <button className="button secondary" onClick={onExport}>
              <Download size={17} /> {t('settings.export')}
            </button>
            <button className="button secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={17} /> {t('settings.import')}
            </button>
          </div>
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            aria-label={t('settings.file')}
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImport(file);
            }}
          />
          <button className="button secondary wide-setting-button" onClick={onExportIcs} disabled={!examTotal}>
            <CalendarPlus size={17} /> {t('settings.ics')}
          </button>
        </div>

        <div className="setting-block danger-setting">
          <div className="setting-copy">
            <b>{t('settings.clear')}</b>
            <span>{t('settings.clearHint')}</span>
          </div>
          {confirmClear ? (
            <div className="setting-buttons">
              <button className="button secondary" onClick={() => setConfirmClear(false)}>{t('action.cancel')}</button>
              <button className="button danger-button" onClick={() => { setConfirmClear(false); onClearAll(); }}>
                <Trash2 size={17} /> {t('settings.clearConfirm')}
              </button>
            </div>
          ) : (
            <button className="button secondary wide-setting-button" onClick={() => setConfirmClear(true)} disabled={!plansCount && !examsCount}>
              <Trash2 size={17} /> {t('settings.clearStart')}
            </button>
          )}
        </div>

        <div className="setting-block shortcut-setting">
          <div className="setting-copy">
            <b><Keyboard size={14} /> {t('settings.shortcuts')}</b>
            <span>{t('settings.shortcutsHint')}</span>
          </div>
          <ul className="shortcut-list">
            <li><kbd>N</kbd><span>{t('settings.shortcut.add')}</span></li>
            <li><kbd>/</kbd><span>{t('settings.shortcut.search')}</span></li>
            <li><kbd>{format.digits(1)}</kbd> <kbd>{format.digits(2)}</kbd><span>{t('settings.shortcut.tabs')}</span></li>
            <li><kbd>Esc</kbd><span>{t('settings.shortcut.close')}</span></li>
            <li><kbd className="kbd-icon"><GripVertical size={11} /></kbd><span>{t('settings.shortcut.drag')}</span></li>
          </ul>
        </div>

        <p className="privacy-note">{t('settings.privacy')}</p>
      </section>
    </div>
  );
}

function PlanTasks({ plan, thisWeek, onToggle, onAdd, onRemove, onStickerChange, t }) {
  const [draft, setDraft] = useState('');
  const [stickerTaskId, setStickerTaskId] = useState(null);
  const canAdd = draft.trim().length > 0 && plan.tasks.length < 40;

  return (
    <div className="plan-tasks">
      {plan.tasks.length > 0 && (
        <ul className="task-list">
          {plan.tasks.map((task, index) => {
            const isDone = task.done === thisWeek;
            const displayedSticker = task.sticker || taskSticker(index);
            return (
              <li key={task.id} className={`task-item ${isDone ? 'done' : ''}`}>
                <div className="task-row">
                  <button
                    className="plan-check task-check"
                    type="button"
                    aria-pressed={isDone}
                    aria-label={t(isDone ? 'task.markUndone' : 'task.markDone', { title: task.title })}
                    title={isDone ? t('task.undoTitle') : t('task.doneTitle')}
                    onClick={() => onToggle(plan.id, task.id)}
                  >
                    {isDone && <Check size={11} strokeWidth={3.4} />}
                  </button>
                  <button
                    className={`task-number ${task.sticker ? 'custom' : ''}`}
                    type="button"
                    aria-label={t(task.sticker ? 'task.stickerChange' : 'task.stickerChoose', { title: task.title })}
                    aria-expanded={stickerTaskId === task.id}
                    aria-haspopup="true"
                    title={t('task.stickerHint')}
                    onClick={() => setStickerTaskId((current) => (current === task.id ? null : task.id))}
                  >
                    {displayedSticker}
                  </button>
                  <span className="task-title">{task.title}</span>
                  <button
                    className="task-delete"
                    type="button"
                    aria-label={t('task.remove', { title: task.title })}
                    onClick={() => onRemove(plan.id, task.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
                {stickerTaskId === task.id && (
                  <StickerPicker
                    t={t}
                    compact
                    label={t('task.stickerChange', { title: task.title })}
                    value={task.sticker}
                    onChange={(sticker) => onStickerChange(plan.id, task.id, sticker)}
                    onSelect={(sticker) => {
                      onStickerChange(plan.id, task.id, sticker);
                      setStickerTaskId(null);
                    }}
                  />
                )}
              </li>
            );
          })}
        </ul>
      )}
      <form
        className="task-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canAdd) return;
          onAdd(plan.id, draft.trim());
          setDraft('');
        }}
      >
        <input
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={plan.tasks.length ? t('task.addPlaceholder') : t('task.firstPlaceholder')}
          aria-label={t('task.addTo', { title: plan.title })}
        />
        <button type="submit" disabled={!canAdd} aria-label={t('task.add')}>
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}

/* Checklist of the topics that belong to one exam — lives inside the exam card. */
function ExamTopics({ exam, onToggle, onAdd, onRemove, t }) {
  const [draft, setDraft] = useState('');
  const canAdd = draft.trim().length > 0 && exam.topics.length < 60;

  return (
    <div className="exam-topics">
      {exam.topics.length > 0 && (
        <ul className="topic-list">
          {exam.topics.map((topic) => (
            <li key={topic.id} className={`topic-item ${topic.done ? 'done' : ''}`}>
              <button
                className="plan-check topic-check"
                type="button"
                aria-pressed={topic.done}
                aria-label={t(topic.done ? 'topics.markUndone' : 'topics.markDone', { title: topic.title })}
                title={topic.done ? t('topics.undoTitle') : t('topics.doneTitle')}
                onClick={() => onToggle(exam.id, topic.id)}
              >
                {topic.done && <Check size={11} strokeWidth={3.4} />}
              </button>
              <span className="topic-title">{topic.title}</span>
              <button
                className="topic-delete"
                type="button"
                aria-label={t('topics.remove', { title: topic.title })}
                onClick={() => onRemove(exam.id, topic.id)}
              >
                <X size={12} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <form
        className="task-add"
        onSubmit={(event) => {
          event.preventDefault();
          if (!canAdd) return;
          onAdd(exam.id, draft.trim());
          setDraft('');
        }}
      >
        <input
          value={draft}
          maxLength={80}
          onChange={(event) => setDraft(event.target.value)}
          placeholder={exam.topics.length ? t('topics.addPlaceholder') : t('topics.firstPlaceholder')}
          aria-label={t('topics.addTo', { name: exam.name })}
        />
        <button type="submit" disabled={!canAdd} aria-label={t('topics.add')}>
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}

function EmptyState({ type, onAdd, searching, t }) {
  const isExam = type === 'exam';
  if (searching) {
    return (
      <div className="blank-state">
        <div className="blank-icon"><Search size={27} /></div>
        <b>{t('search.empty')}</b>
        <span>{t('search.emptyHint')}</span>
      </div>
    );
  }
  return (
    <div className="blank-state">
      <div className="blank-icon">{isExam ? <ClipboardList size={29} /> : <BookOpenCheck size={27} />}</div>
      <b>{isExam ? t('exams.empty') : t('empty.day')}</b>
      <span>{isExam ? t('exams.emptyHint') : t('empty.dayHint')}</span>
      <button className="text-button" onClick={onAdd}><Plus size={16} />{isExam ? t('exams.firstExam') : t('empty.addPlan')}</button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('week');
  const [plans, setPlans] = useState(loadPlans);
  const [exams, setExams] = useState(() => loadList(EXAMS_KEY, normalizeExam));
  const [now, setNow] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayIndex(new Date()));
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [expandedExam, setExpandedExam] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [reduceMotion, setReduceMotion] = useState(loadMotion);
  const [lang, setLang] = useState(loadLanguage);
  const [toast, setToast] = useState(null);
  const [queryText, setQueryText] = useState('');
  const searchRef = useRef(null);

  const t = useMemo(() => translator(lang), [lang]);
  const format = useMemo(() => createFormat(lang), [lang]);

  // Braces matter: saveList returns a boolean and React would treat it as a cleanup function.
  useEffect(() => { saveList(PLANS_KEY, plans); }, [plans]);
  useEffect(() => { saveList(EXAMS_KEY, exams); }, [exams]);

  /* Keep the clock (and every countdown) fresh without a heavy timer. */
  useEffect(() => {
    const tick = () => setNow((current) => {
      const next = new Date();
      return Math.floor(next.getTime() / 60000) === Math.floor(current.getTime() / 60000) ? current : next;
    });
    const timer = setInterval(tick, 30000);
    document.addEventListener('visibilitychange', tick);
    window.addEventListener('focus', tick);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
      window.removeEventListener('focus', tick);
    };
  }, []);

  /* Appearance (without alert level — final version defined further down). */

  /* Scale all rem-based text and persist the choice across visits. */
  useEffect(() => {
    document.documentElement.style.fontSize = `${Math.round(fontScale * 100)}%`;
    document.documentElement.style.setProperty('--font-scale', String(fontScale));
    try { localStorage.setItem(FONT_SCALE_KEY, String(fontScale)); } catch { /* ignore */ }
  }, [fontScale]);

  /* Language: text direction, document language and the calendar all follow it. */
  useEffect(() => {
    const config = getLanguage(lang);
    document.documentElement.lang = lang;
    document.documentElement.dir = config.dir;
    saveLanguage(lang);
  }, [lang]);

  /* Stay in sync when the app is open in another tab or window. */
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === PLANS_KEY) setPlans(loadPlans());
      if (event.key === EXAMS_KEY) setExams(loadList(EXAMS_KEY, normalizeExam));
      if (event.key === THEME_KEY) setTheme(loadTheme());
      if (event.key === FONT_SCALE_KEY) setFontScale(loadFontScale());
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    const onKey = (event) => event.key === 'Escape' && setMenu(null);
    document.addEventListener('click', close);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('click', close);
      document.removeEventListener('keydown', onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = setTimeout(() => setToast(null), 4500);
    return () => clearTimeout(timer);
  }, [toast]);

  const week = useMemo(() => {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    start.setDate(start.getDate() - dayIndex(start));
    return format.days.map((day) => {
      const date = new Date(start);
      date.setDate(date.getDate() + day.index);
      return { ...day, date, today: date.toDateString() === now.toDateString() };
    });
  }, [now, format]);

  const thisWeek = useMemo(() => weekStartKey(now), [now]);
  const needle = queryText.trim().toLowerCase();

  const matchesQuery = useCallback((...fields) => {
    if (!needle) return true;
    return fields.some((field) => String(field || '').toLowerCase().includes(needle));
  }, [needle]);

  const visiblePlans = useMemo(
    () => plans.filter((plan) => matchesQuery(plan.title, plan.description, ...plan.tasks.map((task) => task.title))),
    [plans, matchesQuery],
  );

  const upcoming = useMemo(() => exams
    .filter((exam) => daysUntil(exam.date, now) >= 0)
    .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date)), [exams, now]);

  const past = useMemo(() => exams
    .filter((exam) => daysUntil(exam.date, now) < 0)
    .sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date)), [exams, now]);

  const visibleUpcoming = useMemo(
    () => upcoming.filter((exam) => matchesQuery(exam.name, exam.description, ...exam.topics.map((topic) => topic.title))),
    [upcoming, matchesQuery],
  );
  const visiblePast = useMemo(
    () => past.filter((exam) => matchesQuery(exam.name, exam.description, ...exam.topics.map((topic) => topic.title))),
    [past, matchesQuery],
  );

  const activeDays = useMemo(
    () => new Set(plans.map((plan) => Number(plan.day)).filter((day) => day >= 0 && day <= 6)).size,
    [plans],
  );
  const allTasks = useMemo(() => plans.flatMap((plan) => plan.tasks), [plans]);
  const doneTasks = useMemo(() => allTasks.filter((task) => task.done === thisWeek).length, [allTasks, thisWeek]);
  const donePercent = allTasks.length ? Math.round((doneTasks / allTasks.length) * 100) : 0;
  const nextExam = upcoming[0];
  const nextDaysLeft = nextExam ? daysUntil(nextExam.date, now) : Number.POSITIVE_INFINITY;
  /* Alert level drives a global "exam is near" theme change so the user can't miss it. */
  const alertLevel = !nextExam
    ? null
    : nextDaysLeft <= 0
      ? 'critical'
      : nextDaysLeft <= 3
        ? 'urgent'
        : nextDaysLeft <= 7
          ? 'soon'
          : null;
  const alertExam = alertLevel ? nextExam : null;
  const tomorrow = upcoming.find((exam) => daysUntil(exam.date, now) === 1);

  /* The live countdown needs a one-second tick — but only while it is on screen. */
  const liveCountdown = Boolean(nextExam) && daysUntil(nextExam.date, now) <= 2;
  useEffect(() => {
    if (!liveCountdown) return undefined;
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, [liveCountdown]);

  /* Appearance: apply the resolved theme, browser UI colour, and exam-alert accent. */
  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'auto' ? (media?.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
      const meta = document.querySelector('meta[name="theme-color"]');
      let color = resolved === 'dark' ? '#15151e' : '#282549';
      if (alertLevel === 'critical') color = resolved === 'dark' ? '#4a1a22' : '#8a2334';
      else if (alertLevel === 'urgent') color = resolved === 'dark' ? '#4a2c18' : '#a1501d';
      else if (alertLevel === 'soon') color = resolved === 'dark' ? '#3f2f19' : '#86681f';
      if (meta) meta.setAttribute('content', color);
    };
    applyTheme();
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    media?.addEventListener?.('change', applyTheme);
    return () => media?.removeEventListener?.('change', applyTheme);
  }, [theme, alertLevel]);

  /* Expose reduced-motion preference to CSS so every animated piece can opt out. */
  useEffect(() => {
    document.documentElement.dataset.reduceMotion = String(reduceMotion);
    try { localStorage.setItem(MOTION_KEY, String(reduceMotion)); } catch { /* ignore */ }
  }, [reduceMotion]);

  const todayIndex = dayIndex(now);
  const todayPlans = useMemo(
    () => plans.filter((plan) => Number(plan.day) === todayIndex),
    [plans, todayIndex],
  );
  const todayTasks = useMemo(() => todayPlans.flatMap((plan) => plan.tasks), [todayPlans]);
  const todayLeft = todayTasks.filter((task) => task.done !== thisWeek).length;

  const notify = useCallback((message, undo) => setToast({ id: uid(), message, undo }), []);

  const openNew = useCallback(
    () => setModal(tab === 'week' ? { type: 'plan', day: selectedDay } : { type: 'exam' }),
    [tab, selectedDay],
  );
  const closeModal = useCallback(() => setModal(null), []);

  const switchTab = useCallback((nextTab) => {
    setTab(nextTab);
    setMenu(null);
  }, []);

  /* ---------- drag & drop: reorder inside a day, and move between days ---------- */
  const [drag, setDrag] = useState(null); // { id, day, index } — where the card would land
  const dragRef = useRef({ id: null, active: false, target: null, startX: 0, startY: 0 });
  const plansRef = useRef(plans);
  plansRef.current = plans;

  const beginDrag = useCallback((event, plan) => {
    if (needle || dragRef.current.id) return; // reordering a filtered list makes no sense
    if (typeof event.button === 'number' && event.button > 0) return;
    dragRef.current = {
      id: plan.id,
      active: false,
      target: null,
      startX: event.clientX,
      startY: event.clientY,
    };
  }, [needle]);

  useEffect(() => {
    /* Hit-testing: elementFromPoint when the browser has it, the event target otherwise. */
    const findTarget = (event) => {
      const point = document.elementFromPoint?.(event.clientX, event.clientY);
      const element = point || event.target;
      const zone = element?.closest?.('[data-drop-day]');
      if (!zone) return null;
      const day = Number(zone.dataset.dropDay);
      if (!Number.isInteger(day) || day < 0 || day > 6) return null;
      /* Dropping on a day chip (mobile) appends to the end of that day. */
      if (zone.dataset.dropAppend === 'true') {
        return { day, index: plansRef.current.filter((plan) => Number(plan.day) === day).length, append: true };
      }
      const cards = [...zone.querySelectorAll('[data-plan-id]')]
        .filter((card) => card.dataset.planId !== dragRef.current.id);
      let index = cards.length;
      for (let position = 0; position < cards.length; position += 1) {
        const box = cards[position].getBoundingClientRect();
        if (event.clientY < box.top + (box.height / 2)) {
          index = position;
          break;
        }
      }
      return { day, index, append: false };
    };

    const clearDrag = () => {
      dragRef.current = { id: null, active: false, target: null, startX: 0, startY: 0 };
      document.body.classList.remove('plan-dragging');
      setDrag(null);
    };

    const onMove = (event) => {
      const state = dragRef.current;
      if (!state.id) return;
      if (!state.active) {
        if (Math.abs(event.clientX - state.startX) < 6 && Math.abs(event.clientY - state.startY) < 6) return;
        state.active = true;
        document.body.classList.add('plan-dragging');
        setMenu(null);
      }
      if (event.cancelable) event.preventDefault();
      /* Keep long days reachable: scroll the page while dragging near an edge. */
      const scroller = document.scrollingElement;
      if (scroller && scroller.scrollHeight > (window.innerHeight + 40)) {
        const edge = 72;
        if (event.clientY < edge) scroller.scrollTop -= 14;
        else if (event.clientY > window.innerHeight - edge) scroller.scrollTop += 14;
      }
      const target = findTarget(event);
      if (!target) return;
      state.target = target;
      if (target.append) setSelectedDay(target.day); // mobile: preview the day you are aiming at
      setDrag((current) => (
        current && current.id === state.id && current.day === target.day && current.index === target.index
          ? current
          : { id: state.id, day: target.day, index: target.index }
      ));
    };

    const onUp = () => {
      const state = dragRef.current;
      if (!state.id) return;
      const { id, active, target } = state;
      const previousPlans = plansRef.current;
      clearDrag();
      if (!active || !target) return;
      const plan = previousPlans.find((item) => item.id === id);
      setPlans((items) => movePlanToPosition(items, id, target.day, target.index, thisWeek));
      setSelectedDay(target.day);
      /* Moving to another day is worth an undoable note; a plain reorder is visible enough. */
      if (plan && Number(plan.day) !== target.day) {
        notify(t('toast.planMoved'), () => setPlans(previousPlans));
      }
    };

    const onCancel = () => {
      if (dragRef.current.id) clearDrag();
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onCancel();
    };

    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [notify, t, thisWeek]);

  /* Keyboard shortcuts — ignored while typing or when a dialog is open. */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target?.isContentEditable) {
        if (event.key === 'Escape') event.target.blur?.();
        return;
      }
      if (modal || settingsOpen) return;
      if (event.key === '/') {
        event.preventDefault();
        searchRef.current?.focus();
      } else if (event.key === 'n' || event.key === 'N') {
        event.preventDefault();
        openNew();
      } else if (event.key === '1') {
        switchTab('week');
      } else if (event.key === '2') {
        switchTab('exams');
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [modal, settingsOpen, openNew, switchTab]);

  function savePlan(data) {
    const editing = Boolean(data.id);
    const plan = normalizePlan(data);
    if (!plan) return;
    setPlans((items) => {
      if (!editing) return placeInDay(items, plan);
      const current = items.find((item) => item.id === data.id);
      if (!current) return items;
      const merged = { ...current, ...plan, id: current.id, tasks: current.tasks, order: current.order };
      if (Number(current.day) === plan.day) {
        return items.map((item) => (item.id === data.id ? merged : item));
      }
      // Moved to another day: it takes its time position there.
      return placeInDay(items.filter((item) => item.id !== data.id), merged);
    });
    setModal(null);
    setSelectedDay(plan.day);
    notify(editing ? t('toast.planSaved') : t('toast.planAdded'));
  }

  function saveExam(data) {
    const editing = Boolean(data.id);
    const exam = normalizeExam(data);
    if (!exam) return;
    setExams((items) => (editing
      ? items.map((item) => (item.id === data.id ? { ...exam, id: item.id, topics: item.topics } : item))
      : [...items, exam]));
    setModal(null);
    notify(editing ? t('toast.examSaved') : t('toast.examAdded'));
  }

  function addTask(planId, title) {
    const text = String(title || '').trim().slice(0, 80);
    if (!text) return;
    setPlans((items) => items.map((plan) => {
      if (plan.id !== planId || plan.tasks.length >= 40) return plan;
      return { ...plan, tasks: [...plan.tasks, { id: uid(), title: text, sticker: '', done: '' }] };
    }));
  }

  function updateTaskSticker(planId, taskId, sticker) {
    const nextSticker = normalizeSticker(sticker);
    setPlans((items) => items.map((plan) => (
      plan.id !== planId
        ? plan
        : { ...plan, tasks: plan.tasks.map((task) => (task.id === taskId ? { ...task, sticker: nextSticker } : task)) }
    )));
  }

  function toggleTask(planId, taskId) {
    setPlans((items) => items.map((plan) => {
      if (plan.id !== planId) return plan;
      return {
        ...plan,
        tasks: plan.tasks.map((task) => (
          task.id === taskId ? { ...task, done: task.done === thisWeek ? '' : thisWeek } : task
        )),
      };
    }));
  }

  function removeTask(planId, taskId) {
    setPlans((items) => items.map((plan) => (
      plan.id !== planId ? plan : { ...plan, tasks: plan.tasks.filter((task) => task.id !== taskId) }
    )));
  }

  /* ---------- exam topics ---------- */
  function addTopic(examId, title) {
    const text = String(title || '').trim().slice(0, 80);
    if (!text) return;
    setExams((items) => items.map((exam) => (
      exam.id !== examId || exam.topics.length >= 60
        ? exam
        : { ...exam, topics: [...exam.topics, { id: uid(), title: text, done: false }] }
    )));
  }

  function toggleTopic(examId, topicId) {
    setExams((items) => items.map((exam) => (
      exam.id !== examId
        ? exam
        : {
          ...exam,
          topics: exam.topics.map((topic) => (
            topic.id === topicId ? { ...topic, done: !topic.done } : topic
          )),
        }
    )));
  }

  function removeTopic(examId, topicId) {
    setExams((items) => items.map((exam) => (
      exam.id !== examId ? exam : { ...exam, topics: exam.topics.filter((topic) => topic.id !== topicId) }
    )));
  }

  /* Swaps the position with the neighbour above/below inside the same day (and same completed group). */
  function movePlan(id, direction) {
    setPlans((items) => {
      const plan = items.find((item) => item.id === id);
      if (!plan) return items;
      const day = Number(plan.day);
      const list = items
        .filter((item) => Number(item.day) === day)
        .sort((a, b) => compareDisplayOrder(a, b, thisWeek));
      const neighbour = list[list.indexOf(plan) + direction];
      if (!neighbour || isPlanComplete(neighbour, thisWeek) !== isPlanComplete(plan, thisWeek)) return items;
      return items.map((item) => {
        if (item.id === plan.id) return { ...item, order: neighbour.order };
        if (item.id === neighbour.id) return { ...item, order: plan.order };
        return item;
      });
    });
    setMenu(null);
  }

  function duplicatePlan(id) {
    const source = plans.find((plan) => plan.id === id);
    if (!source) return;
    setPlans((items) => placeInDay(items, {
      ...source,
      id: uid(),
      tasks: source.tasks.map((task) => ({ ...task, id: uid(), done: '' })),
    }));
    setMenu(null);
    notify(t('toast.planDuplicated'));
  }

  function removePlan(id) {
    const removed = plans.find((plan) => plan.id === id);
    const index = plans.findIndex((plan) => plan.id === id);
    setPlans((items) => items.filter((plan) => plan.id !== id));
    setMenu(null);
    if (removed) {
      notify(t('toast.planRemoved'), () => setPlans((items) => {
        if (items.some((item) => item.id === removed.id)) return items;
        const restored = [...items];
        restored.splice(Math.max(index, 0), 0, removed);
        return restored;
      }));
    }
  }

  function removeExam(id) {
    const removed = exams.find((exam) => exam.id === id);
    const index = exams.findIndex((exam) => exam.id === id);
    setExams((items) => items.filter((exam) => exam.id !== id));
    setMenu(null);
    if (removed) {
      notify(t('toast.examRemoved'), () => setExams((items) => {
        if (items.some((item) => item.id === removed.id)) return items;
        const restored = [...items];
        restored.splice(Math.max(index, 0), 0, removed);
        return restored;
      }));
    }
  }

  function clearAll() {
    const previousPlans = plans;
    const previousExams = exams;
    setPlans([]);
    setExams([]);
    setSettingsOpen(false);
    notify(t('toast.cleared'), () => {
      setPlans(previousPlans);
      setExams(previousExams);
    });
  }

  function exportData() {
    const payload = JSON.stringify({ app: 'taghvim', version: 7, exportedAt: new Date().toISOString(), plans, exams }, null, 2);
    const okFile = downloadFile(`taghvim-backup-${toInput(new Date())}.json`, payload, 'application/json');
    notify(okFile ? t('toast.backupReady') : t('toast.backupFailed'));
  }

  function exportIcs() {
    if (!exams.length) return;
    const okFile = downloadFile(`taghvim-exams-${toInput(new Date())}.ics`, buildIcs(exams), 'text/calendar');
    notify(okFile ? t('toast.icsReady') : t('toast.icsFailed'));
  }

  async function importData(file) {
    try {
      const raw = JSON.parse(await file.text());
      const incomingPlans = (Array.isArray(raw) ? raw : raw?.plans || []).map(normalizePlan).filter(Boolean);
      const incomingExams = (Array.isArray(raw) ? [] : raw?.exams || []).map(normalizeExam).filter(Boolean);
      if (!incomingPlans.length && !incomingExams.length) {
        notify(t('toast.importEmpty'));
        return;
      }
      const previousPlans = plans;
      const previousExams = exams;
      const planKeys = new Set(plans.map((plan) => `${plan.title}|${plan.day}|${plan.time}`));
      const examKeys = new Set(exams.map((exam) => `${exam.name}|${exam.date}`));
      const addedPlans = incomingPlans.filter((plan) => !planKeys.has(`${plan.title}|${plan.day}|${plan.time}`));
      const addedExams = incomingExams.filter((exam) => !examKeys.has(`${exam.name}|${exam.date}`));
      if (!addedPlans.length && !addedExams.length) {
        notify(t('toast.importDuplicate'));
        return;
      }
      setPlans((items) => addedPlans.reduce((current, plan) => placeInDay(current, {
        ...plan,
        id: uid(),
        tasks: plan.tasks.map((task) => ({ ...task, id: uid() })),
      }), items));
      setExams((items) => [...items, ...addedExams.map((exam) => ({
        ...exam,
        id: uid(),
        topics: exam.topics.map((topic) => ({ ...topic, id: uid() })),
      }))]);
      setSettingsOpen(false);
      notify(
        t('toast.imported', { plans: format.num(addedPlans.length), exams: format.num(addedExams.length) }),
        () => { setPlans(previousPlans); setExams(previousExams); },
      );
    } catch {
      notify(t('toast.importFailed'));
    }
  }

  const searchBox = (
    <div className="search-box">
      <Search size={15} />
      <input
        ref={searchRef}
        type="search"
        value={queryText}
        onChange={(event) => setQueryText(event.target.value)}
        placeholder={tab === 'week' ? t('search.plans') : t('search.exams')}
        aria-label={t('search.label')}
      />
      {queryText && (
        <button type="button" className="search-clear" onClick={() => setQueryText('')} aria-label={t('search.clear')}>
          <X size={14} />
        </button>
      )}
    </div>
  );

  const kickerIcon = alertLevel
    ? (alertLevel === 'critical' ? <AlertTriangle size={15} /> : <Flame size={15} />)
    : <Sparkles size={15} />;
  const kickerText = alertLevel === 'critical'
    ? t('hero.kicker.critical')
    : alertLevel === 'urgent'
      ? t('hero.kicker.urgent', { remaining: countdownText(alertExam, now, t, format) })
      : alertLevel === 'soon'
        ? t('hero.kicker.soon')
        : (tab === 'week' ? t('hero.kicker.week') : t('hero.kicker.exams'));
  const heroTitle = alertLevel
    ? (nextDaysLeft <= 0
      ? t('hero.title.examToday', { name: alertExam.name })
      : nextDaysLeft === 1
        ? t('hero.title.examTomorrow', { name: alertExam.name })
        : t('hero.title.examDays', { name: alertExam.name, count: format.num(nextDaysLeft) }))
    : (tab === 'week' ? t('hero.title.week') : t('hero.title.exams'));
  const heroDesc = alertLevel
    ? (nextDaysLeft <= 0
      ? t('hero.desc.examToday')
      : nextDaysLeft === 1
        ? t('hero.desc.examTomorrow')
        : t('hero.desc.examDays'))
    : (tab === 'week'
      ? (todayPlans.length
        ? (todayTasks.length
          ? (todayLeft
            ? t('hero.desc.weekTasksLeft', { count: format.num(todayPlans.length), left: format.num(todayLeft) })
            : t('hero.desc.weekTasksDone', { count: format.num(todayPlans.length) }))
          : t('hero.desc.weekNoTasks', { count: format.num(todayPlans.length) }))
        : t('hero.desc.weekEmpty'))
      : t('hero.desc.exams'));
  const heroActionLabel = alertLevel ? t('hero.action.goExams') : (tab === 'week' ? t('hero.action.newPlan') : t('hero.action.newExam'));
  const onHeroAction = alertLevel ? () => switchTab('exams') : openNew;

  const countdown = alertExam ? countdownParts(alertExam, now) : null;

  return (
    <div className={`app-shell ${alertLevel ? `exam-alert exam-alert-${alertLevel}` : ''}`} data-alert={alertLevel || ''}>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo"><CalendarDays size={23} /></div>
            <div className="brand-copy"><b>{t('brand.title')}</b><small>{t('brand.tagline')}</small></div>
          </div>

          <div className="top-nav" role="navigation" aria-label={t('nav.section')}>
            <button className={tab === 'week' ? 'selected' : ''} aria-current={tab === 'week'} onClick={() => switchTab('week')}>
              <BookOpenCheck size={18} /> {t('nav.week')}
            </button>
            <button className={`${tab === 'exams' ? 'selected' : ''} ${alertLevel ? 'has-alert' : ''}`} aria-current={tab === 'exams'} onClick={() => switchTab('exams')}>
              <ClipboardList size={18} /> {t('nav.exams')}
              {(upcoming.length > 0 || alertLevel) && <span className={`nav-count ${alertLevel ? 'alert-pill' : ''}`}>{format.num(upcoming.length)}</span>}
            </button>
          </div>

          <div className="header-actions">
            <div className="date-chip">
              <span>{format.days[todayIndex]?.name}</span>
              <b>{format.fullDate(now)}</b>
            </div>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label={t('action.settings')}><Settings size={20} /></button>
          </div>
        </div>
      </header>

      {alertLevel && alertExam && (
        <div className={`exam-alert-banner level-${alertLevel}`} role="alert">
          <div className="banner-icon">
            {alertLevel === 'critical' ? <AlertTriangle size={22} /> : <Flame size={22} />}
          </div>
          <div className="banner-copy">
            <b>
              {nextDaysLeft <= 0
                ? t('hero.title.examToday', { name: alertExam.name })
                : nextDaysLeft === 1
                  ? t('hero.title.examTomorrow', { name: alertExam.name })
                  : t('hero.title.examDays', { name: alertExam.name, count: format.num(nextDaysLeft) })}
            </b>
            <span>
              {format.longDate(parseLocalDate(alertExam.date))} — {remainingLabel(alertExam, now, t, format)}
              {countdown && <i className="live-clock" dir="ltr">{countdownClock(alertExam, now, format)}</i>}
            </span>
          </div>
          <button className="banner-action" onClick={() => switchTab('exams')}>{t('action.view')}</button>
        </div>
      )}

      <main>
        <section className={`hero ${alertLevel ? 'hero-alert' : ''}`}>
          <div className="hero-copy">
            <span className="hero-kicker">{kickerIcon} {kickerText}</span>
            <h1>{heroTitle}</h1>
            <p>{heroDesc}</p>
            <button className={`button hero-button ${alertLevel ? 'hero-button-alert' : ''}`} onClick={onHeroAction}>
              <Plus size={19} />{heroActionLabel}
            </button>
          </div>

          <div className="hero-summary" aria-label={t('summary.label')}>
            {alertLevel && alertExam ? (
              <>
                <div className="summary-item wide-summary alert-summary">
                  <span>{nextDaysLeft <= 0 ? t('summary.examToday') : nextDaysLeft === 1 ? t('summary.examTomorrow') : t('summary.nextExam')}</span>
                  <b>{alertExam.name}</b>
                  <small>{format.longDate(parseLocalDate(alertExam.date))}</small>
                </div>
                <div className="summary-divider" />
                <div className="summary-item countdown-summary">
                  <span>{t('summary.timeLeft')}</span>
                  <b className="countdown-big" dir="ltr">{countdown ? countdownClock(alertExam, now, format) : t('exams.today')}</b>
                  <small>{countdown ? countdownText(alertExam, now, t, format) : format.longDate(parseLocalDate(alertExam.date))}</small>
                </div>
              </>
            ) : tab === 'week' ? (
              <>
                <div className="summary-item"><span>{t('summary.weekPlans')}</span><b>{format.num(plans.length)}</b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>{t('summary.activeDays')}</span><b>{format.num(activeDays)} <small>{t('summary.activeDaysUnit')}</small></b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>{t('summary.doneTasks')}</span><b>{format.num(doneTasks)}</b></div>
              </>
            ) : (
              <>
                <div className="summary-item wide-summary">
                  <span>{t('summary.nextExam')}</span>
                  <b>{nextExam ? nextExam.name : t('summary.noExam')}</b>
                  <small>{nextExam ? `${remainingLabel(nextExam, now, t, format)} · ${format.longDate(parseLocalDate(nextExam.date))}` : t('summary.noExamHint')}</small>
                </div>
                <div className="summary-divider" />
                <div className="summary-item"><span>{t('summary.upcomingCount')}</span><b>{format.num(upcoming.length)}</b></div>
              </>
            )}
          </div>
        </section>

        {tomorrow && !alertLevel && (
          <div className="alert-card">
            <div className="alert-icon"><BellRing size={20} /></div>
            <div><b>{t('alert.tomorrowExam', { name: tomorrow.name })}</b><span>{t('alert.tomorrowHint')}</span></div>
            <button onClick={() => switchTab('exams')}>{t('action.details')}</button>
          </div>
        )}

        {tab === 'week' ? (
          <section className="content-section" aria-labelledby="week-title">
            <div className="section-head">
              <div>
                <span className="eyebrow">{t('week.eyebrow')}</span>
                <h2 id="week-title">{t('week.title')}</h2>
              </div>
              <div className="head-tools">
                {searchBox}
                <div className="week-progress">
                  <div>
                    <span>{allTasks.length ? t('week.progress', { done: format.num(doneTasks), total: format.num(allTasks.length) }) : t('week.noTasks')}</span>
                    <b>{format.num(donePercent)}{t('format.percent')}</b>
                  </div>
                  <div className="progress-track"><i style={{ width: `${donePercent}%` }} /></div>
                </div>
              </div>
            </div>

            <div className="mobile-day-picker" aria-label={t('week.dayPicker')}>
              {week.map((day) => {
                const count = visiblePlans.filter((plan) => Number(plan.day) === day.index).length;
                return (
                  <button
                    key={day.name}
                    className={`${selectedDay === day.index ? 'selected' : ''} ${day.today ? 'today' : ''} ${drag && drag.day === day.index ? 'drop-target' : ''}`}
                    aria-pressed={selectedDay === day.index}
                    data-drop-day={day.index}
                    data-drop-append="true"
                    onClick={() => setSelectedDay(day.index)}
                  >
                    <span>{day.chip}</span>
                    <b>{format.dayNumber(day.date)}</b>
                    {count > 0 && <i className="day-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div className="week-grid">
              {week.map((day) => {
                const dayPlans = visiblePlans
                  .filter((plan) => Number(plan.day) === day.index)
                  .sort((a, b) => compareDisplayOrder(a, b, thisWeek));
                /* Where the dragged card would land: `index` counts the *other* cards. */
                const draggedPosition = drag ? dayPlans.findIndex((plan) => plan.id === drag.id) : -1;
                const showDrop = Boolean(drag) && drag.day === day.index && !(draggedPosition >= 0 && drag.index === draggedPosition);
                const ordinal = (position) => (draggedPosition >= 0 && position > draggedPosition ? position - 1 : position);
                const remainingCount = dayPlans.length - (draggedPosition >= 0 ? 1 : 0);
                return (
                  <article
                    className={`day-column ${day.today ? 'today' : ''} ${selectedDay === day.index ? 'mobile-selected' : ''} ${drag && drag.day === day.index ? 'drop-target' : ''}`}
                    key={day.name}
                    data-drop-day={day.index}
                  >
                    <div className="day-head">
                      <div className="day-title">
                        <span>{day.name}</span>
                        <b>{format.shortDate(day.date)}</b>
                      </div>
                      {day.today && <em>{t('week.today')}</em>}
                      <button className="mini-add" onClick={() => setModal({ type: 'plan', day: day.index })} aria-label={t('week.addToDay', { day: day.name })}><Plus size={17} /></button>
                    </div>

                    <div className="plan-list">
                      {dayPlans.map((plan, position) => {
                        const isOpen = expandedPlan === plan.id;
                        const doneCount = plan.tasks.filter((task) => task.done === thisWeek).length;
                        const isDone = isPlanComplete(plan, thisWeek);
                        /* Moving is only offered when the list is not filtered by search. */
                        const neighbourAbove = dayPlans[position - 1];
                        const neighbourBelow = dayPlans[position + 1];
                        const canMoveUp = !needle && Boolean(neighbourAbove) && isPlanComplete(neighbourAbove, thisWeek) === isDone;
                        const canMoveDown = !needle && Boolean(neighbourBelow) && isPlanComplete(neighbourBelow, thisWeek) === isDone;
                        const isDragging = drag?.id === plan.id;
                        return (
                          <Fragment key={plan.id}>
                            {showDrop && drag.index === ordinal(position) && position !== draggedPosition && (
                              <div className="drop-line" aria-hidden="true" />
                            )}
                            <article
                              className={`plan-card ${isOpen ? 'expanded' : ''} ${isDone ? 'done' : ''} ${isDragging ? 'dragging' : ''}`}
                              data-plan-id={plan.id}
                              style={{ '--plan-color': plan.color || planColors[0] }}
                            >
                              <div className="plan-accent" />
                              <div className="plan-card-head">
                                <button
                                  className="plan-main"
                                  type="button"
                                  aria-expanded={isOpen}
                                  onClick={() => setExpandedPlan(isOpen ? null : plan.id)}
                                >
                                  {plan.sticker && <span className="plan-sticker" aria-hidden="true">{plan.sticker}</span>}
                                  <b>{plan.title}</b>
                                </button>
                                <button
                                  className="drag-handle"
                                  type="button"
                                  tabIndex={-1}
                                  aria-label={t('plan.drag', { name: plan.title })}
                                  title={needle ? t('plan.dragDisabled') : t('plan.dragHint')}
                                  disabled={Boolean(needle)}
                                  onPointerDown={(event) => beginDrag(event, plan)}
                                ><GripVertical size={15} /></button>
                                <button
                                  className="more-button"
                                  type="button"
                                  aria-label={t('plan.options', { name: plan.title })}
                                  aria-haspopup="menu"
                                  aria-expanded={menu === plan.id}
                                  onClick={(event) => { event.stopPropagation(); setMenu(menu === plan.id ? null : plan.id); }}
                                ><MoreHorizontal size={19} /></button>
                              </div>
                              {plan.description && <p className="plan-description">{plan.description}</p>}
                              {(plan.time || plan.tasks.length > 0) && (
                                <div className="plan-meta">
                                  {plan.time && <span className="plan-time"><Clock3 size={13} /> {t('plan.time')} {format.digits(plan.time)}</span>}
                                  {plan.tasks.length > 0 && (
                                    <span className="task-count">{t('plan.taskCount', { done: format.num(doneCount), total: format.num(plan.tasks.length) })}</span>
                                  )}
                                </div>
                              )}
                              {isOpen && (
                                <PlanTasks
                                  t={t}
                                  plan={plan}
                                  thisWeek={thisWeek}
                                  onToggle={toggleTask}
                                  onAdd={addTask}
                                  onRemove={removeTask}
                                  onStickerChange={updateTaskSticker}
                                />
                              )}
                              {menu === plan.id && (
                                <div className="menu" role="menu" onClick={(event) => event.stopPropagation()}>
                                  <button role="menuitem" onClick={() => { setModal({ ...plan, type: 'plan' }); setMenu(null); }}><Edit3 size={15} />{t('action.edit')}</button>
                                  <button role="menuitem" onClick={() => movePlan(plan.id, -1)} disabled={!canMoveUp} title={needle ? t('plan.dragDisabled') : undefined}><ArrowUp size={15} />{t('action.moveUp')}</button>
                                  <button role="menuitem" onClick={() => movePlan(plan.id, 1)} disabled={!canMoveDown} title={needle ? t('plan.dragDisabled') : undefined}><ArrowDown size={15} />{t('action.moveDown')}</button>
                                  <button role="menuitem" onClick={() => duplicatePlan(plan.id)}><Copy size={15} />{t('action.duplicate')}</button>
                                  <button role="menuitem" className="danger" onClick={() => removePlan(plan.id)}><Trash2 size={15} />{t('action.delete')}</button>
                                </div>
                              )}
                            </article>
                          </Fragment>
                        );
                      })}
                      {showDrop && drag.index >= remainingCount && <div className="drop-line" aria-hidden="true" />}
                      {!dayPlans.length && !showDrop && (
                        <div className="day-empty">
                          <span>{needle ? t('search.noResult') : t('week.dayEmpty')}</span>
                          <button onClick={() => setModal({ type: 'plan', day: day.index })}>{t('week.addPlan')}</button>
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          </section>
        ) : (
          <section className="content-section exams-section" aria-labelledby="exam-title">
            <div className="section-head exam-section-head">
              <div>
                <span className="eyebrow">{t('exams.eyebrow')}</span>
                <h2 id="exam-title">{t('exams.title')}</h2>
              </div>
              <div className="head-tools">
                {searchBox}
                <button className="button secondary desktop-add" onClick={() => setModal({ type: 'exam' })}><Plus size={18} /> {t('exams.new')}</button>
              </div>
            </div>

            <div className="exam-list">
              {visibleUpcoming.map((exam) => {
                const distance = daysUntil(exam.date, now);
                const clock = distance >= 0 && distance <= 2 ? countdownClock(exam, now, format) : '';
                const doneTopics = exam.topics.filter((topic) => topic.done).length;
                const topicPercent = exam.topics.length ? Math.round((doneTopics / exam.topics.length) * 100) : 0;
                const topicsOpen = expandedExam === exam.id;
                return (
                  <article className={`exam-card ${distance <= 1 ? 'urgent' : ''}`} key={exam.id}>
                    <div className="exam-date">
                      <span>{format.monthName(parseLocalDate(exam.date))}</span>
                      <b>{format.dayNumber(parseLocalDate(exam.date))}</b>
                    </div>
                    <div className="exam-info">
                      <div className="exam-title-row">
                        <h3>{exam.name}</h3>
                        <span className="remaining">
                          <Clock3 size={14} />{remainingLabel(exam, now, t, format)}
                          {clock && <i className="live-clock" dir="ltr">{clock}</i>}
                        </span>
                      </div>
                      <small>{format.longDate(parseLocalDate(exam.date))}</small>
                      {exam.description && <p className="exam-description">{exam.description}</p>}

                      <div className="exam-topics-block">
                        <button
                          type="button"
                          className="topics-toggle"
                          aria-expanded={topicsOpen}
                          onClick={() => setExpandedExam(topicsOpen ? null : exam.id)}
                        >
                          <ListChecks size={15} />
                          <span>{t('topics.toggle')}</span>
                          {exam.topics.length > 0 && (
                            <b className="topics-count">{t('topics.progress', { done: format.num(doneTopics), total: format.num(exam.topics.length) })}</b>
                          )}
                          <ChevronDown size={14} className={topicsOpen ? 'rotated' : ''} />
                        </button>
                        {exam.topics.length > 0 && (
                          <div className="topics-track"><i style={{ width: `${topicPercent}%` }} /></div>
                        )}
                        {topicsOpen && (
                          <ExamTopics
                            t={t}
                            exam={exam}
                            onToggle={toggleTopic}
                            onAdd={addTopic}
                            onRemove={removeTopic}
                          />
                        )}
                      </div>
                    </div>
                    <button
                      className="more-button exam-more"
                      aria-label={t('exam.options', { name: exam.name })}
                      aria-haspopup="menu"
                      aria-expanded={menu === exam.id}
                      onClick={(event) => { event.stopPropagation(); setMenu(menu === exam.id ? null : exam.id); }}
                    ><MoreHorizontal size={21} /></button>
                    {menu === exam.id && (
                      <div className="menu exam-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                        <button role="menuitem" onClick={() => { setModal({ ...exam, type: 'exam' }); setMenu(null); }}><Edit3 size={15} />{t('action.edit')}</button>
                        <button role="menuitem" className="danger" onClick={() => removeExam(exam.id)}><Trash2 size={15} />{t('action.delete')}</button>
                      </div>
                    )}
                  </article>
                );
              })}
              {!visibleUpcoming.length && (
                <EmptyState t={t} type="exam" searching={Boolean(needle)} onAdd={() => setModal({ type: 'exam' })} />
              )}
            </div>

            {visiblePast.length > 0 && (
              <details className="past-exams">
                <summary>{t('exams.past')} <span>{format.num(visiblePast.length)}</span></summary>
                <div className="past-list">
                  {visiblePast.map((exam) => (
                    <div className="past-row" key={exam.id}>
                      <CheckCircle2 size={19} />
                      <div>
                        <b>{exam.name}</b>
                        <span>{format.longDate(parseLocalDate(exam.date))}</span>
                        {exam.description && <small className="past-description">{exam.description}</small>}
                        {exam.topics.length > 0 && (
                          <small className="past-topics">
                            <ListChecks size={12} /> {t('topics.progress', {
                              done: format.num(exam.topics.filter((topic) => topic.done).length),
                              total: format.num(exam.topics.length),
                            })}
                          </small>
                        )}
                      </div>
                      <button onClick={() => removeExam(exam.id)} aria-label={t('exam.remove', { name: exam.name })}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </main>

      <nav className={`bottom-nav ${alertLevel ? 'nav-alert' : ''}`} aria-label={t('nav.section')}>
        <button className={tab === 'week' ? 'selected' : ''} onClick={() => switchTab('week')}>
          <BookOpenCheck /><span>{t('nav.week')}</span>
        </button>
        <button className={`nav-add ${alertLevel ? 'nav-add-alert' : ''}`} onClick={openNew} aria-label={tab === 'week' ? t('nav.addPlan') : t('nav.addExam')}><Plus /></button>
        <button className={`${tab === 'exams' ? 'selected' : ''} ${alertLevel ? 'nav-exam-alert' : ''}`} onClick={() => switchTab('exams')}>
          {alertLevel === 'critical' ? <AlertTriangle /> : alertLevel ? <Flame /> : <ClipboardList />}
          <span>{t('nav.exams')}</span>
          {(upcoming.length > 0 || alertLevel) && <i className={alertLevel ? 'alert-badge' : ''}>{format.num(upcoming.length)}</i>}
        </button>
      </nav>

      {modal && <Modal t={t} format={format} data={modal} onClose={closeModal} onPlan={savePlan} onExam={saveExam} />}
      {settingsOpen && (
        <SettingsPanel
          t={t}
          format={format}
          theme={theme}
          setTheme={setTheme}
          fontScale={fontScale}
          setFontScale={setFontScale}
          reduceMotion={reduceMotion}
          setReduceMotion={setReduceMotion}
          lang={lang}
          setLang={setLang}
          plansCount={plans.length}
          examsCount={exams.length}
          examTotal={exams.length}
          onExport={exportData}
          onExportIcs={exportIcs}
          onImport={importData}
          onClearAll={clearAll}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status" aria-live="polite">
          <CheckCircle2 size={19} />
          <span>{toast.message}</span>
          {toast.undo && <button onClick={() => { toast.undo(); setToast(null); }}>{t('action.undo')}</button>}
          <button className="toast-close" onClick={() => setToast(null)} aria-label={t('action.close')}><X size={16} /></button>
        </div>
      )}
    </div>
  );
}

/* Production-only offline support. */
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(new URL('sw.js', window.location.href).pathname).catch(() => {});
  });
}

createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
