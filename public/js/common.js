// public/js/common.js
// Small helpers shared by every page. Load with a plain <script> tag before
// the page's own script.

// Escape user-typed text (guesses, questions, names) before putting it into
// innerHTML, so it is shown as text instead of being run as HTML.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// fetch + JSON. Throws an Error with a Dutch, user-facing message when the
// request fails or the server answers with an error status; err.status and
// err.data carry the details.
async function api(url, { method = 'GET', body, headers } = {}) {
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: body !== undefined ? { 'Content-Type': 'application/json', ...headers } : headers,
            body: body !== undefined ? JSON.stringify(body) : undefined
        });
    } catch (networkError) {
        throw new Error('Geen verbinding met de server. Probeer het zo nog eens.');
    }
    let data = null;
    try {
        data = await res.json();
    } catch (parseError) {
        // Not JSON (e.g. a plain-text error page)
    }
    if (!res.ok) {
        const err = new Error((data && (data.error || data.message)) || 'Er is iets misgegaan.');
        err.status = res.status;
        err.data = data;
        throw err;
    }
    return data;
}

// Short message at the top of the screen that fades out by itself; read out
// by screen readers. Replaces alert() so the page is never blocked.
function toast(message, { type = 'info', duration = 2500 } = {}) {
    let region = document.getElementById('toast-region');
    if (!region) {
        region = document.createElement('div');
        region.id = 'toast-region';
        region.setAttribute('aria-live', 'polite');
        document.body.appendChild(region);
    }
    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.textContent = message;
    region.appendChild(el);
    setTimeout(() => {
        el.classList.add('toast-hide');
        setTimeout(() => el.remove(), 400);
    }, duration);
}

// Calls fn now and then every `ms` milliseconds, paused while the tab is
// hidden (and run once right away when it becomes visible again). Returns a
// function that stops the polling.
function poll(fn, ms) {
    let timer = null;
    const run = async () => {
        try {
            await fn();
        } catch (err) {
            console.error('Poll failed:', err);
        }
    };
    const start = () => {
        if (timer === null) timer = setInterval(run, ms);
    };
    const stop = () => {
        clearInterval(timer);
        timer = null;
    };
    const onVisibility = () => {
        if (document.hidden) {
            stop();
        } else {
            run();
            start();
        }
    };
    document.addEventListener('visibilitychange', onVisibility);
    run();
    if (!document.hidden) start();
    return () => {
        stop();
        document.removeEventListener('visibilitychange', onVisibility);
    };
}
