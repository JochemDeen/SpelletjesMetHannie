// public/js/settings.js: joining Pictionary / Wie ben ik, and light or dark mode

const TOGGLES = [
    { id: 'pictionaryToggle', key: 'pictionaryEnabled', url: '/settings/api/pictionary' },
    { id: 'wieBenIkToggle', key: 'wieBenIkEnabled', url: '/settings/api/wie-ben-ik' }
];

document.addEventListener('DOMContentLoaded', async () => {
    // Light / dark / automatic: stored on this device by theme.js
    const current = window.getThemeChoice ? window.getThemeChoice() : 'system';
    document.querySelectorAll('input[name="theme"]').forEach((input) => {
        input.checked = input.value === current;
        input.addEventListener('change', () => {
            if (input.checked && window.setThemeChoice) window.setThemeChoice(input.value);
        });
    });

    try {
        const settings = await api('/settings/api');
        TOGGLES.forEach(({ id, key }) => {
            document.getElementById(id).checked = settings[key] === '1';
        });
    } catch (error) {
        toast(error.message, { type: 'error' });
    }

    TOGGLES.forEach(({ id, key, url }) => {
        const toggle = document.getElementById(id);
        toggle.addEventListener('change', async () => {
            const value = toggle.checked ? '1' : '0';
            try {
                await api(url, { method: 'POST', body: { [key]: value } });
                toast(value === '1' ? 'Vanaf het volgende potje doe je mee' : 'Vanaf het volgende potje doe je niet mee',
                    { type: 'success' });
            } catch (error) {
                toggle.checked = !toggle.checked;
                toast(error.message, { type: 'error' });
            }
        });
    });
});
