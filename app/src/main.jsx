import React, { Component, useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  Plus, CalendarDays, BookOpen, ClipboardList, Settings,
  ChevronLeft, ChevronRight, Clock3, MoreVertical, Trash2,
  Edit3, X, Bell, CheckCircle2,
} from 'lucide-react';
import './style.css';

const faDays = ['شنبه', 'یکشنبه', 'دوشنبه', 'سه‌شنبه', 'چهارشنبه', 'پنجشنبه', 'جمعه'];
const colors = ['#5b5ce2', '#ed7b45', '#18a276', '#d45578', '#e3a72f'];
const PLANS_KEY = 'taghvim-plans';
const EXAMS_KEY = 'taghvim-exams';

const uid = () => Date.now() + Math.random();

/* ---------- storage: never crash on blocked/corrupted localStorage ---------- */
function loadList(key) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const data = JSON.parse(raw);
    if (!Array.isArray(data)) return [];
    return data.filter((x) => x && typeof x === 'object');
  } catch {
    return [];
  }
}
function saveList(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full or blocked — ignore, app keeps working in-memory */
  }
}

/* ---------- dates: never crash on missing locale ---------- */
function faFormat(date, options) {
  try {
    return new Intl.DateTimeFormat('fa-IR-u-ca-persian', options).format(date);
  } catch {
    try {
      return date.toLocaleDateString('fa-IR');
    } catch {
      return date.toLocaleDateString();
    }
  }
}
const jalali = (d) => faFormat(d, { year: 'numeric', month: 'long', day: 'numeric' });
const shortDate = (d) => faFormat(d, { month: 'short', day: 'numeric' });
const toInput = (d) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const dayIndex = (d) => (d.getDay() + 1) % 7;

function remaining(e, n) {
  const ms = new Date(e.date + 'T23:59:00') - n;
  if (Number.isNaN(ms)) return '';
  if (ms < 0) return 'برگزار شده';
  const days = Math.floor(ms / 86400000);
  const hours = Math.floor((ms % 86400000) / 3600000);
  const mins = Math.floor((ms % 3600000) / 60000);
  return days > 1 ? `${days} روز مانده` : hours > 0 ? `${hours} ساعت مانده` : mins > 0 ? `${mins} دقیقه مانده` : 'به‌زودی';
}

/* ---------- error boundary: no more permanent white screen ---------- */
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
        try { localStorage.clear(); } catch { /* ignore */ }
        window.location.reload();
      };
      return (
        <div className="fatal" dir="rtl">
          <CalendarDays size={44} />
          <h1>مشکلی پیش آمد</h1>
          <p>یک خطای غیرمنتظره رخ داد. معمولاً با پاک‌سازی داده‌های ذخیره‌شده درست می‌شود.</p>
          <div className="fatal-actions">
            <button className="primary" onClick={hardReset}>پاک‌سازی داده‌ها و تلاش دوباره</button>
            <button className="ghost" onClick={() => window.location.reload()}>بارگذاری مجدد</button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

function Modal({ data, onClose, onPlan, onExam }) {
  const isExam = data.type === 'exam';
  const [v, setV] = useState({
    ...data,
    title: data.title || '',
    name: data.name || '',
    desc: data.desc || '',
    day: data.day ?? 0,
    date: data.date || toInput(new Date()),
  });
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <form
        className="modal"
        onSubmit={(e) => {
          e.preventDefault();
          if (isExam) onExam({ id: v.id, name: v.name, desc: v.desc, date: v.date });
          else onPlan({ id: v.id, title: v.title, desc: v.desc, day: +v.day, color: v.color || colors[+v.day % colors.length] });
        }}
      >
        <div className="modal-head">
          <h2>{isExam ? 'امتحان جدید' : 'برنامه جدید'}</h2>
          <button type="button" onClick={onClose}><X /></button>
        </div>
        <label>
          {isExam ? 'نام امتحان' : 'عنوان برنامه'}
          <input
            required
            value={isExam ? v.name : v.title}
            onChange={(e) => setV({ ...v, [isExam ? 'name' : 'title']: e.target.value })}
            placeholder={isExam ? 'مثلاً امتحان ریاضی' : 'مثلاً ریاضی'}
          />
        </label>
        {isExam ? (
          <label>
            تاریخ امتحان
            <input required type="date" value={v.date} onChange={(e) => setV({ ...v, date: e.target.value })} />
          </label>
        ) : (
          <label>
            روز هفته
            <select value={v.day} onChange={(e) => setV({ ...v, day: e.target.value })}>
              {faDays.map((x, i) => <option value={i} key={x}>{x}</option>)}
            </select>
          </label>
        )}
        <label>
          توضیحات <span>(اختیاری)</span>
          <textarea
            value={v.desc}
            onChange={(e) => setV({ ...v, desc: e.target.value })}
            placeholder={isExam ? 'مثلاً از صفحه ۴۰ تا ۷۵ کتاب' : 'جزئیات برنامه را بنویسید...'}
          />
        </label>
        <button className="primary wide">ذخیره کردن</button>
      </form>
    </div>
  );
}

function App() {
  const [tab, setTab] = useState('week');
  const [plans, setPlans] = useState(() => loadList(PLANS_KEY));
  const [exams, setExams] = useState(() => loadList(EXAMS_KEY));
  const [now, setNow] = useState(new Date());
  const [modal, setModal] = useState(null);
  const [menu, setMenu] = useState(null);

  useEffect(() => saveList(PLANS_KEY, plans), [plans]);
  useEffect(() => saveList(EXAMS_KEY, exams), [exams]);
  useEffect(() => {
    const x = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(x);
  }, []);

  const weekStart = new Date(now);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - dayIndex(weekStart));
  const week = faDays.map((name, i) => {
    const d = new Date(weekStart);
    d.setDate(d.getDate() + i);
    return { name, date: d, today: d.toDateString() === now.toDateString() };
  });

  const upcoming = exams
    .filter((e) => e && typeof e.date === 'string' && new Date(e.date + 'T23:59:00') >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const tomorrow = upcoming.find((e) => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    const x = new Date(e.date + 'T00:00');
    return (x - d) / 86400000 === 1;
  });

  function savePlan(data) {
    setPlans((p) => (data.id
      ? p.map((x) => (x.id === data.id ? data : x))
      : [...p, { ...data, id: uid(), color: colors[p.length % colors.length] }]));
    setModal(null);
  }
  function saveExam(data) {
    setExams((p) => (data.id ? p.map((x) => (x.id === data.id ? data : x)) : [...p, { ...data, id: uid() }]));
    setModal(null);
  }
  function removePlan(id) {
    setPlans((p) => p.filter((x) => x.id !== id));
    setMenu(null);
  }
  function removeExam(id) {
    setExams((p) => p.filter((x) => x.id !== id));
    setMenu(null);
  }

  return (
    <div className="shell">
      <header>
        <div className="brand">
          <div className="logo"><CalendarDays /></div>
          <div><b>تقویم</b><small>برنامه‌ریزی هوشمند</small></div>
        </div>
        <div className="today">
          <span>{jalali(now)}</span>
          <strong>امروز، {faDays[dayIndex(now)]}</strong>
        </div>
        <button className="icon-btn"><Settings size={20} /></button>
      </header>
      <main>
        {tomorrow && (
          <div className="alert">
            <Bell size={18} />
            <span><b>فردا امتحان {tomorrow.name} داری</b><small>{remaining(tomorrow, now)}</small></span>
            <button onClick={() => setTab('exams')}>مشاهده</button>
          </div>
        )}
        <div className="heading">
          <div>
            <h1>{tab === 'week' ? 'برنامه هفتگی' : 'امتحان‌ها'}</h1>
            <p>{tab === 'week' ? 'نظم کوچک، پیشرفت بزرگ.' : 'امتحان‌های پیش رو را مدیریت کن.'}</p>
          </div>
          <button className="primary" onClick={() => setModal(tab === 'week' ? { type: 'plan' } : { type: 'exam' })}>
            <Plus size={18} />{tab === 'week' ? 'برنامه جدید' : 'امتحان جدید'}
          </button>
        </div>
        {tab === 'week' ? (
          <section className="week-grid">
            {week.map((day) => (
              <div className={'day ' + (day.today ? 'active' : '')} key={day.name}>
                <div className="day-head">
                  <div><span>{day.name}</span><b>{shortDate(day.date)}</b></div>
                  {day.today && <em>امروز</em>}
                  <button className="add-small" onClick={() => setModal({ type: 'plan', day: faDays.indexOf(day.name) })}>
                    <Plus size={16} />
                  </button>
                </div>
                <div className="cards">
                  {plans.filter((p) => +p.day === faDays.indexOf(day.name)).map((p) => (
                    <div className="plan" key={p.id} style={{ '--c': p.color || colors[0] }}>
                      <div className="plan-top">
                        <i></i><b>{p.title}</b>
                        <button onClick={() => setMenu(menu === p.id ? null : p.id)}><MoreVertical size={17} /></button>
                      </div>
                      <p>{p.desc || 'بدون توضیحات'}</p>
                      {menu === p.id && (
                        <div className="menu">
                          <button onClick={() => { setModal({ ...p, type: 'plan' }); setMenu(null); }}><Edit3 size={14} />ویرایش</button>
                          <button onClick={() => removePlan(p.id)}><Trash2 size={14} />حذف</button>
                        </div>
                      )}
                    </div>
                  ))}
                  {!plans.some((p) => +p.day === faDays.indexOf(day.name)) && <div className="empty">برنامه‌ای ثبت نشده</div>}
                </div>
              </div>
            ))}
          </section>
        ) : (
          <section className="exam-list">
            {upcoming.map((e) => (
              <div className="exam" key={e.id}>
                <div className="exam-date">
                  <b>{faFormat(new Date(e.date), { day: 'numeric' })}</b>
                  <span>{faFormat(new Date(e.date), { month: 'short' })}</span>
                </div>
                <div className="exam-info">
                  <h3>{e.name}</h3>
                  <p>{e.desc || 'بدون توضیحات'}</p>
                  <span><Clock3 size={14} />{remaining(e, now)}</span>
                </div>
                <button className="dots" onClick={() => setMenu(menu === e.id ? null : e.id)}><MoreVertical size={18} /></button>
                {menu === e.id && (
                  <div className="menu exam-menu">
                    <button onClick={() => { setModal({ ...e, type: 'exam' }); setMenu(null); }}><Edit3 size={14} />ویرایش</button>
                    <button onClick={() => removeExam(e.id)}><Trash2 size={14} />حذف</button>
                  </div>
                )}
              </div>
            ))}
            {!upcoming.length && (
              <div className="blank">
                <ClipboardList size={42} />
                <b>امتحانی ثبت نشده</b>
                <span>امتحان‌های پیش رو را اینجا مدیریت کن.</span>
              </div>
            )}
          </section>
        )}
      </main>
      <nav>
        <button className={tab === 'week' ? 'selected' : ''} onClick={() => setTab('week')}><BookOpen /><span>هفته من</span></button>
        <button className={tab === 'exams' ? 'selected' : ''} onClick={() => setTab('exams')}>
          <ClipboardList /><span>امتحان‌ها</span>
          {upcoming.length > 0 && <i>{upcoming.length}</i>}
        </button>
      </nav>
      {modal && <Modal data={modal} onClose={() => setModal(null)} onPlan={savePlan} onExam={saveExam} />}
    </div>
  );
}

/* ---------- service worker: fixed, versioned, self-healing ---------- */
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
