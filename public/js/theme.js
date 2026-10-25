// public/js/theme.js: light/dark mode. Loaded in <head> before the CSS, so the
// page is drawn in the right colours straight away (no white flash).
// The choice ('light', 'dark' or 'system') is kept per device in localStorage;
// with 'system' (or no choice yet) the device setting is followed via CSS.
(function () {
    var KEY = 'theme';

    function getChoice() {
        try {
            var value = localStorage.getItem(KEY);
            return value === 'light' || value === 'dark' ? value : 'system';
        } catch (e) {
            return 'system';
        }
    }

    // Colour of the browser bar on phones: follows the page background
    function updateThemeColor() {
        var meta = document.querySelector('meta[name="theme-color"]');
        if (!meta || !document.body) return;
        meta.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--bg').trim());
    }

    function apply(choice) {
        if (choice === 'light' || choice === 'dark') {
            document.documentElement.setAttribute('data-theme', choice);
        } else {
            document.documentElement.removeAttribute('data-theme');
        }
        updateThemeColor();
    }

    window.getThemeChoice = getChoice;
    window.setThemeChoice = function (choice) {
        try {
            if (choice === 'light' || choice === 'dark') {
                localStorage.setItem(KEY, choice);
            } else {
                localStorage.removeItem(KEY);
            }
        } catch (e) {
            // storage unavailable: still switch for this page view
        }
        apply(choice);
    };

    apply(getChoice());
    document.addEventListener('DOMContentLoaded', updateThemeColor);
    if (window.matchMedia) {
        var query = window.matchMedia('(prefers-color-scheme: dark)');
        if (query.addEventListener) query.addEventListener('change', updateThemeColor);
    }
})();
