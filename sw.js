const CACHE='al-ikhwan-offline-v1';
const ASSETS=['./','./index.html','./style.css?v=44','./script.js?v=offline1','./offline-db.js','./offline-config.js','./manifest.json?v=2','./favicon.png?v=1','./icon-192.png?v=2','./icon-512.png','./Al%20ikhwan%20logo.jpg'];
self.addEventListener('install',e=>e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)).then(()=>self.skipWaiting())));
self.addEventListener('activate',e=>e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;e.respondWith(caches.match(e.request).then(r=>r||fetch(e.request).then(res=>{const copy=res.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return res}).catch(()=>caches.match('./index.html'))));});
