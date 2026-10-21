import { cp, mkdir, writeFile } from 'node:fs/promises';
import { readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
await mkdir('dist/assets', { recursive: true });
await cp('assets/crests', 'dist/assets/crests', { recursive: true });
await cp('data', 'dist/data', { recursive: true });
await cp('legacy.html', 'dist/legacy.html');
for (const file of await readdir('.')) {
  if (/^v\d+.*\.js$/.test(file)) await cp(file, `dist/${file}`);
}
await writeFile('dist/.nojekyll', '');

const appAssets = (await readdir('dist/assets')).filter(file => /\.(js|css|woff2)$/.test(file)).sort();
const cacheVersion = createHash('sha256').update(appAssets.join('|')).digest('hex').slice(0, 16);
const precache = ['./', './index.html', './favicon.svg', './FONT-LICENSE.txt', ...appAssets.map(file => `./assets/${file}`)];
await writeFile('dist/sw.js', `
const CACHE = 'kball-offline-${cacheVersion}';
const ASSETS = ${JSON.stringify(precache)};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('kball-offline-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET' || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request).then(response => {
      if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
      return response;
    }).catch(async () => (await caches.match(event.request)) || (await caches.match(new URL('./index.html', self.registration.scope))) || Response.error()));
    return;
  }
  event.respondWith(caches.match(event.request).then(cached => cached || fetch(event.request).then(response => {
    if (response.ok) { const copy = response.clone(); caches.open(CACHE).then(cache => cache.put(event.request, copy)); }
    return response;
  })));
});
`);
