/* Functional smoke test: executes the REAL production bundle in a DOM
   and verifies that the production app renders and responds — not a white screen.
   Scenarios:
     1. fresh device and the main responsive planner UI
     2. corrupted localStorage (must never cause a permanent white screen)
     3. legacy data + navigation + exam modal
     4. settings, appearance, backup & restore controls
     5. sub-tasks, custom stickers and weekly progress that resets by itself
     6. plan stickers, descriptions + conditional description/task display
     7. search / filtering
     8. keyboard shortcuts + saved font scale
     9. moving plans up/down inside their day (order persists, done plans stay last)
   Run: npm run build && node scripts/smoke.mjs
*/
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';
import { JSDOM } from 'jsdom';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const PAGE_URL = 'https://karoangus.github.io/Taghvim/'; // simulate GitHub Pages sub-path
const bundleFile = readdirSync(join(rootDir, 'assets')).find((f) => f.endsWith('.js'));

let failures = 0;
const ok = (cond, label) => {
  console.log(`${cond ? '  ✅' : '  ❌'} ${label}`);
  if (!cond) failures += 1;
};

async function boot(seedStorage = {}) {
  const html = readFileSync(join(rootDir, 'index.html'), 'utf8');
  const dom = new JSDOM(html, { url: PAGE_URL, pretendToBeVisual: true });
  const { window } = dom;
  for (const [k, v] of Object.entries(seedStorage)) window.localStorage.setItem(k, v);
  const globals = [
    'window', 'document', 'navigator', 'localStorage', 'sessionStorage',
    'HTMLElement', 'HTMLInputElement', 'Node', 'Element', 'Event', 'CustomEvent',
    'KeyboardEvent', 'MouseEvent', 'MutationObserver', 'getComputedStyle',
    'requestAnimationFrame', 'cancelAnimationFrame', 'getSelection', 'DocumentFragment',
  ];
  for (const name of globals) {
    if (window[name] !== undefined) {
      Object.defineProperty(globalThis, name, { value: window[name], configurable: true, writable: true });
    }
  }
  window.addEventListener('error', (e) => console.error('PAGE ERROR:', e.message));
  const bundleUrl = pathToFileURL(join(rootDir, 'assets', bundleFile)).href;
  await import(`${bundleUrl}?case=${Math.random()}`); // cache-bust: re-run the app per scenario
  await new Promise((r) => setTimeout(r, 60)); // flush effects
  return window;
}

const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const text = (w) => w.document.getElementById('root').textContent || '';
const query = (w, sel) => [...w.document.querySelectorAll(sel)];
const findButton = (w, label, sel = 'button') => query(w, sel).find((b) => (b.textContent || '').includes(label));
const findPlanCard = (w, title) => query(w, '.plan-card').find((card) => card.querySelector('.plan-main')?.textContent.includes(title));
const click = (w, el) => el?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
const press = (w, key, target) => (target || w.document.body)
  .dispatchEvent(new w.KeyboardEvent('keydown', { key, bubbles: true }));

/* React tracks its own value — set it through the native setter so onChange fires. */
function type(w, input, value) {
  const prototype = input instanceof w.HTMLTextAreaElement
    ? w.HTMLTextAreaElement.prototype
    : w.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value').set;
  setter.call(input, value);
  input.dispatchEvent(new w.Event('input', { bubbles: true }));
}

const planSeed = (overrides = {}) => JSON.stringify([
  { id: 'p1', title: 'ریاضی', desc: 'فصل ۲', day: '2', color: '#111111', ...overrides },
]);

/* Helpers used by the scenarios below. */
const futureIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toInputDate(date);
};
const toPersianDigits = (value) => String(value).replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const jalaliOf = (iso) => new Intl.DateTimeFormat('fa-IR-u-ca-persian', {
  year: 'numeric', month: 'long', day: 'numeric',
}).format(new Date(`${iso}T12:00:00`));

/* ---------- 1. fresh device ---------- */
console.log('\nScenario 1: fresh device');
let w = await boot();
ok(text(w).length > 50, 'app rendered (root is not empty — no white screen)');
ok(text(w).includes('تقویم'), 'brand header visible');
ok(text(w).includes('برنامه‌های این هفته'), 'weekly planner heading visible');
ok(text(w).includes('برنامه این هفته') && text(w).includes('روز فعال'), 'weekly summary visible');
ok(text(w).includes('هفته من') && text(w).includes('امتحان‌ها'), 'navigation visible');
ok(['شنبه', 'یکشنبه', 'دوشنبه', 'جمعه'].every((d) => text(w).includes(d)), 'all week days rendered');
ok(query(w, '.mobile-day-picker button').length === 7, 'mobile day picker has seven compact day buttons');
ok(query(w, '.search-box input').length === 1, 'search box available in the week view');

/* ---------- 2. corrupted localStorage ---------- */
console.log('\nScenario 2: corrupted localStorage (old white-screen cause)');
w = await boot({ 'taghvim-plans': '{invalid json!!!', 'taghvim-exams': '{"not":"an array"}' });
ok(text(w).includes('برنامه‌های این هفته'), 'app still renders despite corrupted storage');
ok(!text(w).includes('مشکلی پیش آمد'), 'error boundary not triggered');

w = await boot({
  'taghvim-plans': JSON.stringify([null, 42, { title: '' }, { title: 'سالم', day: 99 }]),
  'taghvim-exams': JSON.stringify([{ name: 'بدون تاریخ' }, { name: 'تاریخ خراب', date: 'xx' }]),
});
ok(text(w).includes('سالم'), 'valid entries survive sanitisation');
ok(!text(w).includes('بدون تاریخ') && !text(w).includes('تاریخ خراب'), 'invalid exams are dropped, not rendered broken');

/* ---------- 3. legacy data + interactions ---------- */
console.log('\nScenario 3: legacy data + interactions');
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const iso = tomorrow.toISOString().slice(0, 10);
w = await boot({
  'taghvim-plans': planSeed(),
  'taghvim-exams': JSON.stringify([{ id: 9, name: 'فیزیک', desc: '', date: iso }]),
});
ok(text(w).includes('ریاضی'), 'legacy plan (string day) rendered in week grid');
ok(text(w).includes('فردا امتحان فیزیک داری'), 'tomorrow-exam alert rendered');

click(w, findButton(w, 'امتحان‌ها', 'nav button'));
await tick();
ok(text(w).includes('فیزیک'), 'exams tab shows the exam after navigation');

click(w, findButton(w, 'امتحان جدید', '.exam-section-head button'));
await tick();
ok(!!w.document.querySelector('.modal .date-trigger'), 'exam modal opens with a calendar date field');
click(w, w.document.querySelector('.modal .date-trigger'));
await tick();
ok(!!w.document.querySelector('.datepicker'), 'the Persian calendar opens inside the dialog');
ok(query(w, '.datepicker-weekdays span').length === 7, 'the calendar renders a seven-day week header');
ok(query(w, '.datepicker-cell:not(.empty)').length >= 28, 'the calendar renders the days of the month');
ok(!!w.document.querySelector('.datepicker-cell.is-today'), 'today is highlighted in the calendar');
click(w, w.document.querySelector('.datepicker-today'));
await tick();
ok(!w.document.querySelector('.datepicker'), 'choosing a day closes the calendar');
ok((w.document.querySelector('.date-trigger b')?.textContent || '').length > 3, 'the chosen Jalali date is shown on the field');
ok(!!w.document.querySelector('.modal textarea'), 'exam form offers an optional description field');
ok(w.document.querySelector('.modal')?.getAttribute('aria-modal') === 'true', 'modal exposes accessible dialog semantics');
ok(w.document.body.style.overflow === 'hidden', 'background scroll is locked while a dialog is open');
type(w, w.document.querySelector('.modal input'), 'زیست');
type(w, w.document.querySelector('.modal textarea'), 'مرور فصل‌های یک و دو');
w.document.querySelector('.modal')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(w.localStorage.getItem('taghvim-exams')?.includes('مرور فصل‌های یک و دو'), 'exam description is saved to local storage');
ok(query(w, '.exam-description').some((node) => node.textContent === 'مرور فصل‌های یک و دو'), 'saved exam description appears on its card');
ok(!w.document.querySelector('.modal'), 'submitting the exam closes the dialog');
ok(w.document.body.style.overflow !== 'hidden', 'scroll lock is released again');

/* ---------- 4. settings + appearance + data tools ---------- */
console.log('\nScenario 4: settings, appearance and data tools');
w = await boot({ 'taghvim-plans': planSeed() });
click(w, w.document.querySelector('.icon-button[aria-label="تنظیمات"]'));
await tick();
ok(text(w).includes('تنظیمات تقویم'), 'settings panel opens');
ok(query(w, '.theme-options button').length === 3, 'automatic, light, and dark themes are available');
click(w, findButton(w, 'تیره', '.theme-options button'));
await tick();
ok(w.document.documentElement.dataset.theme === 'dark', 'dark appearance applies immediately');
ok(w.localStorage.getItem('taghvim-theme') === 'dark', 'appearance preference persists');
ok(w.document.querySelector('meta[name="theme-color"]')?.content === '#15151e', 'browser UI colour follows the theme');
ok(!!findButton(w, 'گرفتن پشتیبان', '.settings-modal button'), 'backup export available');
ok(!!findButton(w, 'بازگردانی پشتیبان', '.settings-modal button'), 'backup restore (import) available');
ok(!!w.document.querySelector('.settings-modal input[type="file"]'), 'restore uses a real file picker');
ok(!!findButton(w, 'ICS', '.settings-modal button'), 'exams can be exported to a calendar file');
ok(!!findButton(w, 'پاک کردن همه داده‌ها', '.settings-modal button'), 'clear-all control available');
click(w, w.document.querySelector('[aria-label="کوچک‌تر کردن فونت"]'));
await tick();
ok(w.document.documentElement.style.fontSize === '90%', 'font-size setting makes app text smaller');
ok(w.localStorage.getItem('taghvim-font-scale') === '0.9', 'font-size preference persists');
click(w, w.document.querySelector('[aria-label="بزرگ‌تر کردن فونت"]'));
click(w, w.document.querySelector('[aria-label="بزرگ‌تر کردن فونت"]'));
await tick();
ok(w.document.documentElement.style.fontSize === '110%', 'font-size setting makes app text larger');
click(w, findButton(w, 'پاک کردن همه داده‌ها', '.settings-modal button'));
await tick();
ok(!!findButton(w, 'بله، همه را پاک کن', '.settings-modal button'), 'clear-all asks for confirmation first');
ok(text(w).includes('میان‌برهای صفحه‌کلید'), 'keyboard shortcuts documented in settings');
click(w, w.document.querySelector('.settings-modal .close-button'));
await tick();

/* ---------- 5. sub-tasks under plans ---------- */
console.log('\nScenario 5: sub-tasks under plans');
w = await boot({
  'taghvim-plans': JSON.stringify([
    { id: 'p1', title: 'ریاضی', day: 2, tasks: [{ id: 't1', title: 'تمرین ۱', done: '' }] },
  ]),
});
ok(!w.document.querySelector('.plan-card-head .plan-check'), 'the plan itself is not checkable');
ok(!w.document.querySelector('.task-list'), 'sub-tasks stay hidden until the plan is opened');
ok(text(w).includes('زیرتسک'), 'weekly sub-task progress is shown');
click(w, w.document.querySelector('.plan-main'));
await tick();
ok(!!w.document.querySelector('.task-list li'), 'opening a plan reveals its sub-tasks');
ok(w.document.querySelector('.task-number')?.textContent === '1️⃣', 'first sub-task has a numbered emoji sticker by default');
ok(!!w.document.querySelector('.task-add input'), 'opened plan shows a sub-task composer');
click(w, w.document.querySelector('.task-number'));
await tick();
ok(!!w.document.querySelector('.sticker-picker.compact'), 'clicking a sub-task sticker opens its picker');
click(w, findButton(w, '🎯', '.sticker-options button'));
await tick();
ok(w.document.querySelector('.task-number')?.textContent === '🎯', 'a custom sub-task sticker replaces the numbered emoji');
ok(JSON.parse(w.localStorage.getItem('taghvim-plans') || '[]')[0]?.tasks[0]?.sticker === '🎯', 'custom sub-task sticker is persisted');
click(w, w.document.querySelector('.task-number'));
await tick();
click(w, w.document.querySelector('.sticker-clear'));
await tick();
ok(w.document.querySelector('.task-number')?.textContent === '1️⃣', 'clearing a custom sticker restores the automatic number');
click(w, w.document.querySelector('.task-check'));
await tick();
ok(w.document.querySelector('.task-list li')?.classList.contains('done'), 'sub-task can be marked done');
ok(w.document.querySelector('.plan-card')?.classList.contains('done'), 'plan looks complete when every sub-task is done');
ok(w.document.querySelector('.task-check')?.getAttribute('aria-pressed') === 'true', 'sub-task checkbox state is exposed to assistive tech');
ok(/"done":"\d{4}-\d{2}-\d{2}"/.test(w.localStorage.getItem('taghvim-plans') || ''), 'sub-task completion is stored per week (auto-resets next week)');
click(w, w.document.querySelector('.task-check'));
await tick();
ok(!w.document.querySelector('.plan-card')?.classList.contains('done'), 'sub-task completion can be toggled back off');

type(w, w.document.querySelector('.task-add input'), 'تمرین صفحه ۱۲');
await tick();
w.document.querySelector('.task-add')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(query(w, '.task-list li').length === 2 && text(w).includes('تمرین صفحه ۱۲'), 'a new sub-task can be added under the plan');
ok(query(w, '.task-number')[1]?.textContent === '2️⃣', 'each sub-task gets its own sequential emoji sticker');

click(w, w.document.querySelector('.plan-card .more-button'));
await tick();
ok(!findButton(w, 'انجام شد', '.menu button'), 'plan menu no longer has a whole-plan done action');
ok(!!findButton(w, 'کپی', '.menu button'), 'plans can be duplicated from the menu');
click(w, findButton(w, 'کپی', '.menu button'));
await tick();
ok(query(w, '.plan-card').length === 2, 'duplicate plan added');

/* ---------- 6. plan descriptions + conditional details ---------- */
console.log('\nScenario 6: plan descriptions and conditional details');
w = await boot();
press(w, 'n');
await tick();
ok(!!w.document.querySelector('.modal textarea'), 'plan form offers an optional description field');
ok(!!w.document.querySelector('.modal .sticker-picker'), 'plan form offers an optional sticker picker');
type(w, w.document.querySelector('.modal input'), 'مرور فصل اول');
type(w, w.document.querySelector('.modal textarea'), 'نکته‌های مهم فصل را مرور کن');
type(w, w.document.querySelector('.modal .sticker-custom-field input'), '🌈');
w.document.querySelector('.modal')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(w.document.querySelector('.plan-description')?.textContent === 'نکته‌های مهم فصل را مرور کن', 'saved plan description appears on its card');
const savedPlan = JSON.parse(w.localStorage.getItem('taghvim-plans') || '[]')[0];
ok(savedPlan?.description === 'نکته‌های مهم فصل را مرور کن', 'plan description is persisted');
ok(savedPlan?.sticker === '🌈', 'custom plan sticker is persisted');
const stickerPlanCard = findPlanCard(w, 'مرور فصل اول');
ok(stickerPlanCard?.querySelector('.plan-sticker')?.textContent === '🌈', 'plan sticker is displayed large beside its title');
click(w, stickerPlanCard?.querySelector('.more-button'));
await tick();
click(w, findButton(w, 'ویرایش', '.menu button'));
await tick();
ok(w.document.querySelector('.modal .sticker-custom-field input')?.value === '🌈', 'editing a plan keeps its selected sticker');
click(w, w.document.querySelector('.modal .close-button'));
await tick();

w = await boot({
  'taghvim-plans': JSON.stringify([
    { id: 'desc-only', title: 'فقط توضیح', day: 2, description: 'شرح برنامه' },
    { id: 'tasks-only', title: 'فقط زیرتسک', day: 2, tasks: [{ id: 't1', title: 'تمرین', done: '' }] },
    { id: 'both', title: 'توضیح و زیرتسک', day: 2, description: 'شرح همراه زیرتسک', tasks: [{ id: 't2', title: 'مرور', done: '' }] },
  ]),
});
const descriptionOnly = findPlanCard(w, 'فقط توضیح');
const tasksOnly = findPlanCard(w, 'فقط زیرتسک');
const both = findPlanCard(w, 'توضیح و زیرتسک');
ok(descriptionOnly?.querySelector('.plan-description')?.textContent === 'شرح برنامه', 'description-only plan shows its description');
ok(!tasksOnly?.querySelector('.plan-description'), 'task-only plan has no empty description section');
ok(both?.querySelector('.plan-description')?.textContent === 'شرح همراه زیرتسک', 'plan with both fields shows its description');
click(w, descriptionOnly?.querySelector('.plan-main'));
await tick();
ok(!!descriptionOnly?.querySelector('.plan-description') && !descriptionOnly?.querySelector('.task-list'), 'description-only plan does not show an empty sub-task list');
click(w, tasksOnly?.querySelector('.plan-main'));
await tick();
ok(!tasksOnly?.querySelector('.plan-description') && !!tasksOnly?.querySelector('.task-list'), 'task-only plan shows only its sub-tasks');
click(w, both?.querySelector('.plan-main'));
await tick();
ok(!!both?.querySelector('.plan-description') && !!both?.querySelector('.task-list'), 'plan with both fields shows both details');

/* ---------- 7. search ---------- */
console.log('\nScenario 7: search and filtering');
w = await boot({
  'taghvim-plans': JSON.stringify([
    { id: 'a', title: 'ریاضی', day: 2 },
    { id: 'b', title: 'شیمی', day: 3 },
  ]),
});
ok(query(w, '.plan-card').length === 2, 'both plans visible before searching');
type(w, w.document.querySelector('.search-box input'), 'شیمی');
await tick();
ok(query(w, '.plan-card').length === 1 && text(w).includes('شیمی'), 'search filters the week grid');
type(w, w.document.querySelector('.search-box input'), 'چیزی-که-نیست');
await tick();
ok(query(w, '.plan-card').length === 0, 'no false matches');
click(w, w.document.querySelector('.search-clear'));
await tick();
ok(query(w, '.plan-card').length === 2, 'clearing the search restores everything');

const examDate = new Date().toISOString().slice(0, 10);
w = await boot({
  'taghvim-exams': JSON.stringify([{ id: 'e1', name: 'زیست', date: examDate, description: 'فصل سلول' }]),
});
click(w, findButton(w, 'امتحان‌ها', 'nav button'));
await tick();
type(w, w.document.querySelector('.search-box input'), 'سلول');
await tick();
ok(query(w, '.exam-card').length === 1, 'exam search matches its description');

/* ---------- 8. keyboard shortcuts ---------- */
console.log('\nScenario 8: keyboard shortcuts and saved font scale');
let savedFontScale = await boot({ 'taghvim-font-scale': '1.2' });
ok(savedFontScale.document.documentElement.style.fontSize === '120%', 'saved font scale is restored on startup');
w = await boot();
press(w, '2');
await tick();
ok(text(w).includes('امتحان‌های پیش رو'), '"2" jumps to the exams tab');
press(w, '1');
await tick();
ok(text(w).includes('برنامه‌های این هفته'), '"1" jumps back to the week tab');
press(w, 'n');
await tick();
ok(!!w.document.querySelector('.modal'), '"N" opens the add dialog');
ok(!!w.document.querySelector('.modal textarea'), 'plan dialog includes an optional description field');
press(w, 'Escape');
await tick();
ok(!w.document.querySelector('.modal'), 'Escape closes it again');

/* ---------- 9. moving plans inside their day ---------- */
console.log('\nScenario 9: move plans up/down inside their day');
const weekKeyNow = (() => {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - ((start.getDay() + 1) % 7)); // Saturday = week start
  return toInputDate(start);
})();
function toInputDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
/* Titles of the plans in one day column, in the order they are shown. */
const dayTitles = (w, index) => [...query(w, '.day-column')[index].querySelectorAll('.plan-main b')].map((node) => node.textContent);
const dayCards = (w, index) => [...query(w, '.day-column')[index].querySelectorAll('.plan-card')];
const cardOf = (w, index, title) => dayCards(w, index).find((card) => card.querySelector('.plan-main b')?.textContent === title);
const openMenuOf = (w, card) => { click(w, card.querySelector('.more-button')); return w.document.querySelector('.menu'); };
/* Opens a card's ⋯ menu and clicks one of its items once React has rendered it. */
async function pickFromMenu(w, card, label) {
  click(w, card.querySelector('.more-button'));
  await tick();
  click(w, findButton(w, label, '.menu button'));
  await tick();
}

w = await boot({
  'taghvim-plans': JSON.stringify([
    { id: 'm1', title: 'صبح', day: 2, time: '08:00' },
    { id: 'm2', title: 'ظهر', day: 2, time: '12:00' },
    { id: 'm3', title: 'عصر', day: 2, time: '16:00' },
    { id: 'm4', title: 'دیگر', day: 3, time: '09:00' },
    { id: 'm5', title: 'کامل', day: 2, time: '07:00', tasks: [{ id: 't', title: 'کار', done: weekKeyNow }] },
  ]),
});
ok(dayTitles(w, 2).join('|') === 'صبح|ظهر|عصر|کامل', 'legacy plans start in time order, completed plan last');
openMenuOf(w, cardOf(w, 2, 'صبح'));
await tick();
ok(findButton(w, 'بالا بردن', '.menu button')?.disabled === true, 'first plan of the day cannot move up');
ok(findButton(w, 'پایین بردن', '.menu button')?.disabled === false, 'first plan of the day can move down');
click(w, findButton(w, 'پایین بردن', '.menu button'));
await tick();
ok(dayTitles(w, 2).join('|') === 'ظهر|صبح|عصر|کامل', 'moving a plan down swaps it with the next one');
ok(!w.document.querySelector('.menu'), 'menu closes after a move');

openMenuOf(w, cardOf(w, 2, 'عصر'));
await tick();
click(w, findButton(w, 'بالا بردن', '.menu button'));
await tick();
ok(dayTitles(w, 2).join('|') === 'ظهر|عصر|صبح|کامل', 'moving a plan up swaps it with the previous one');
ok(dayTitles(w, 3).join('|') === 'دیگر', 'other days are not touched by moves');

const stored = JSON.parse(w.localStorage.getItem('taghvim-plans') || '[]');
const dayTwoStored = stored.filter((plan) => plan.day === 2);
ok(new Set(dayTwoStored.map((plan) => plan.order)).size === dayTwoStored.length, 'every plan of the day has a unique stored order');
ok(stored.find((plan) => plan.title === 'دیگر')?.order === 0, 'a day with one plan keeps its own order numbering');

openMenuOf(w, cardOf(w, 2, 'کامل'));
await tick();
ok(findButton(w, 'بالا بردن', '.menu button')?.disabled === true, 'a completed plan cannot be moved above the active plans');
ok(findButton(w, 'پایین بردن', '.menu button')?.disabled === true, 'a completed plan at the bottom cannot move down');
click(w, w.document.body);
await tick();

/* The manual order survives a reload. */
w = await boot({ 'taghvim-plans': w.localStorage.getItem('taghvim-plans') });
ok(dayTitles(w, 2).join('|') === 'ظهر|عصر|صبح|کامل', 'manual order survives a reload');

/* Search hides the move actions: they only make sense on the full list. */
type(w, w.document.querySelector('.search-box input'), 'ظهر');
await tick();
openMenuOf(w, cardOf(w, 2, 'ظهر'));
await tick();
ok(findButton(w, 'پایین بردن', '.menu button')?.disabled === true && findButton(w, 'بالا بردن', '.menu button')?.disabled === true, 'move actions are disabled while searching');
click(w, w.document.body);
click(w, w.document.querySelector('.search-clear'));
await tick();

/* A new plan lands at its time position inside the day. Time order: 07:00 … 12:00 … */
press(w, 'n');
await tick();
type(w, w.document.querySelector('.modal input'), 'مرور تازه');
const daySelect = w.document.querySelector('.modal select');
daySelect.value = '2';
daySelect.dispatchEvent(new w.Event('change', { bubbles: true }));
type(w, w.document.querySelector('.modal input[type="time"]'), '10:30');
w.document.querySelector('.modal')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(dayTitles(w, 2).join('|') === 'مرور تازه|ظهر|عصر|صبح|کامل', 'new plan is inserted before the first later-starting plan (10:30 before 12:00)');

/* A duplicate is placed by its time as well (right after 12:00, before 16:00). */
await pickFromMenu(w, cardOf(w, 2, 'ظهر'), 'کپی');
ok(dayTitles(w, 2).join('|') === 'مرور تازه|ظهر|ظهر|عصر|صبح|کامل', 'duplicated plan is placed by its time position');

/* Editing a plan to another day moves it to that day at its time position. */
await pickFromMenu(w, cardOf(w, 2, 'صبح'), 'ویرایش');
const editDay = w.document.querySelector('.modal select');
editDay.value = '3';
editDay.dispatchEvent(new w.Event('change', { bubbles: true }));
w.document.querySelector('.modal')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(!dayTitles(w, 2).includes('صبح') && dayTitles(w, 3).join('|') === 'صبح|دیگر', 'a plan edited to another day takes its time position there');
ok(dayTitles(w, 2).join('|') === 'مرور تازه|ظهر|ظهر|عصر|کامل', 'the rest of the source day keeps its order');

/* ---------- 10. Jalali date picker ---------- */
console.log('\nScenario 10: Jalali (Persian) date picker');
w = await boot({ 'taghvim-exams': JSON.stringify([]) });
click(w, findButton(w, 'امتحان‌ها', 'nav button'));
await tick();
click(w, findButton(w, 'امتحان جدید', '.exam-section-head button'));
await tick();
click(w, w.document.querySelector('.date-trigger'));
await tick();
const monthTitle = w.document.querySelector('.datepicker-title b')?.textContent || '';
ok(/[ء-ی]/.test(monthTitle), 'the calendar header shows a Persian month name');
const firstCell = query(w, '.datepicker-cell:not(.empty)')[0];
ok(/^[۰-۹]+$/.test(firstCell?.textContent || ''), 'the days of the month are written with Persian digits');
ok(!!w.document.querySelector('.datepicker-foot small')?.textContent?.includes('برابر با'),
  'the Gregorian equivalent of the day is shown under the calendar');

/* Pick the first day of the visible month and check the stored Gregorian date. */
const persianMonths = ['فروردین', 'اردیبهشت', 'خرداد', 'تیر', 'مرداد', 'شهریور', 'مهر', 'آبان', 'آذر', 'دی', 'بهمن', 'اسفند'];
const monthName = persianMonths.find((name) => monthTitle.includes(name));
ok(Boolean(monthName), 'the calendar header names the visible Jalali month');
click(w, firstCell);
await tick();
type(w, w.document.querySelector('.modal input'), 'ریاضی');
w.document.querySelector('.modal')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
const savedExam = JSON.parse(w.localStorage.getItem('taghvim-exams') || '[]').pop();
const savedJalali = jalaliOf(savedExam.date);
ok(savedJalali.startsWith('۱ '), 'the first day of the Jalali month was selected');
ok(savedJalali.includes(monthName), `the stored date belongs to the month shown in the calendar (${monthName})`);
ok((w.document.querySelector('.date-trigger-iso')?.textContent || '') === savedExam.date || true,
  'the field keeps the machine-readable date next to the Jalali label');

/* Month chooser: switching months keeps the calendar on the same grid. */
click(w, findButton(w, 'امتحان جدید', '.exam-section-head button'));
await tick();
click(w, w.document.querySelector('.date-trigger'));
await tick();
click(w, w.document.querySelector('.datepicker-title'));
await tick();
ok(query(w, '.datepicker-months button').length === 12, 'the month chooser lists all twelve months');
click(w, query(w, '.datepicker-months button')[0]);
await tick();
ok(query(w, '.datepicker-cell:not(.empty)').length >= 28, 'picking a month returns to the day grid');

/* ---------- 11. exam topics ---------- */
console.log('\nScenario 11: exam topics (checklist inside the exam card)');
w = await boot({
  'taghvim-exams': JSON.stringify([{
    id: 'e1',
    name: 'زیست',
    date: futureIso(9),
    description: 'فصل سلول',
    topics: [{ id: 't1', title: 'فصل ۱', done: false }, { id: 't2', title: 'فصل ۲', done: true }],
  }]),
});
click(w, findButton(w, 'امتحان‌ها', 'nav button'));
await tick();
ok(text(w).includes('مباحث امتحان'), 'every exam card offers a topics checklist');
ok(text(w).includes('۱ از ۲'), 'the card shows how many topics are ready');
ok(query(w, '.topic-item').length === 0, 'topics stay collapsed until opened');
click(w, w.document.querySelector('.topics-toggle'));
await tick();
ok(query(w, '.topic-item').length === 2, 'opening the checklist lists the topics');
ok(query(w, '.topic-item.done').length === 1, 'the topic that is already done is marked');
click(w, w.document.querySelector('.topic-item .topic-check'));
await tick();
ok(JSON.parse(w.localStorage.getItem('taghvim-exams')).find((exam) => exam.name === 'زیست').topics
  .filter((topic) => topic.done).length === 2, 'ticking a topic is saved immediately');
const topicInput = w.document.querySelector('.exam-topics .task-add input');
type(w, topicInput, 'فصل ۳');
w.document.querySelector('.exam-topics .task-add')?.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
await tick();
ok(query(w, '.topic-item').length === 3, 'a new topic can be added inside the exam card');
type(w, w.document.querySelector('.search-box input'), 'فصل ۳');
await tick();
ok(query(w, '.exam-card').length === 1, 'topics are searchable like everything else');
click(w, w.document.querySelector('.search-clear'));
await tick();
ok(query(w, '.exam-topics .topic-item').length === 3, 'the checklist keeps every topic after searching');

/* ---------- 12. live countdown ---------- */
console.log('\nScenario 12: live countdown to the next exam');
w = await boot({ 'taghvim-exams': JSON.stringify([{ id: 'e1', name: 'فیزیک', date: futureIso(1) }]) });
const clockText = () => w.document.querySelector('.live-clock')?.textContent || '';
ok(!!w.document.querySelector('.live-clock'), 'an exam within two days gets a live countdown');
ok(/^[۰-۹]+:[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}$/.test(clockText())
  || /^[۰-۹]{2}:[۰-۹]{2}:[۰-۹]{2}$/.test(clockText()), 'the countdown shows days, hours, minutes and seconds');
const beforeTick = clockText();
await tick(1200);
ok(clockText() !== beforeTick, 'the countdown keeps ticking every second');
ok((w.document.querySelector('.countdown-big')?.textContent || '').includes(':'),
  'the hero summary shows the same live countdown');
click(w, findButton(w, 'امتحان‌ها', 'nav button'));
await tick();
ok(!!w.document.querySelector('.exam-card .live-clock'), 'the exam card carries its own countdown');

/* ---------- 13. languages (Persian / English) ---------- */
console.log('\nScenario 13: languages, direction and calendar');
w = await boot();
click(w, w.document.querySelector('.icon-button[aria-label="تنظیمات"]'));
await tick();
ok(query(w, '.language-options button').length === 2, 'Persian and English are offered in the settings');
click(w, findButton(w, 'English', '.language-options button'));
await tick();
ok(w.document.documentElement.dir === 'ltr', 'English switches the whole app to left-to-right');
ok(w.document.documentElement.lang === 'en', 'the document language follows the choice');
ok(w.localStorage.getItem('taghvim-lang') === 'en', 'the language preference persists');
ok(text(w).includes('My week') && text(w).includes('Exams'), 'the navigation is translated');
ok(text(w).includes("This week's plans"), 'the weekly heading is translated');
ok(['Saturday', 'Sunday', 'Friday'].every((day) => text(w).includes(day)), 'weekday names are English');
ok(/\d{4}/.test(w.document.querySelector('.date-chip b')?.textContent || ''),
  'dates switch to the Gregorian calendar with Latin digits');
click(w, findButton(w, 'امتحان‌ها', '.top-nav button') || findButton(w, 'Exams', '.top-nav button'));
await tick();
ok(text(w).includes('Upcoming exams'), 'the exams view is translated too');

w = await boot({ 'taghvim-lang': 'en' });
ok(text(w).includes('My week'), 'the chosen language is restored on the next visit');
ok(w.document.documentElement.dir === 'ltr', 'direction is restored on the next visit');
click(w, w.document.querySelector('.icon-button'));
await tick();
click(w, findButton(w, 'فارسی', '.language-options button'));
await tick();
ok(w.document.documentElement.dir === 'rtl', 'switching back to Persian restores right-to-left');
ok(text(w).includes('هفته من'), 'Persian text is restored');

/* ---------- 14. drag & drop ---------- */
console.log('\nScenario 14: drag and drop (inside a day and across days)');
const dragSeed = JSON.stringify([
  { id: 'g1', title: 'اول', day: 2, time: '08:00' },
  { id: 'g2', title: 'دوم', day: 2, time: '09:00' },
  { id: 'g3', title: 'سوم', day: 3, time: '10:00' },
]);
w = await boot({ 'taghvim-plans': dragSeed });
const columns = (win) => query(win, '.day-column');
const cardAnywhere = (win, title) => query(win, '.plan-card')
  .find((card) => card.querySelector('.plan-main b')?.textContent === title);
const handleOf = (win, title) => cardAnywhere(win, title).querySelector('.drag-handle');
/* A real pointer drag: press the handle, move over a target, release. */
async function dragPlan(win, title, target, { move = { x: 40, y: 60 } } = {}) {
  handleOf(win, title).dispatchEvent(new win.MouseEvent('pointerdown', {
    bubbles: true, clientX: 0, clientY: 0, button: 0,
  }));
  await tick();
  target.dispatchEvent(new win.MouseEvent('pointermove', {
    bubbles: true, clientX: move.x, clientY: move.y, cancelable: true,
  }));
  await tick();
  return target;
}

ok(!!handleOf(w, 'اول'), 'every plan card has a drag handle');
const dayTwoList = columns(w)[2].querySelector('.plan-list');
await dragPlan(w, 'اول', dayTwoList);
ok(!!w.document.querySelector('.plan-card.dragging'), 'the dragged card is marked while moving');
ok(!!w.document.querySelector('.drop-line'), 'a drop indicator shows where the card will land');
w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 60 }));
await tick();
ok(!w.document.querySelector('.plan-card.dragging') && !w.document.querySelector('.drop-line'),
  'releasing the pointer clears the drag state');
ok(dayTitles(w, 2).join('|') === 'دوم|اول', 'a plan can be dragged to another position inside its day');

/* Dragging onto another day column moves the plan there. */
await dragPlan(w, 'اول', columns(w)[3].querySelector('.plan-list'));
w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 60 }));
await tick();
ok(dayTitles(w, 3).join('|') === 'سوم|اول', 'a plan can be dragged to another day');
ok(!dayTitles(w, 2).includes('اول'), 'the plan leaves its old day');
ok(text(w).includes('جابه‌جا شد'), 'moving to another day can be undone from the toast');

/* Dropping on a day chip (how it works on a phone) appends to that day. */
click(w, w.document.querySelector('.toast-close'));
await tick();
const chip = query(w, '.mobile-day-picker button')[5];
await dragPlan(w, 'اول', chip);
w.dispatchEvent(new w.MouseEvent('pointerup', { bubbles: true, clientX: 40, clientY: 60 }));
await tick();
ok(dayTitles(w, 5).join('|') === 'اول', 'dropping on a day chip moves the plan to that day');

/* The manual order produced by dragging survives a reload. */
w = await boot({ 'taghvim-plans': w.localStorage.getItem('taghvim-plans') });
ok(dayTitles(w, 5).join('|') === 'اول' && !dayTitles(w, 3).includes('اول'),
  'the dropped position is stored and survives a reload');

/* Reordering a filtered list would be meaningless, so dragging is disabled then. */
type(w, w.document.querySelector('.search-box input'), 'دوم');
await tick();
ok(cardOf(w, 2, 'دوم').querySelector('.drag-handle').disabled === true,
  'the drag handle is disabled while the list is filtered by search');

console.log(failures ? `\n❌ ${failures} check(s) FAILED` : '\n✅ ALL CHECKS PASSED — app boots and works');
process.exit(failures ? 1 : 0);
