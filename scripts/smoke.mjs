/* Functional smoke test: executes the REAL production bundle in a DOM
   and verifies that the production app renders and responds — not a white screen.
   Scenarios:
     1. fresh device and the main responsive planner UI
     2. corrupted localStorage (must never cause a permanent white screen)
     3. legacy data + navigation + exam modal
     4. settings and appearance controls
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

const text = (w) => w.document.getElementById('root').textContent || '';
const query = (w, sel) => [...w.document.querySelectorAll(sel)];
const findButton = (w, label, sel = 'button') => query(w, sel).find((b) => (b.textContent || '').includes(label));

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

/* ---------- 2. corrupted localStorage ---------- */
console.log('\nScenario 2: corrupted localStorage (old white-screen cause)');
w = await boot({ 'taghvim-plans': '{invalid json!!!', 'taghvim-exams': '{"not":"an array"}' });
ok(text(w).includes('برنامه‌های این هفته'), 'app still renders despite corrupted storage');
ok(!text(w).includes('مشکلی پیش آمد'), 'error boundary not triggered');

/* ---------- 3. legacy data + interactions ---------- */
console.log('\nScenario 3: legacy data + interactions');
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const iso = tomorrow.toISOString().slice(0, 10);
w = await boot({
  'taghvim-plans': JSON.stringify([{ id: 1, title: 'ریاضی', desc: 'فصل ۲', day: '2', color: '#111111' }]),
  'taghvim-exams': JSON.stringify([{ id: 9, name: 'فیزیک', desc: '', date: iso }]),
});
ok(text(w).includes('ریاضی'), 'legacy plan (string day) rendered in week grid');
ok(text(w).includes('فردا امتحان فیزیک داری'), 'tomorrow-exam alert rendered');

findButton(w, 'امتحان‌ها', 'nav button')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
ok(text(w).includes('فیزیک'), 'exams tab shows the exam after navigation');

findButton(w, 'امتحان جدید', '.exam-section-head button')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
ok(!!w.document.querySelector('.modal input[type="date"]'), 'exam modal opens with a date field');
ok(w.document.querySelector('.modal')?.getAttribute('aria-modal') === 'true', 'modal exposes accessible dialog semantics');

/* ---------- 4. settings + appearance ---------- */
console.log('\nScenario 4: settings and appearance');
w.document.querySelector('.modal .close-button')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 20));
w.document.querySelector('.icon-button[aria-label="تنظیمات"]')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
ok(text(w).includes('تنظیمات تقویم'), 'settings panel opens');
ok(query(w, '.theme-options button').length === 3, 'automatic, light, and dark themes are available');
findButton(w, 'تیره', '.theme-options button')?.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
await new Promise((r) => setTimeout(r, 30));
ok(w.document.documentElement.dataset.theme === 'dark', 'dark appearance applies immediately');
ok(w.localStorage.getItem('taghvim-theme') === 'dark', 'appearance preference persists');

console.log(failures ? `\n❌ ${failures} check(s) FAILED` : '\n✅ ALL CHECKS PASSED — app boots and works');
process.exit(failures ? 1 : 0);
