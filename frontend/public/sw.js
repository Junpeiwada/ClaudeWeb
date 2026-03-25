// Service Worker - PWA登録用（オフラインキャッシュは不要、ローカルサーバー前提）
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
