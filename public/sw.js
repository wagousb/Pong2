const CACHE_NAME = 'pong-v1';
const ASSETS = [
    '/',
    '/index.html',
    '/style.css',
    '/game.js',
    '/manifest.json',
    'https://fonts.googleapis.com/css2?family=Press+Start+2P&display=swap',
    'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js',
    'https://unpkg.com/html5-qrcode'
];

// Install Event
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(ASSETS);
        })
    );
});

// Fetch Event
self.addEventListener('fetch', (event) => {
    event.respondWith(
        caches.match(event.request).then((response) => {
            return response || fetch(event.request);
        })
    );
});
