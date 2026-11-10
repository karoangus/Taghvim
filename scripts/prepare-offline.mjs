/* Version public PWA files, update every local stylesheet/script URL, then inject
   Vite's fingerprinted bundles into the production service worker precache. */
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(rootDir, 'assets');
const workerPath = join(rootDir, 'sw.js');
const indexPath = join(rootDir, 'index.html');
const offlinePagePath = join(rootDir, 'offline.html');
const versionJsonPath = join(rootDir, 'app-version.json');
const offlineJsPath = join(rootDir, 'js', 'offline.js');
const marker = '/*__TAGHVIM_PRECACHE_ASSETS__*/';
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
  throw new Error(`Invalid app version in package.json: ${version}`);
}

const assetFiles = readdirSync(assetsDir).filter((file) => !file.endsWith('.map')).sort();
if (!assetFiles.some((file) => /\.js$/i.test(file)) || !assetFiles.some((file) => /\.css$/i.test(file))) {
  throw new Error('The production app bundle or stylesheet is missing from assets/.');
}

function addVersionToLocalAssets(html) {
  return html.replace(/((?:src|href)=["'])([^"']+)(["'])/gi, (match, before, url, after) => {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/|#)/i.test(url)) return match;
    const path = url.split(/[?#]/, 1)[0];
    const query = new URLSearchParams(url.split('?')[1] || '');
    if (!/\.(?:m?js|css|json|webmanifest|svg)$/i.test(path) && !query.has('v')) return match;
    query.set('v', version);
    return `${before}${path}?${query.toString()}${after}`;
  });
}

let indexHtml = addVersionToLocalAssets(readFileSync(indexPath, 'utf8'));
let offlineHtml = addVersionToLocalAssets(readFileSync(offlinePagePath, 'utf8'))
  .replaceAll('__LP_APP_VERSION__', version);
if (offlineHtml.includes('__LP_APP_VERSION__')) throw new Error('Could not replace the offline page version marker.');
const htmlAssetReferences = [...indexHtml.matchAll(/(?:src|href)=["']\.\/assets\/([^"'?#]+)["']/g)]
  .map((match) => `assets/${match[1]}`);
const emittedAssetPaths = new Set(assetFiles.map((file) => `assets/${file}`));
const missingAssets = htmlAssetReferences.filter((file) => !emittedAssetPaths.has(file));
if (missingAssets.length) {
  throw new Error(`App shell references files that are not present in assets/: ${missingAssets.join(', ')}`);
}

const versionJsonSource = readFileSync(versionJsonPath, 'utf8');
if (!versionJsonSource.includes('__LP_APP_VERSION__')) {
  throw new Error('app-version.json is missing its version marker.');
}
const versionJson = versionJsonSource.replaceAll('__LP_APP_VERSION__', version);
if (JSON.parse(versionJson).version !== version) throw new Error('app-version.json does not match package.json.');

const offlineJsSource = readFileSync(offlineJsPath, 'utf8');
if (!offlineJsSource.includes('__LP_APP_VERSION__')) {
  throw new Error('js/offline.js is missing its version marker.');
}
const offlineJs = offlineJsSource.replaceAll('__LP_APP_VERSION__', version);
if (offlineJs.includes('__LP_APP_VERSION__')) throw new Error('Could not replace the offline helper version marker.');

const workerSource = readFileSync(workerPath, 'utf8');
if (!workerSource.includes(marker) || !workerSource.includes('__LP_APP_VERSION__')
  || !workerSource.includes('__TAGHVIM_BUILD_ID__')) {
  throw new Error('The production service-worker template is missing its build markers.');
}

writeFileSync(indexPath, indexHtml);
writeFileSync(offlinePagePath, offlineHtml);
writeFileSync(versionJsonPath, versionJson);
writeFileSync(offlineJsPath, offlineJs);

const buildHash = createHash('sha256').update(workerSource).update(`\nversion:${version}`);
const precachedFiles = [
  ...assetFiles.map((file) => [join(assetsDir, file), `assets/${file}`]),
  ...['index.html', 'offline.html', 'manifest.webmanifest', 'icon.svg', 'app-version.json', 'css/offline.css', 'js/offline.js']
    .map((file) => [join(rootDir, file), file]),
];
for (const [filePath, fileName] of precachedFiles) {
  buildHash.update('\n').update(fileName).update('\n').update(readFileSync(filePath));
}
const buildId = buildHash.digest('hex').slice(0, 12);
const precacheList = assetFiles
  .map((file) => JSON.stringify(`assets/${file}?v=${version}`))
  .join(',\n  ');
const productionWorker = workerSource
  .replace(marker, precacheList)
  .replaceAll('__LP_APP_VERSION__', version)
  .replace('__TAGHVIM_BUILD_ID__', buildId);
if (productionWorker.includes('__TAGHVIM_') || productionWorker.includes('__LP_APP_VERSION__')) {
  throw new Error('The generated service worker still contains unfilled build markers.');
}

writeFileSync(workerPath, productionWorker);
console.log(`Prepared offline app shell v${version} (${precachedFiles.length} files, cache ${`taghvim-v${version}-${buildId}`}).`);
