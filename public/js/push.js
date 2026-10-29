// public/js/push.js: turning push notifications on/off for this device.
// Used by Settings (the switch) and the dashboard (keeping the server's copy
// of this device's subscription linked to whoever is logged in).

const Push = (() => {
    const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

    // iPhone/iPad only allow push for a site added to the home screen
    const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent)
        || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

    function urlBase64ToUint8Array(base64) {
        const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
    }

    function register() {
        return navigator.serviceWorker.register('/sw.js');
    }

    async function getSubscription() {
        if (!supported) return null;
        const registration = await navigator.serviceWorker.getRegistration('/');
        return registration ? registration.pushManager.getSubscription() : null;
    }

    // Asks permission and subscribes. Call straight from the click/change
    // handler: Safari only shows the permission question for a user action.
    async function enable(publicKey) {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('Je browser staat meldingen voor deze site niet toe. Zet ze aan in de instellingen van je browser.');
        }
        const registration = await register();
        await navigator.serviceWorker.ready;
        let subscription = await registration.pushManager.getSubscription();
        if (!subscription) {
            subscription = await registration.pushManager.subscribe({
                userVisibleOnly: true,
                applicationServerKey: urlBase64ToUint8Array(publicKey)
            });
        }
        await api('/settings/api/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
    }

    async function disable() {
        const subscription = await getSubscription();
        if (!subscription) return;
        await api('/settings/api/push/unsubscribe', { method: 'POST', body: { endpoint: subscription.endpoint } });
        await subscription.unsubscribe();
    }

    // Re-sends this device's subscription, so it belongs to the user who is
    // logged in now (and comes back if the server dropped it). Silent.
    async function sync() {
        try {
            if (!supported || Notification.permission !== 'granted') return;
            const subscription = await getSubscription();
            if (subscription) {
                await api('/settings/api/push/subscribe', { method: 'POST', body: { subscription: subscription.toJSON() } });
            }
        } catch (error) {
            console.error('Push sync failed:', error);
        }
    }

    return { supported, isIos, isStandalone, getSubscription, enable, disable, sync };
})();
