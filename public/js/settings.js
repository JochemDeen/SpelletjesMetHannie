// public/js/settings.js: the on/off switches for joining Pictionary and Wie ben ik

const TOGGLES = [
    { id: 'pictionaryToggle', key: 'pictionaryEnabled', url: '/settings/api/pictionary' },
    { id: 'wieBenIkToggle', key: 'wieBenIkEnabled', url: '/settings/api/wie-ben-ik' }
];

document.addEventListener('DOMContentLoaded', async () => {
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
