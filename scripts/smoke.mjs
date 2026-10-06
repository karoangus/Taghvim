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
ok(!!w.document.querySelector('.modal input[type="date"]'), 'exam modal opens with a date field');
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

console.log(failures ? `\n❌ ${failures} check(s) FAILED` : '\n✅ ALL CHECKS PASSED — app boots and works');
process.exit(failures ? 1 : 0);
