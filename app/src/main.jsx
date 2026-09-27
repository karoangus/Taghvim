import React, { Component, useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BellRing,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ClipboardList,
  Clock3,
  Download,
  Edit3,
  Monitor,
  Moon,
  MoreHorizontal,
  Plus,
  Settings,
  Sparkles,
  Sun,
  Trash2,
  X,
} from 'lucide-react';
import './style.css';

const faDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const planColors = ['#6558e8', '#ee7b53', '#16a37d', '#d95782', '#d89a25', '#3186d5'];
const PLANS_KEY = 'taghvim-plans';
const EXAMS_KEY = 'taghvim-exams';
const THEME_KEY = 'taghvim-theme';

const uid = () => globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`;
const faNumber = (value) => {
  try { return new Intl.NumberFormat('fa-IR').format(value); } catch { return String(value); }
};

/* ---------- storage: blocked or old storage must never break the app ---------- */
function loadList(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value.filter((item) => item && typeof item === 'object') : [];
  } catch {
    return [];
  }
}

function saveList(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* keep working in memory */ }
}

function loadTheme() {
  try {
    const value = localStorage.getItem(THEME_KEY);
    return ['auto', 'light', 'dark'].includes(value) ? value : 'auto';
  } catch {
    return 'auto';
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

function Modal({ data, onClose, onPlan, onExam }) {
  const isExam = data.type === 'exam';
  const isEditing = Boolean(data.id);
  const [value, setValue] = useState({
    ...data,
    title: data.title || '',
    name: data.name || '',
    desc: data.desc || '',
    day: data.day ?? 0,
    date: data.date || toInput(new Date()),
    time: data.time || '',
    color: data.color || planColors[(data.day ?? 0) % planColors.length],
  });

  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const title = `${isEditing ? 'ویرایش' : 'افزودن'} ${isExam ? 'امتحان' : 'برنامه'}`;

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onSubmit={(event) => {
          event.preventDefault();
          if (isExam) {
            onExam({ id: value.id, name: value.name.trim(), desc: value.desc.trim(), date: value.date });
          } else {
            onPlan({
              id: value.id,
              title: value.title.trim(),
              desc: value.desc.trim(),
              day: Number(value.day),
              time: value.time,
              color: value.color,
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
            value={isExam ? value.name : value.title}
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
                  aria-label={`انتخاب رنگ ${color}`}
                  onClick={() => setValue({ ...value, color })}
                >
                  {value.color === color && <CheckCircle2 size={17} />}
                </button>
              ))}
            </div>
          </fieldset>
        )}

        <label className="field">
          <span>توضیحات <small>اختیاری</small></span>
          <textarea
            maxLength={300}
            value={value.desc}
            onChange={(event) => setValue({ ...value, desc: event.target.value })}
            placeholder={isExam ? 'مباحث یا نکته‌ای که باید یادت بماند' : 'جزئیات کوتاه برنامه را بنویس...'}
          />
        </label>

        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>انصراف</button>
          <button className="button primary" type="submit">{isEditing ? 'ذخیره تغییرات' : 'افزودن به تقویم'}</button>
        </div>
      </form>
    </div>
  );
}

function SettingsPanel({ theme, setTheme, plansCount, examsCount, onExport, onClose }) {
  useEffect(() => {
    const onKeyDown = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  const options = [
    { id: 'auto', label: 'خودکار', icon: Monitor },
    { id: 'light', label: 'روشن', icon: Sun },
    { id: 'dark', label: 'تیره', icon: Moon },
  ];

  return (
    <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
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
              <button key={id} className={theme === id ? 'selected' : ''} onClick={() => setTheme(id)}>
                <Icon size={19} />
                <span>{label}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="setting-block data-setting">
          <div className="setting-copy">
            <b>پشتیبان اطلاعات</b>
            <span>{faNumber(plansCount)} برنامه و {faNumber(examsCount)} امتحان روی همین دستگاه ذخیره شده.</span>
          </div>
          <button className="button secondary export-button" onClick={onExport}>
            <Download size={18} /> دریافت فایل پشتیبان
          </button>
        </div>

        <p className="privacy-note">همه اطلاعات فقط روی دستگاه تو نگهداری می‌شود و به سروری ارسال نمی‌شود.</p>
      </section>
    </div>
  );
}

function EmptyState({ type, onAdd }) {
  const isExam = type === 'exam';
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
  const [plans, setPlans] = useState(() => loadList(PLANS_KEY));
  const [exams, setExams] = useState(() => loadList(EXAMS_KEY));
  const [now, setNow] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState(() => dayIndex(new Date()));
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [theme, setTheme] = useState(loadTheme);
  const [toast, setToast] = useState(null);

  useEffect(() => saveList(PLANS_KEY, plans), [plans]);
  useEffect(() => saveList(EXAMS_KEY, exams), [exams]);

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'auto' ? (media?.matches ? 'dark' : 'light') : theme;
      document.documentElement.dataset.theme = resolved;
      document.documentElement.style.colorScheme = resolved;
    };
    applyTheme();
    try { localStorage.setItem(THEME_KEY, theme); } catch { /* ignore */ }
    media?.addEventListener?.('change', applyTheme);
    return () => media?.removeEventListener?.('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    if (!menu) return undefined;
    const close = () => setMenu(null);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
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

  const validExams = useMemo(() => exams.filter((exam) => {
    if (!exam || typeof exam.date !== 'string') return false;
    return isValidDate(parseLocalDate(exam.date));
  }), [exams]);

  const upcoming = useMemo(() => validExams
    .filter((exam) => daysUntil(exam.date, now) >= 0)
    .sort((a, b) => parseLocalDate(a.date) - parseLocalDate(b.date)), [validExams, now]);

  const past = useMemo(() => validExams
    .filter((exam) => daysUntil(exam.date, now) < 0)
    .sort((a, b) => parseLocalDate(b.date) - parseLocalDate(a.date)), [validExams, now]);

  const activeDays = useMemo(() => new Set(plans.map((plan) => Number(plan.day)).filter((day) => day >= 0 && day <= 6)).size, [plans]);
  const tomorrow = upcoming.find((exam) => daysUntil(exam.date, now) === 1);
  const nextExam = upcoming[0];

  function notify(message, undo) {
    setToast({ id: uid(), message, undo });
  }

  function savePlan(data) {
    const editing = Boolean(data.id);
    setPlans((items) => editing
      ? items.map((item) => (item.id === data.id ? data : item))
      : [...items, { ...data, id: uid() }]);
    setModal(null);
    setSelectedDay(data.day);
    notify(editing ? 'تغییرات برنامه ذخیره شد' : 'برنامه به هفته‌ات اضافه شد');
  }

  function saveExam(data) {
    const editing = Boolean(data.id);
    setExams((items) => editing
      ? items.map((item) => (item.id === data.id ? data : item))
      : [...items, { ...data, id: uid() }]);
    setModal(null);
    notify(editing ? 'تغییرات امتحان ذخیره شد' : 'امتحان به تقویمت اضافه شد');
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

  function exportData() {
    const payload = JSON.stringify({ version: 2, exportedAt: new Date().toISOString(), plans, exams }, null, 2);
    const url = URL.createObjectURL(new Blob([payload], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = `taghvim-backup-${toInput(new Date())}.json`;
    link.click();
    URL.revokeObjectURL(url);
    notify('فایل پشتیبان آماده شد');
  }

  const switchTab = (nextTab) => {
    setTab(nextTab);
    setMenu(null);
  };

  const openNew = () => setModal(tab === 'week' ? { type: 'plan', day: selectedDay } : { type: 'exam' });

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-inner">
          <div className="brand">
            <div className="logo"><CalendarDays size={23} /></div>
            <div className="brand-copy"><b>تقویم</b><small>برنامه‌ریزی ساده و آرام</small></div>
          </div>

          <div className="top-nav" role="navigation" aria-label="بخش‌های برنامه">
            <button className={tab === 'week' ? 'selected' : ''} onClick={() => switchTab('week')}>
              <BookOpenCheck size={18} /> هفته من
            </button>
            <button className={tab === 'exams' ? 'selected' : ''} onClick={() => switchTab('exams')}>
              <ClipboardList size={18} /> امتحان‌ها
              {upcoming.length > 0 && <span className="nav-count">{faNumber(upcoming.length)}</span>}
            </button>
          </div>

          <div className="header-actions">
            <div className="date-chip">
              <span>{faDays[dayIndex(now)]}</span>
              <b>{jalali(now)}</b>
            </div>
            <button className="icon-button" onClick={() => setSettingsOpen(true)} aria-label="تنظیمات"><Settings size={20} /></button>
          </div>
        </div>
      </header>

      <main>
        <section className="hero">
          <div className="hero-copy">
            <span className="hero-kicker"><Sparkles size={15} /> {tab === 'week' ? 'هفته‌ات را بساز' : 'آماده و بی‌استرس'}</span>
            <h1>{tab === 'week' ? 'برای یک هفته‌ی خوب آماده‌ای؟' : 'امتحان‌ها، مرتب و جلوی چشم'}</h1>
            <p>{tab === 'week' ? 'برنامه‌هایت را سبک و روشن بچین؛ بقیه‌اش قدم‌به‌قدم جلو می‌رود.' : 'تاریخ‌ها و مباحث مهم را یک‌جا نگه دار و هیچ موعدی را از دست نده.'}</p>
            <button className="button hero-button" onClick={openNew}><Plus size={19} />{tab === 'week' ? 'برنامه تازه' : 'ثبت امتحان'}</button>
          </div>

          <div className="hero-summary" aria-label="خلاصه برنامه">
            {tab === 'week' ? (
              <>
                <div className="summary-item"><span>برنامه این هفته</span><b>{faNumber(plans.length)}</b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>روز فعال</span><b>{faNumber(activeDays)} <small>از ۷</small></b></div>
                <div className="summary-divider" />
                <div className="summary-item"><span>امتحان پیش رو</span><b>{faNumber(upcoming.length)}</b></div>
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

        {tomorrow && (
          <div className="alert-card">
            <div className="alert-icon"><BellRing size={20} /></div>
            <div><b>فردا امتحان {tomorrow.name} داری</b><span>{tomorrow.desc || 'یک مرور کوتاه امروز، خیال فردا را راحت می‌کند.'}</span></div>
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
              <div className="week-progress">
                <div><span>{faNumber(activeDays)} روز برنامه‌ریزی شده</span><b>{faNumber(Math.round((activeDays / 7) * 100))}٪</b></div>
                <div className="progress-track"><i style={{ width: `${(activeDays / 7) * 100}%` }} /></div>
              </div>
            </div>

            <div className="mobile-day-picker" aria-label="انتخاب روز">
              {week.map((day) => (
                <button
                  key={day.name}
                  className={`${selectedDay === day.index ? 'selected' : ''} ${day.today ? 'today' : ''}`}
                  onClick={() => setSelectedDay(day.index)}
                >
                  <span>{day.name.slice(0, 1)}</span>
                  <b>{faFormat(day.date, { day: 'numeric' })}</b>
                </button>
              ))}
            </div>

            <div className="week-grid">
              {week.map((day) => {
                const dayPlans = plans
                  .filter((plan) => Number(plan.day) === day.index)
                  .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99'));
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
                      {dayPlans.map((plan) => (
                        <article className="plan-card" key={plan.id} style={{ '--plan-color': plan.color || planColors[0] }}>
                          <div className="plan-accent" />
                          <div className="plan-card-head">
                            <b>{plan.title}</b>
                            <button
                              className="more-button"
                              aria-label={`گزینه‌های ${plan.title}`}
                              onClick={(event) => { event.stopPropagation(); setMenu(menu === plan.id ? null : plan.id); }}
                            ><MoreHorizontal size={19} /></button>
                          </div>
                          {plan.time && <span className="plan-time"><Clock3 size={13} /> ساعت {plan.time}</span>}
                          {plan.desc && <p>{plan.desc}</p>}
                          {menu === plan.id && (
                            <div className="menu" onClick={(event) => event.stopPropagation()}>
                              <button onClick={() => { setModal({ ...plan, type: 'plan' }); setMenu(null); }}><Edit3 size={15} />ویرایش</button>
                              <button className="danger" onClick={() => removePlan(plan.id)}><Trash2 size={15} />حذف</button>
                            </div>
                          )}
                        </article>
                      ))}
                      {!dayPlans.length && (
                        <div className="day-empty">
                          <span>روز خلوتی است</span>
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
              <button className="button secondary desktop-add" onClick={() => setModal({ type: 'exam' })}><Plus size={18} /> امتحان جدید</button>
            </div>

            <div className="exam-list">
              {upcoming.map((exam) => {
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
                      <p>{exam.desc || 'توضیحی برای این امتحان ثبت نشده.'}</p>
                      <small>{longDate(parseLocalDate(exam.date))}</small>
                    </div>
                    <button
                      className="more-button exam-more"
                      aria-label={`گزینه‌های ${exam.name}`}
                      onClick={(event) => { event.stopPropagation(); setMenu(menu === exam.id ? null : exam.id); }}
                    ><MoreHorizontal size={21} /></button>
                    {menu === exam.id && (
                      <div className="menu exam-menu" onClick={(event) => event.stopPropagation()}>
                        <button onClick={() => { setModal({ ...exam, type: 'exam' }); setMenu(null); }}><Edit3 size={15} />ویرایش</button>
                        <button className="danger" onClick={() => removeExam(exam.id)}><Trash2 size={15} />حذف</button>
                      </div>
                    )}
                  </article>
                );
              })}
              {!upcoming.length && <EmptyState type="exam" onAdd={() => setModal({ type: 'exam' })} />}
            </div>

            {past.length > 0 && (
              <details className="past-exams">
                <summary>امتحان‌های برگزارشده <span>{faNumber(past.length)}</span></summary>
                <div className="past-list">
                  {past.map((exam) => (
                    <div className="past-row" key={exam.id}>
                      <CheckCircle2 size={19} />
                      <div><b>{exam.name}</b><span>{longDate(parseLocalDate(exam.date))}</span></div>
                      <button onClick={() => removeExam(exam.id)} aria-label={`حذف ${exam.name}`}><Trash2 size={17} /></button>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </section>
        )}
      </main>

      <nav className="bottom-nav" aria-label="بخش‌های برنامه">
        <button className={tab === 'week' ? 'selected' : ''} onClick={() => switchTab('week')}>
          <BookOpenCheck /><span>هفته من</span>
        </button>
        <button className="nav-add" onClick={openNew} aria-label={tab === 'week' ? 'برنامه تازه' : 'ثبت امتحان'}><Plus /></button>
        <button className={tab === 'exams' ? 'selected' : ''} onClick={() => switchTab('exams')}>
          <ClipboardList /><span>امتحان‌ها</span>
          {upcoming.length > 0 && <i>{faNumber(upcoming.length)}</i>}
        </button>
      </nav>

      {modal && <Modal data={modal} onClose={() => setModal(null)} onPlan={savePlan} onExam={saveExam} />}
      {settingsOpen && (
        <SettingsPanel
          theme={theme}
          setTheme={setTheme}
          plansCount={plans.length}
          examsCount={exams.length}
          onExport={exportData}
          onClose={() => setSettingsOpen(false)}
        />
      )}
      {toast && (
        <div className="toast" role="status">
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
