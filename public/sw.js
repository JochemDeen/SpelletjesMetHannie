// public/sw.js: the service worker, only for push notifications (no caching).
// Served from the root so it may open every page of the site.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Messages from the server: { title, body, url, tag }
self.addEventListener('push', (event) => {
    let data = {};
    try {
        data = event.data ? event.data.json() : {};
    } catch (error) {
        data = { body: event.data ? event.data.text() : '' };
    }
    event.waitUntil(self.registration.showNotification(data.title || 'Spelletjes met Hannie', {
        body: data.body || '',
        icon: '/web-app-manifest-192x192.png',
        badge: '/favicon-96x96.png',
        tag: data.tag,
        renotify: !!data.tag,
        data: { url: data.url || '/dashboard' }
    }));
});

// Tapping the message opens its page, in an open tab of the site if there is one
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = new URL(event.notification.data?.url || '/dashboard', self.location.origin).href;
    event.waitUntil((async () => {
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const open = windows.find((client) => new URL(client.url).origin === self.location.origin);
        if (open) {
            try {
                const client = open.url === url ? open : await open.navigate(url);
                if (client) {
                    await client.focus();
                    return;
                }
            } catch (error) {
                // A tab this worker doesn't control can't be navigated: open a new one
            }
        }
        await self.clients.openWindow(url);
    })());
});
