import React, { Component, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  AlertTriangle,
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Copy,
  Download,
  Edit3,
  Flame,
  Keyboard,
  Monitor,
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

const faDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنج‌شنبه', 'جمعه'];
const planColors = ['#6558e8', '#ee7b53', '#16a37d', '#d95782', '#d89a25', '#3186d5'];
const PLANS_KEY = 'taghvim-plans';
const EXAMS_KEY = 'taghvim-exams';
const THEME_KEY = 'taghvim-theme';
const FONT_SCALE_KEY = 'taghvim-font-scale';
const FONT_SCALE_OPTIONS = [0.9, 1, 1.1, 1.2];
const stickerOptions = ['✨', '📚', '🧠', '✏️', '🎯', '💡', '🌱', '📝', '🎨', '💻', '🏃', '🎵', '🧪', '☕', '🏆', '🚀', '🔥', '📌', '🧩', '💪', '🌈', '❤️', '🌙', '⭐'];

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const faNumber = (value) => {
  try { return new Intl.NumberFormat('fa-IR').format(value); } catch { return String(value); }
};
/* Persian digits for clock values such as "۰۸:۳۰" (Intl would add separators). */
const faDigits = (value) => String(value ?? '').replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

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

function normalizePlan(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const title = String(raw.title ?? raw.name ?? '').trim();
  if (!title) return null;
  const day = Number(raw.day);
  const time = typeof raw.time === 'string' && /^\d{1,2}:\d{2}$/.test(raw.time) ? raw.time : '';
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

/* ---------- date helpers ---------- */
function faFormat(date, options) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(date);
  } catch {
    try { return date.toLocaleDateString('fa-IR', options); } catch { return date.toLocaleDateString(); }
  }
}

const jalali = (date) => faFormat(date, { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (date) => faFormat(date, { month: 'short', day: 'numeric' });
const longDate = (date) => faFormat(date, { weekday: 'long', day: 'numeric', month: 'long' });
const toInput = (date) => new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayIndex = (date) => (date.getDay() + 1) % 7;
const parseLocalDate = (value) => new Date(`${value}T12:00:00`);
const isValidDate = (date) => date instanceof Date && !Number.isNaN(date.getTime());

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

function remaining(exam, now) {
  const days = daysUntil(exam.date, now);
  if (!Number.isFinite(days)) return '';
  if (days < 0) return 'برگزار شده';
  if (days === 0) return 'امروز';
  if (days === 1) return 'فردا';
  return `${faNumber(days)} روز مانده`;
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
    lines.push(
      'BEGIN:VEVENT',
      `UID:${exam.id}@taghvim`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${start}`,
      `DTEND;VALUE=DATE:${toInput(end).replace(/-/g, '')}`,
      `SUMMARY:${escape(exam.name)}`,
      `DESCRIPTION:${escape(exam.description || exam.name)}`,
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
      const hardReset = () => {
        try {
          localStorage.removeItem(PLANS_KEY);
          localStorage.removeItem(EXAMS_KEY);
        } catch { /* ignore */ }
        window.location.reload();
      };
      return (
        <div className="fatal" dir="rtl">
          <div className="fatal-icon"><CalendarDays size={34} /></div>
          <h1>مشکلی پیش آمد</h1>
          <p>اطلاعاتت حذف نشده؛ یک‌بار صفحه را تازه کن. اگر مشکل ادامه داشت، داده‌های ناسازگار را پاک کن.</p>
          <div className="fatal-actions">
            <button className="button primary" onClick={() => window.location.reload()}>تلاش دوباره</button>
            <button className="button secondary" onClick={hardReset}>پاک‌سازی داده‌ها</button>
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

function StickerPicker({ value = '', onChange, onSelect, label, compact = false }) {
  const sticker = normalizeSticker(value);
  const chooseSticker = (nextSticker) => (onSelect || onChange)?.(nextSticker);

  return (
    <fieldset className={`sticker-picker ${compact ? 'compact' : ''}`}>
      <legend>{label}</legend>
      {!compact && (
        <div className="sticker-preview-row">
          <span className="sticker-preview-label">{sticker ? 'پیش‌نمایش' : 'اختیاری'}</span>
          <span className="sticker-preview" aria-hidden="true">{sticker || '＋'}</span>
        </div>
      )}
      <div className="sticker-options" aria-label="استیکرهای پیشنهادی">
        {stickerOptions.map((option) => (
          <button
            key={option}
            className={sticker === option ? 'selected' : ''}
            type="button"
            aria-label={`انتخاب استیکر ${option}`}
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
          <span>ایموجی دلخواه</span>
          <input
            type="text"
            maxLength={24}
            value={sticker}
            onChange={(event) => onChange?.(normalizeSticker(event.target.value))}
            placeholder="اینجا انتخاب یا جای‌گذاری کن"
            aria-label={`${label} دلخواه`}
          />
        </label>
        {sticker && (
          <button className="sticker-clear" type="button" onClick={() => chooseSticker('')} aria-label={`حذف ${label}`}>
            پاک کردن
          </button>
        )}
      </div>
      {!compact && <small className="sticker-hint">می‌توانی از استیکرهای بالا انتخاب کنی یا ایموجی دلخواهت را وارد کنی.</small>}
    </fieldset>
  );
}

function Modal({ data, onClose, onPlan, onExam }) {
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

  const title = `${isEditing ? 'ویرایش' : 'افزودن'} ${isExam ? 'امتحان' : 'برنامه'}`;
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
            <span className="eyebrow">{isExam ? 'تقویم آزمون‌ها' : 'برنامه هفتگی'}</span>
            <h2 id="modal-title">{title}</h2>
          </div>
          <button className="close-button" type="button" onClick={onClose} aria-label="بستن"><X size={20} /></button>
        </div>

        <label className="field">
          <span>{isExam ? 'نام امتحان' : 'عنوان برنامه'}</span>
          <input
            autoFocus
            required
            maxLength={80}
            value={label}
            onChange={(event) => setValue({ ...value, [isExam ? 'name' : 'title']: event.target.value })}
            placeholder={isExam ? 'مثلاً امتحان ریاضی' : 'مثلاً مرور فصل سوم'}
          />
        </label>

        {isExam ? (
          <label className="field">
            <span>تاریخ امتحان</span>
            <input required type="date" value={value.date} onChange={(event) => setValue({ ...value, date: event.target.value })} />
          </label>
        ) : (
          <div className="field-row">
            <label className="field">
              <span>روز هفته</span>
              <select value={value.day} onChange={(event) => setValue({ ...value, day: event.target.value })}>
                {faDays.map((day, index) => <option value={index} key={day}>{day}</option>)}
              </select>
            </label>
            <label className="field">
              <span>ساعت <small>اختیاری</small></span>
              <input type="time" value={value.time} onChange={(event) => setValue({ ...value, time: event.target.value })} />
            </label>
          </div>
        )}

        <label className="field description-field">
          <span>توضیحات <small>اختیاری</small></span>
          <textarea
            value={value.description}
            maxLength={500}
            rows={3}
            onChange={(event) => setValue({ ...value, description: event.target.value })}
            placeholder={isExam ? 'نکته‌ها یا جزئیات این امتحان را بنویس…' : 'نکته‌ها یا جزئیات این برنامه را بنویس…'}
          />
        </label>

        {!isExam && (
          <StickerPicker
            label="استیکر برنامه"
            value={value.sticker}
            onChange={(sticker) => setValue((current) => ({ ...current, sticker }))}
          />
        )}

        {!isExam && (
          <fieldset className="color-field">
            <legend>رنگ برنامه</legend>
            <div className="color-options">
              {planColors.map((color) => (
                <button
                  key={color}
                  className={value.color === color ? 'selected' : ''}
                  style={{ '--swatch': color }}
                  type="button"
                  aria-pressed={value.color === color}
                  aria-label={`انتخاب رنگ ${color}`}
                  onClick={() => setValue({ ...value, color })}
                >
                  {value.color === color && <CheckCircle2 size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>انصراف</button>
          <button className="button primary" type="submit" disabled={!canSubmit}>
            {isEditing ? 'ذخیره تغییرات' : 'افزودن به تقویم'}
          </button>
        </div>
      </form>
    </div>
  );
}

function SettingsPanel({
  theme, setTheme, fontScale, setFontScale, plansCount, examsCount, examTotal,
  onExport, onExportIcs, onImport, onClearAll, onClose,
}) {
  const dialogRef = useDialog(onClose);
  const fileRef = useRef(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const fontScaleIndex = FONT_SCALE_OPTIONS.indexOf(fontScale);

  const options = [
    { id: 'auto', label: 'خودکار', icon: Monitor },
    { id: 'light', label: 'روشن', icon: Sun },
    { id: 'dark', label: 'تیره', icon: Moon },
  ];

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal settings-modal" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="settings-title">
        <div className="modal-head">
          <div>
            <span className="eyebrow">شخصی‌سازی</span>
            <h2 id="settings-title">تنظیمات تقویم</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="بستن"><X size={20} /></button>
        </div>

        <div className="setting-block">
          <div className="setting-copy">
            <b>ظاهر برنامه</b>
            <span>حالت مناسب چشم و دستگاهت را انتخاب کن.</span>
          </div>
          <div className="theme-options">
            {options.map(({ id, label, icon: Icon }) => (
              <button key={id} className={theme === id ? 'selected' : ''} aria-pressed={theme === id} onClick={() => setTheme(id)}>
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-block font-setting">
          <div className="setting-copy">
            <b>اندازه‌ی نوشته‌ها</b>
            <span>اندازه‌ی فونت برنامه را کوچک‌تر یا بزرگ‌تر کن.</span>
          </div>
          <div className="font-scale-control" role="group" aria-label="تنظیم اندازه‌ی نوشته‌ها">
            <button
              className="font-scale-button"
              type="button"
              aria-label="کوچک‌تر کردن فونت"
              disabled={fontScaleIndex <= 0}
              onClick={() => setFontScale((current) => {
                const index = FONT_SCALE_OPTIONS.indexOf(current);
                return FONT_SCALE_OPTIONS[Math.max(0, index - 1)];
              })}
            ><span aria-hidden="true">ا</span><Minus size={16} /></button>
            <strong aria-live="polite">{faNumber(Math.round(fontScale * 100))}٪</strong>
            <button
              className="font-scale-button"
              type="button"
              aria-label="بزرگ‌تر کردن فونت"
              disabled={fontScaleIndex >= FONT_SCALE_OPTIONS.length - 1}
              onClick={() => setFontScale((current) => {
                const index = FONT_SCALE_OPTIONS.indexOf(current);
                return FONT_SCALE_OPTIONS[Math.min(FONT_SCALE_OPTIONS.length - 1, index + 1)];
              })}
            ><span aria-hidden="true">ا</span><Plus size={16} /></button>
          </div>
        </div>

        <div className="setting-block data-setting">
          <div className="setting-copy">
            <b>پشتیبان و انتقال اطلاعات</b>
            <span>{faNumber(plansCount)} برنامه و {faNumber(examsCount)} امتحان روی همین دستگاه ذخیره شده.</span>
          </div>
          <div className="setting-buttons">
            <button className="button secondary" onClick={onExport}>
              <Download size={17} /> گرفتن پشتیبان
            </button>
            <button className="button secondary" onClick={() => fileRef.current?.click()}>
              <Upload size={17} /> بازگردانی پشتیبان
            </button>
          </div>
          <input
            ref={fileRef}
            className="file-input"
            type="file"
            accept="application/json,.json"
            aria-label="انتخاب فایل پشتیبان"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) onImport(file);
            }}
          />
          <button className="button secondary wide-setting-button" onClick={onExportIcs} disabled={!examTotal}>
            <CalendarPlus size={17} /> خروجی امتحان‌ها برای گوگل‌کلندر (ICS)
          </button>
        </div>

        <div className="setting-block danger-setting">
          <div className="setting-copy">
            <b>پاک‌سازی کامل</b>
            <span>همه برنامه‌ها و امتحان‌های این دستگاه حذف می‌شود. قبلش پشتیبان بگیر.</span>
          </div>
          {confirmClear ? (
            <div className="setting-buttons">
              <button className="button secondary" onClick={() => setConfirmClear(false)}>انصراف</button>
              <button className="button danger-button" onClick={() => { setConfirmClear(false); onClearAll(); }}>
                <Trash2 size={17} /> بله، همه را پاک کن
              </button>
            </div>
          ) : (
            <button className="button secondary wide-setting-button" onClick={() => setConfirmClear(true)} disabled={!plansCount && !examsCount}>
              <Trash2 size={17} /> پاک کردن همه داده‌ها
            </button>
          )}
        </div>

        <div className="setting-block shortcut-setting">
          <div className="setting-copy">
            <b><Keyboard size={14} /> میان‌برهای صفحه‌کلید</b>
            <span>روی کامپیوتر سریع‌تر کار کن.</span>
          </div>
          <ul className="shortcut-list">
            <li><kbd>N</kbd><span>افزودن مورد تازه</span></li>
            <li><kbd>/</kbd><span>جست‌وجو</span></li>
            <li><kbd>۱</kbd> <kbd>۲</kbd><span>جابه‌جایی بین هفته و امتحان‌ها</span></li>
            <li><kbd>Esc</kbd><span>بستن پنجره‌ها</span></li>
          </ul>
        </div>

        <p className="privacy-note">همه اطلاعات فقط روی دستگاه تو نگهداری می‌شود و به سروری ارسال نمی‌شود.</p>
      </section>
    </div>
  );
}

function PlanTasks({ plan, thisWeek, onToggle, onAdd, onRemove, onStickerChange }) {
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
                    aria-label={`${isDone ? 'برگرداندن' : 'انجام شد'}: ${task.title}`}
                    title={isDone ? 'انجام‌نشده کن' : 'انجام شد'}
                    onClick={() => onToggle(plan.id, task.id)}
                  >
                    {isDone && <Check size={11} strokeWidth={3.4} />}
                  </button>
                  <button
                    className={`task-number ${task.sticker ? 'custom' : ''}`}
                    type="button"
                    aria-label={`${task.sticker ? 'تغییر' : 'انتخاب'} استیکر زیرتسک ${task.title}`}
                    aria-expanded={stickerTaskId === task.id}
                    aria-haspopup="true"
                    title="برای تغییر استیکر کلیک کن"
                    onClick={() => setStickerTaskId((current) => (current === task.id ? null : task.id))}
                  >
                    {displayedSticker}
                  </button>
                  <span className="task-title">{task.title}</span>
                  <button
                    className="task-delete"
                    type="button"
                    aria-label={`حذف ${task.title}`}
                    onClick={() => onRemove(plan.id, task.id)}
                  >
                    <X size={12} />
                  </button>
                </div>
                {stickerTaskId === task.id && (
                  <StickerPicker
                    compact
                    label={`استیکر زیرتسک ${task.title}`}
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
          placeholder={plan.tasks.length ? 'زیرتسک تازه…' : 'اولین زیرتسک را بنویس…'}
          aria-label={`افزودن زیرتسک به ${plan.title}`}
        />
        <button type="submit" disabled={!canAdd} aria-label="افزودن زیرتسک">
          <Plus size={14} />
        </button>
      </form>
    </div>
  );
}

function EmptyState({ type, onAdd, searching }) {
  const isExam = type === 'exam';
  if (searching) {
    return (
      <div className="blank-state">
        <div className="blank-icon"><Search size={27} /></div>
        <b>چیزی پیدا نشد</b>
        <span>عبارت دیگری را امتحان کن یا جست‌وجو را پاک کن.</span>
      </div>
    );
  }
  return (
    <div className="blank-state">
      <div className="blank-icon">{isExam ? <ClipboardList size={29} /> : <BookOpenCheck size={27} />}</div>
      <b>{isExam ? 'فعلاً امتحانی در پیش نیست' : 'این روز هنوز خلوت است'}</b>
      <span>{isExam ? 'با خیال راحت برنامه‌ریزی کن؛ امتحان بعدی را هم می‌توانی ثبت کنی.' : 'یک برنامه کوتاه اضافه کن تا از روزت بهترین استفاده را ببری.'}</span>
      <button className="text-button" onClick={onAdd}><Plus size={16} />{isExam ? 'ثبت اولین امتحان' : 'افزودن برنامه'}</button>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('week');
  const [plans, setPlans] = useState(() => loadList(PLANS_KEY, normalizePlan));
  const [exams, setExams] = useState(() => loadList(EXAMS_KEY, normalizeExam));
  const [now, setNow] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayIndex(new Date()));
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [expandedPlan, setExpandedPlan] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [fontScale, setFontScale] = useState(loadFontScale);
  const [toast, setToast] = useState(null);
  const [queryText, setQueryText] = useState('');
  const searchRef = useRef(null);

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

  /* Stay in sync when the app is open in another tab or window. */
  useEffect(() => {
    const onStorage = (event) => {
      if (event.key === PLANS_KEY) setPlans(loadList(PLANS_KEY, normalizePlan));
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
    return faDays.map((name, index) => {
      const date = new Date(start);
      date.setDate(date.getDate() + index);
      return { name, date, today: date.toDateString() === now.toDateString(), index };
    });
  }, [now]);

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
    () => upcoming.filter((exam) => matchesQuery(exam.name, exam.description)),
    [upcoming, matchesQuery],
  );
  const visiblePast = useMemo(
    () => past.filter((exam) => matchesQuery(exam.name, exam.description)),
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

  const switchTab = useCallback((nextTab) => {
    setTab(nextTab);
    setMenu(null);
  }, []);

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
    setPlans((items) => (editing
      ? items.map((item) => (item.id === data.id ? { ...item, ...plan, id: item.id, tasks: item.tasks } : item))
      : [...items, plan]));
    setModal(null);
    setSelectedDay(plan.day);
    notify(editing ? 'تغییرات برنامه ذخیره شد' : 'برنامه به هفته‌ات اضافه شد');
  }

  function saveExam(data) {
    const editing = Boolean(data.id);
    const exam = normalizeExam(data);
    if (!exam) return;
    setExams((items) => (editing
      ? items.map((item) => (item.id === data.id ? { ...exam, id: item.id } : item))
      : [...items, exam]));
    setModal(null);
    notify(editing ? 'تغییرات امتحان ذخیره شد' : 'امتحان به تقویمت اضافه شد');
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

  function duplicatePlan(id) {
    const source = plans.find((plan) => plan.id === id);
    if (!source) return;
    setPlans((items) => [...items, {
      ...source,
      id: uid(),
      tasks: source.tasks.map((task) => ({ ...task, id: uid(), done: '' })),
    }]);
    setMenu(null);
    notify('یک کپی از برنامه ساخته شد');
  }

  function removePlan(id) {
    const removed = plans.find((plan) => plan.id === id);
    const index = plans.findIndex((plan) => plan.id === id);
    setPlans((items) => items.filter((plan) => plan.id !== id));
    setMenu(null);
    if (removed) {
      notify('برنامه حذف شد', () => setPlans((items) => {
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
      notify('امتحان حذف شد', () => setExams((items) => {
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
    notify('همه داده‌ها پاک شد', () => {
      setPlans(previousPlans);
      setExams(previousExams);
    });
  }

  function exportData() {
    const payload = JSON.stringify({ app: 'taghvim', version: 6, exportedAt: new Date().toISOString(), plans, exams }, null, 2);
    const okFile = downloadFile(`taghvim-backup-${toInput(new Date())}.json`, payload, 'application/json');
    notify(okFile ? 'فایل پشتیبان آماده شد' : 'دریافت فایل در این مرورگر ممکن نشد');
  }

  function exportIcs() {
    if (!exams.length) return;
    const okFile = downloadFile(`taghvim-exams-${toInput(new Date())}.ics`, buildIcs(exams), 'text/calendar');
    notify(okFile ? 'فایل تقویم امتحان‌ها آماده شد' : 'ساخت فایل تقویم ممکن نشد');
  }

  async function importData(file) {
    try {
      const raw = JSON.parse(await file.text());
      const incomingPlans = (Array.isArray(raw) ? raw : raw?.plans || []).map(normalizePlan).filter(Boolean);
      const incomingExams = (Array.isArray(raw) ? [] : raw?.exams || []).map(normalizeExam).filter(Boolean);
      if (!incomingPlans.length && !incomingExams.length) {
        notify('در این فایل برنامه یا امتحان معتبری پیدا نشد');
        return;
      }
      const previousPlans = plans;
      const previousExams = exams;
      const planKeys = new Set(plans.map((plan) => `${plan.title}|${plan.day}|${plan.time}`));
      const examKeys = new Set(exams.map((exam) => `${exam.name}|${exam.date}`));
      const addedPlans = incomingPlans.filter((plan) => !planKeys.has(`${plan.title}|${plan.day}|${plan.time}`));
      const addedExams = incomingExams.filter((exam) => !examKeys.has(`${exam.name}|${exam.date}`));
      if (!addedPlans.length && !addedExams.length) {
        notify('همه موارد این پشتیبان از قبل موجود بودند');
        return;
      }
      setPlans((items) => [...items, ...addedPlans.map((plan) => ({
        ...plan,
        id: uid(),
        tasks: plan.tasks.map((task) => ({ ...task, id: uid() })),
      }))]);
      setExams((items) => [...items, ...addedExams.map((exam) => ({ ...exam, id: uid() }))]);
      setSettingsOpen(false);
      notify(
        `${faNumber(addedPlans.length)} برنامه و ${faNumber(addedExams.length)} امتحان بازگردانی شد`,
        () => { setPlans(previousPlans); setExams(previousExams); },
      );
    } catch {
      notify('فایل پشتیبان خوانده نشد؛ یک فایل JSON معتبر انتخاب کن');
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
        placeholder={tab === 'week' ? 'جست‌وجو در برنامه‌ها…' : 'جست‌وجو در امتحان‌ها…'}
        aria-label="جست‌وجو"
      />
      {queryText && (
        <button type="button" className="search-clear" onClick={() => setQueryText('')} aria-label="پاک کردن جست‌وجو">
          <X size={14} />
        </button>
      )}
    </div>
  );

  const kickerIcon = alertLevel
    ? (alertLevel === 'critical' ? <AlertTriangle size={15} /> : <Flame size={15} />)
    : <Sparkles size={15} />;
  const kickerText = alertLevel === 'critical'
    ? 'هشدار فوری — امتحان امروز'
    : alertLevel === 'urgent'
      ? `${remaining(alertExam, now)} تا امتحان`
      : alertLevel === 'soon'
        ? 'امتحان در همین نزدیکی'
        : (tab === 'week' ? 'هفته‌ات را بساز' : 'آماده و بی‌استرس');
  const heroTitle = alertLevel
    ? (nextDaysLeft <= 0
      ? `امروز امتحان ${alertExam.name} داری!`
      : nextDaysLeft === 1
        ? `فردا امتحان ${alertExam.name} داری`
        : `${faNumber(nextDaysLeft)} روز به امتحان ${alertExam.name} مانده`)
    : (tab === 'week' ? 'برای یک هفته‌ی خوب آماده‌ای؟' : 'امتحان‌ها، مرتب و جلوی چشم');
  const heroDesc = alertLevel
    ? (nextDaysLeft <= 0
      ? 'امتحان همین امروز برگزار می‌شود. موفق باشی! کارت‌ها و جزوه‌های لازم را چک کن.'
      : nextDaysLeft === 1
        ? 'فقط یک روز فرصت باقی است. امروز یک مرور نهایی کن و استراحت خوبی داشته باش.'
        : 'وقت طلایی مرور و جمع‌بندی است. با قدم‌های کوچک، آماده شو.')
    : (tab === 'week'
      ? (todayPlans.length
        ? (todayTasks.length
          ? `امروز ${faNumber(todayPlans.length)} برنامه داری و ${todayLeft ? `${faNumber(todayLeft)} زیرتسک هنوز مانده.` : 'همه زیرتسک‌ها را انجام داده‌ای. عالی بود!'}`
          : `امروز ${faNumber(todayPlans.length)} برنامه داری؛ برای هر کدام زیرتسک بساز.`)
        : 'برنامه‌هایت را سبک و روشن بچین؛ بقیه‌اش قدم‌به‌قدم جلو می‌رود.')
      : 'تاریخ‌ها و مباحث مهم را یک‌جا نگه دار و هیچ موعدی را از دست نده.');
  const heroActionLabel = alertLevel ? 'رفتن به امتحان‌ها' : (tab === 'week' ? 'برنامه تازه' : 'ثبت امتحان');
  const onHeroAction = alertLevel ? () => switchTab('exams') : openNew;

  return (
    <div className={`app-shell ${alertLevel ? `exam-alert exam-alert-${alertLevel}` : ''}`} data-alert={alertLevel || ''}>
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo"><CalendarDays size={23} /></div>
            <div className="brand-copy"><b>تقویم</b><small>برنامه‌ریزی ساده و آرام</small></div>
          </div>

          <div className="top-nav" role="navigation" aria-label="بخش‌های برنامه">
            <button className={tab === 'week' ? 'selected' : ''} aria-current={tab === 'week'} onClick={() => switchTab('week')}>
              <BookOpenCheck size={18} /> هفته من
            </button>
            <button className={`${tab === 'exams' ? 'selected' : ''} ${alertLevel ? 'has-alert' : ''}`} aria-current={tab === 'exams'} onClick={() => switchTab('exams')}>
              <ClipboardList size={18} /> امتحان‌ها
              {(upcoming.length > 0 || alertLevel) && <span className={`nav-count ${alertLevel ? 'alert-pill' : ''}`}>{faNumber(upcoming.length)}</span>}
            </button>
          </div>

          <div className="header-actions">
            <div className="date-chip">
              <span>{faDays[todayIndex]}</span>
              <b>{jalali(now)}</b>
            </div>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="تنظیمات"><Settings size={20} /></button>
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
                ? `امروز امتحان ${alertExam.name} داری!`
                : nextDaysLeft === 1
                  ? `فردا امتحان ${alertExam.name} داری`
                  : `${faNumber(nextDaysLeft)} روز مانده به ${alertExam.name}`}
            </b>
            <span>{longDate(parseLocalDate(alertExam.date))} — {remaining(alertExam, now)}</span>
          </div>
          <button className="banner-action" onClick={() => switchTab('exams')}>مشاهده</button>
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

          <div className="hero-summary" aria-label="خلاصه برنامه">
            {alertLevel && alertExam ? (
              <>
                <div className="summary-item wide-summary alert-summary">
                  <span>{nextDaysLeft <= 0 ? 'امتحان امروز' : nextDaysLeft === 1 ? 'امتحان فردا' : 'نزدیک‌ترین امتحان'}</span>
                  <b>{alertExam.name}</b>
                  <small>{longDate(parseLocalDate(alertExam.date))}</small>
                </div>
                <div className="summary-divider" />
                <div className="summary-item">
                  <span>زمان باقی‌مانده</span>
                  <b className="countdown-big">{remaining(alertExam, now)}</b>
                </div>
              </>
            ) : tab === 'week' ? (
              <>
                <div className="summary-item"><span>برنامه این هفته</span><b>{faNumber(plans.length)}</b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>روز فعال</span><b>{faNumber(activeDays)} <small>از ۷</small></b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>زیرتسک انجام‌شده</span><b>{faNumber(doneTasks)}</b></div>
              </>
            ) : (
              <>
                <div className="summary-item wide-summary">
                  <span>نزدیک‌ترین امتحان</span>
                  <b>{nextExam ? nextExam.name : 'فعلاً خبری نیست'}</b>
                  <small>{nextExam ? `${remaining(nextExam, now)} · ${longDate(parseLocalDate(nextExam.date))}` : 'زمان خوبی برای مرور درس‌هاست'}</small>
                </div>
                <div className="summary-divider" />
                <div className="summary-item"><span>کل امتحان‌های پیش رو</span><b>{faNumber(upcoming.length)}</b></div>
              </>
            )}
          </div>
        </section>

        {tomorrow && !alertLevel && (
          <div className="alert-card">
            <div className="alert-icon"><BellRing size={20} /></div>
            <div><b>فردا امتحان {tomorrow.name} داری</b><span>یک مرور کوتاه امروز، خیال فردا را راحت می‌کند.</span></div>
            <button onClick={() => switchTab('exams')}>دیدن جزئیات</button>
          </div>
        )}

        {tab === 'week' ? (
          <section className="content-section" aria-labelledby="week-title">
            <div className="section-head">
              <div>
                <span className="eyebrow">نمای هفتگی</span>
                <h2 id="week-title">برنامه‌های این هفته</h2>
              </div>
              <div className="head-tools">
                {searchBox}
                <div className="week-progress">
                  <div>
                    <span>{allTasks.length ? `${faNumber(doneTasks)} از ${faNumber(allTasks.length)} زیرتسک انجام شد` : 'زیرتسکی ثبت نشده'}</span>
                    <b>{faNumber(donePercent)}٪</b>
                  </div>
                  <div className="progress-track"><i style={{ width: `${donePercent}%` }} /></div>
                </div>
              </div>
            </div>

            <div className="mobile-day-picker" aria-label="انتخاب روز">
              {week.map((day) => {
                const count = visiblePlans.filter((plan) => Number(plan.day) === day.index).length;
                return (
                  <button
                    key={day.name}
                    className={`${selectedDay === day.index ? 'selected' : ''} ${day.today ? 'today' : ''}`}
                    aria-pressed={selectedDay === day.index}
                    onClick={() => setSelectedDay(day.index)}
                  >
                    <span>{day.name.slice(0, 1)}</span>
                    <b>{faFormat(day.date, { day: 'numeric' })}</b>
                    {count > 0 && <i className="day-dot" aria-hidden="true" />}
                  </button>
                );
              })}
            </div>

            <div className="week-grid">
              {week.map((day) => {
                const dayPlans = visiblePlans
                  .filter((plan) => Number(plan.day) === day.index)
                  .sort((a, b) => {
                    const aDone = isPlanComplete(a, thisWeek) ? 1 : 0;
                    const bDone = isPlanComplete(b, thisWeek) ? 1 : 0;
                    if (aDone !== bDone) return aDone - bDone;
                    return (a.time || '99:99').localeCompare(b.time || '99:99');
                  });
                return (
                  <article className={`day-column ${day.today ? 'today' : ''} ${selectedDay === day.index ? 'mobile-selected' : ''}`} key={day.name}>
                    <div className="day-head">
                      <div className="day-title">
                        <span>{day.name}</span>
                        <b>{shortDate(day.date)}</b>
                      </div>
                      {day.today && <em>امروز</em>}
                      <button className="mini-add" onClick={() => setModal({ type: 'plan', day: day.index })} aria-label={`افزودن برنامه به ${day.name}`}><Plus size={17} /></button>
                    </div>

                    <div className="plan-list">
                      {dayPlans.map((plan) => {
                        const isOpen = expandedPlan === plan.id;
                        const doneCount = plan.tasks.filter((task) => task.done === thisWeek).length;
                        const isDone = isPlanComplete(plan, thisWeek);
                        return (
                          <article
                            className={`plan-card ${isOpen ? 'expanded' : ''} ${isDone ? 'done' : ''}`}
                            key={plan.id}
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
                                className="more-button"
                                type="button"
                                aria-label={`گزینه‌های ${plan.title}`}
                                aria-haspopup="menu"
                                aria-expanded={menu === plan.id}
                                onClick={(event) => { event.stopPropagation(); setMenu(menu === plan.id ? null : plan.id); }}
                              ><MoreHorizontal size={19} /></button>
                            </div>
                            {plan.description && <p className="plan-description">{plan.description}</p>}
                            {(plan.time || plan.tasks.length > 0) && (
                              <div className="plan-meta">
                                {plan.time && <span className="plan-time"><Clock3 size={13} /> ساعت {faDigits(plan.time)}</span>}
                                {plan.tasks.length > 0 && (
                                  <span className="task-count">{faNumber(doneCount)} از {faNumber(plan.tasks.length)}</span>
                                )}
                              </div>
                            )}
                            {isOpen && (
                              <PlanTasks
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
                                <button role="menuitem" onClick={() => { setModal({ ...plan, type: 'plan' }); setMenu(null); }}><Edit3 size={15} />ویرایش</button>
                                <button role="menuitem" onClick={() => duplicatePlan(plan.id)}><Copy size={15} />کپی</button>
                                <button role="menuitem" className="danger" onClick={() => removePlan(plan.id)}><Trash2 size={15} />حذف</button>
                              </div>
                            )}
                          </article>
                        );
                      })}
                      {!dayPlans.length && (
                        <div className="day-empty">
                          <span>{needle ? 'نتیجه‌ای نبود' : 'روز خلوتی است'}</span>
                          <button onClick={() => setModal({ type: 'plan', day: day.index })}>+ افزودن برنامه</button>
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
                <span className="eyebrow">زمان‌بندی آزمون‌ها</span>
                <h2 id="exam-title">امتحان‌های پیش رو</h2>
              </div>
              <div className="head-tools">
                {searchBox}
                <button className="button secondary desktop-add" onClick={() => setModal({ type: 'exam' })}><Plus size={18} /> امتحان جدید</button>
              </div>
            </div>

            <div className="exam-list">
              {visibleUpcoming.map((exam) => {
                const distance = daysUntil(exam.date, now);
                return (
                  <article className={`exam-card ${distance <= 1 ? 'urgent' : ''}`} key={exam.id}>
                    <div className="exam-date">
                      <span>{faFormat(parseLocalDate(exam.date), { month: 'short' })}</span>
                      <b>{faFormat(parseLocalDate(exam.date), { day: 'numeric' })}</b>
                    </div>
                    <div className="exam-info">
                      <div className="exam-title-row">
                        <h3>{exam.name}</h3>
                        <span className="remaining"><Clock3 size={14} />{remaining(exam, now)}</span>
                      </div>
                      <small>{longDate(parseLocalDate(exam.date))}</small>
                      {exam.description && <p className="exam-description">{exam.description}</p>}
                    </div>
                    <button
                      className="more-button exam-more"
                      aria-label={`گزینه‌های ${exam.name}`}
                      aria-haspopup="menu"
                      aria-expanded={menu === exam.id}
                      onClick={(event) => { event.stopPropagation(); setMenu(menu === exam.id ? null : exam.id); }}
                    ><MoreHorizontal size={21} /></button>
                    {menu === exam.id && (
                      <div className="menu exam-menu" role="menu" onClick={(event) => event.stopPropagation()}>
                        <button role="menuitem" onClick={() => { setModal({ ...exam, type: 'exam' }); setMenu(null); }}><Edit3 size={15} />ویرایش</button>
                        <button role="menuitem" className="danger" onClick={() => removeExam(exam.id)}><Trash2 size={15} />حذف</button>
                      </div>
                    )}
                  </article>
                );
              })}
              {!visibleUpcoming.length && (
                <EmptyState type="exam" searching={Boolean(needle)} onAdd={() => setModal({ type: 'exam' })} />
              )}
            </div>

            {visiblePast.length > 0 && (
              <details className="past-exams">
                <summary>امتحان‌های برگزارشده <span>{faNumber(visiblePast.length)}</span></summary>
                <div className="past-list">
                  {visiblePast.map((exam) => (
                    <div className="past-row" key={exam.id}>
                      <CheckCircle2 size={19} />
                      <div>
                        <b>{exam.name}</b>
                        <span>{longDate(parseLocalDate(exam.date))}</span>
                        {exam.description && <small className="past-description">{exam.description}</small>}
                      </div>
                      <button onClick={() => removeExam(exam.id)} aria-label={`حذف ${exam.name}`}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </main>

      <nav className={`bottom-nav ${alertLevel ? 'nav-alert' : ''}`} aria-label="بخش‌های برنامه">
        <button className={tab === 'week' ? 'selected' : ''} onClick={() => switchTab('week')}>
          <BookOpenCheck /><span>هفته من</span>
        </button>
        <button className={`nav-add ${alertLevel ? 'nav-add-alert' : ''}`} onClick={openNew} aria-label={tab === 'week' ? 'برنامه تازه' : 'ثبت امتحان'}><Plus /></button>
        <button className={`${tab === 'exams' ? 'selected' : ''} ${alertLevel ? 'nav-exam-alert' : ''}`} onClick={() => switchTab('exams')}>
          {alertLevel === 'critical' ? <AlertTriangle /> : alertLevel ? <Flame /> : <ClipboardList />}
          <span>امتحان‌ها</span>
          {(upcoming.length > 0 || alertLevel) && <i className={alertLevel ? 'alert-badge' : ''}>{faNumber(upcoming.length)}</i>}
        </button>
      </nav>

      {modal && <Modal data={modal} onClose={() => setModal(null)} onPlan={savePlan} onExam={saveExam} />}
      {settingsOpen && (
        <SettingsPanel
          theme={theme}
          setTheme={setTheme}
          fontScale={fontScale}
          setFontScale={setFontScale}
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
          {toast.undo && <button onClick={() => { toast.undo(); setToast(null); }}>برگردان</button>}
          <button className="toast-close" onClick={() => setToast(null)} aria-label="بستن"><X size={16} /></button>
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
  </ErrorBoundary>
);
