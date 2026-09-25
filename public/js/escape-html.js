// public/js/escape-html.js
// Escape user-typed text (guesses, questions, suggested words) before putting
// it into innerHTML, so it is shown as text instead of being run as HTML.
function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
