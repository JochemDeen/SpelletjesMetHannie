// public/js/settings.js: joining Pictionary / Wie ben ik, notifications, and light or dark mode

const JOIN_MESSAGES = { on: 'Vanaf het volgende potje doe je mee', off: 'Vanaf het volgende potje doe je niet mee' };
const NOTIFY_MESSAGES = { on: 'Deze melding staat aan', off: 'Deze melding staat uit' };

const TOGGLES = [
    { id: 'pictionaryToggle', key: 'pictionaryEnabled', url: '/settings/api/pictionary', messages: JOIN_MESSAGES },
    { id: 'wieBenIkToggle', key: 'wieBenIkEnabled', url: '/settings/api/wie-ben-ik', messages: JOIN_MESSAGES },
    { id: 'notifyPictionaryToggle', key: 'notifyPictionary', url: '/settings/api/notify/pictionary', messages: NOTIFY_MESSAGES },
    { id: 'notifyWieBenIkToggle', key: 'notifyWieBenIk', url: '/settings/api/notify/wie-ben-ik', messages: NOTIFY_MESSAGES },
    { id: 'notifyWoordleToggle', key: 'notifyWoordle', url: '/settings/api/notify/woordle', messages: NOTIFY_MESSAGES },
    { id: 'notifyResultsToggle', key: 'notifyResults', url: '/settings/api/notify/results', messages: NOTIFY_MESSAGES }
];

// The switch for push notifications on this device. It stays disabled, with
// an explanation, when this browser or the server can't do push.
async function setupPush() {
    const toggle = document.getElementById('pushToggle');
    const note = document.getElementById('pushNote');
    const testButton = document.getElementById('pushTest');
    const showNote = (text) => {
        note.textContent = text;
        note.hidden = !text;
    };
    const showOn = (on) => {
        toggle.checked = on;
        testButton.hidden = !on;
    };

    if (!Push.supported) {
        showNote(Push.isIos && !Push.isStandalone
            ? 'Op een iPhone of iPad werken meldingen alleen vanaf het beginscherm: tik op Deel (het vierkantje met het pijltje) en kies "Zet op beginscherm". Open de site daarna via het nieuwe icoon en kom hier terug.'
            : 'Deze browser kan geen meldingen laten zien.');
        return;
    }

    let config;
    try {
        config = await api('/settings/api/push');
    } catch (error) {
        showNote(error.message);
        return;
    }
    if (!config.available) {
        showNote('Meldingen zijn nog niet ingesteld op de server.');
        return;
    }

    const subscription = await Push.getSubscription().catch(() => null);
    showOn(!!subscription && Notification.permission === 'granted');
    if (Notification.permission === 'denied') {
        showNote('Je browser blokkeert meldingen voor deze site. Zet ze aan in de instellingen van je browser.');
    }
    toggle.disabled = false;

    toggle.addEventListener('change', async () => {
        const turnOn = toggle.checked;
        toggle.disabled = true;
        try {
            if (turnOn) {
                await Push.enable(config.publicKey);
                showNote('');
                toast('Meldingen staan aan op dit apparaat', { type: 'success' });
            } else {
                await Push.disable();
                toast('Meldingen staan uit op dit apparaat', { type: 'success' });
            }
            showOn(turnOn);
        } catch (error) {
            console.error('Push toggle failed:', error);
            showOn(!turnOn);
            toast(error.message || 'Dat is niet gelukt.', { type: 'error', duration: 5000 });
        } finally {
            toggle.disabled = false;
        }
    });

    testButton.addEventListener('click', async () => {
        testButton.disabled = true;
        try {
            await api('/settings/api/push/test', { method: 'POST' });
            toast('Testmelding verstuurd', { type: 'success' });
        } catch (error) {
            toast(error.message, { type: 'error' });
        } finally {
            testButton.disabled = false;
        }
    });
}

document.addEventListener('DOMContentLoaded', async () => {
    // Light / dark / automatic: stored on this device by theme.js
    const current = window.getThemeChoice ? window.getThemeChoice() : 'system';
    document.querySelectorAll('input[name="theme"]').forEach((input) => {
        input.checked = input.value === current;
        input.addEventListener('change', () => {
            if (input.checked && window.setThemeChoice) window.setThemeChoice(input.value);
        });
    });

    setupPush();

    try {
        const settings = await api('/settings/api');
        TOGGLES.forEach(({ id, key }) => {
            document.getElementById(id).checked = settings[key] === '1';
        });
    } catch (error) {
        toast(error.message, { type: 'error' });
    }

    TOGGLES.forEach(({ id, key, url, messages }) => {
        const toggle = document.getElementById(id);
        toggle.addEventListener('change', async () => {
            const value = toggle.checked ? '1' : '0';
            try {
                await api(url, { method: 'POST', body: { [key]: value } });
                toast(value === '1' ? messages.on : messages.off, { type: 'success' });
            } catch (error) {
                toggle.checked = !toggle.checked;
                toast(error.message, { type: 'error' });
            }
        });
    });
});
