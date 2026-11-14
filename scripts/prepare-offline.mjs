/* Version public PWA files, cache every local bundle/static helper, and inject
   Vite's fingerprinted app assets into the production service-worker shell. */
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const assetsDir = join(rootDir, 'assets');
const workerPath = join(rootDir, 'sw.js');
const indexPath = join(rootDir, 'index.html');
const offlinePagePath = join(rootDir, 'offline.html');
const versionJsonPath = join(rootDir, 'app-version.json');
const offlineJsPath = join(rootDir, 'js', 'offline.js');
const webManifestPath = join(rootDir, 'manifest.webmanifest');
const jsonManifestPath = join(rootDir, 'manifest.json');
const marker = '/*__TAGHVIM_PRECACHE_ASSETS__*/';
const packageJson = JSON.parse(readFileSync(join(rootDir, 'package.json'), 'utf8'));
const version = packageJson.version;

if (!/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(version)) {
  throw new Error(`Invalid app version in package.json: ${version}`);
}

function listFiles(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? listFiles(path) : entry.isFile() ? [path] : [];
  });
}

const toPosix = (path) => path.split(sep).join('/');
const assetFiles = listFiles(assetsDir)
  .map((path) => toPosix(relative(assetsDir, path)))
  .filter((file) => !file.endsWith('.map'))
  .sort();
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

const manifest = JSON.parse(readFileSync(webManifestPath, 'utf8'));
if (!Array.isArray(manifest.display_override) || manifest.display_override.length === 0) {
  throw new Error('manifest.webmanifest must include display_override.');
}
writeFileSync(jsonManifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

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

const cssFiles = listFiles(join(rootDir, 'css'))
  .filter((path) => /\.css$/i.test(path))
  .map((path) => toPosix(relative(rootDir, path)));
const jsFiles = listFiles(join(rootDir, 'js'))
  .filter((path) => /\.js$/i.test(path))
  .map((path) => toPosix(relative(rootDir, path)));
const audioPattern = /\.(?:mp3|m4a|wav|ogg|opus|aac|flac)$/i;
const audioFiles = [
  ...readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && audioPattern.test(entry.name))
    .map((entry) => join(rootDir, entry.name)),
  ...['audio', 'sounds', 'sound']
    .flatMap((directory) => listFiles(join(rootDir, directory)))
    .filter((path) => audioPattern.test(path)),
].map((path) => toPosix(relative(rootDir, path)));
const iconFiles = [
  ...readdirSync(rootDir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^icon[-.].+/i.test(entry.name))
    .map((entry) => entry.name),
  ...listFiles(join(rootDir, 'icons')).map((path) => toPosix(relative(rootDir, path))),
];
const precachePaths = [...new Set([
  ...assetFiles.map((file) => `assets/${file}`),
  ...cssFiles,
  ...jsFiles,
  ...audioFiles,
  ...iconFiles,
])].sort();
const shellFiles = [
  'index.html',
  'offline.html',
  'manifest.json',
  'manifest.webmanifest',
  'icon.svg',
  'app-version.json',
];
const precachedFiles = [...new Set([...precachePaths, ...shellFiles])]
  .map((file) => [join(rootDir, file), file]);
for (const [filePath] of precachedFiles) {
  if (!existsSync(filePath)) throw new Error(`Required offline shell file is missing: ${filePath}`);
}

const buildHash = createHash('sha256').update(workerSource).update(`\nversion:${version}`);
for (const [filePath, fileName] of precachedFiles) {
  buildHash.update('\n').update(fileName).update('\n').update(readFileSync(filePath));
}
const buildId = buildHash.digest('hex').slice(0, 12);
const precacheList = precachePaths
  .map((file) => JSON.stringify(`${file}?v=${version}`))
  .join(',\n  ');
const productionWorker = workerSource
  .replace(marker, precacheList)
  .replaceAll('__LP_APP_VERSION__', version)
  .replace('__TAGHVIM_BUILD_ID__', buildId);
if (productionWorker.includes('__TAGHVIM_') || productionWorker.includes('__LP_APP_VERSION__')) {
  throw new Error('The generated service worker still contains unfilled build markers.');
}

writeFileSync(workerPath, productionWorker);
console.log(`Prepared offline app shell v${version} (${precachedFiles.length} files, cache taghvim-v${version}-${buildId}).`);
