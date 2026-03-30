// public/service-worker.js
const CACHE_NAME = 'babycry-ai-cache-v1';
const urlsToCache = [
  '/',
  '/index.html',
  '/favicon.ico',
  '/logo192.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(urlsToCache))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request)
      .then((response) => response || fetch(event.request))
  );
});

// ✅ 백그라운드 푸시 알림 수신 리스너
self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : { title: 'BabyCry 알림', body: '아기 상태를 확인하세요!' };
  
  const options = {
    body: data.body,
    icon: '/logo192.png',
    badge: '/favicon.ico',
    vibrate: [200, 100, 200],
    data: { url: data.url || '/' }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// ✅ 알림 클릭 시 앱으로 이동
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
