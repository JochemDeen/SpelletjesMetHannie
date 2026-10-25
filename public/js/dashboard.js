// public/js/dashboard.js: greeting, status badges on the game cards,
// the dismissable announcement and the footer.

// Bump this to show the announcement again to everyone who closed it
const UPDATE_VERSION = 'v3';

function setStatus(id, text, colour) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    el.className = `status status-${colour}`;
}

async function updateMastermindStatus() {
    try {
        const data = await api('/api/load-game-state');
        if (!data.success) {
            setStatus('mastermind-status', 'Nieuw woord', 'green');
        } else if (data.state.finished) {
            setStatus('mastermind-status', data.state.success ? 'Geraden ✓' : 'Klaar', 'blue');
        } else {
            setStatus('mastermind-status', 'Bezig', 'yellow');
        }
    } catch (error) {
        console.error('Error fetching Woordle status:', error);
    }
}

const PICTIONARY_STATUS = {
    choose: ['Tekenen', 'green'],
    thinking: ['Tekenen', 'green'],
    drawing: ['Tekenen', 'green'],
    modify: ['Aanpassen', 'green'],
    guessing: ['Raden', 'green'],
    feedback: ['Beoordelen', 'green'],
    'guessing-watching': ['Wachten', 'yellow'],
    idle: ['Wachten', 'yellow'],
    Off: ['Uit', 'gray'],
    scoring: ['Afgelopen!', 'blue']
};

const WIE_BEN_IK_STATUS = {
    'theme-vote': ['Kies thema', 'green'],
    question: ['Stel je vraag', 'green'],
    voting: ['Stemmen', 'green'],
    'theme-vote-waiting': ['Wachten', 'yellow'],
    'question-waiting': ['Wachten', 'yellow'],
    'voting-waiting': ['Wachten', 'yellow'],
    'spectate-theme-vote': ['Kijken', 'gray'],
    'spectate-question': ['Kijken', 'gray'],
    'spectate-voting': ['Kijken', 'gray'],
    Off: ['Uit', 'gray'],
    scoring: ['Afgelopen!', 'blue']
};

async function updateGameStatus(url, id, table) {
    try {
        const data = await api(url);
        const [text, colour] = table[data.state] || ['Wachten', 'yellow'];
        setStatus(id, text, colour);
    } catch (error) {
        // e.g. Pictionary answers 400 when nobody has it switched on
        setStatus(id, 'Uit', 'gray');
    }
}

function updateStatuses() {
    updateMastermindStatus();
    updateGameStatus('/api/pictionary/state', 'pictionary-status', PICTIONARY_STATUS);
    updateGameStatus('/api/wie-ben-ik/state', 'wie-ben-ik-status', WIE_BEN_IK_STATUS);
}

async function loadGreeting() {
    try {
        const { username } = await api('/api/me');
        if (!username) return;
        const hour = new Date().getHours();
        const part = hour < 6 ? 'Goedenacht' : hour < 12 ? 'Goedemorgen' : hour < 18 ? 'Goedemiddag' : 'Goedenavond';
        document.getElementById('greeting').textContent = `${part}, ${username}!`;
    } catch (error) {
        console.error('Error fetching user:', error);
    }
}

function setupAnnouncement() {
    const container = document.getElementById('updateContainer');
    const closeButton = document.getElementById('closeUpdate');
    if (!container || !closeButton) return;
    const storageKey = `updateDismissed_${UPDATE_VERSION}`;

    try {
        if (localStorage.getItem(storageKey) === 'true') {
            container.classList.add('hidden');
        }
    } catch (e) {
        // Storage unavailable (private mode): just keep showing it
    }
    closeButton.addEventListener('click', () => {
        container.classList.add('hidden');
        try {
            localStorage.setItem(storageKey, 'true');
        } catch (e) {
            // ignore
        }
    });
}

async function loadSiteFooter() {
    const footer = document.getElementById('siteFooter');
    if (!footer) return;
    try {
        const info = await api('/api/site-info');
        if (!info.lastUpdate) return; // No info available, keep the footer hidden
        const date = new Date(info.lastUpdate).toLocaleDateString('nl-NL', {
            day: 'numeric', month: 'long', year: 'numeric'
        });
        footer.textContent = `Laatste update: ${date}` + (info.commit ? ` · versie ${info.commit}` : '');
        footer.hidden = false;
    } catch (error) {
        console.error('Error fetching site info:', error);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    loadGreeting();
    setupAnnouncement();
    loadSiteFooter();
    poll(updateStatuses, 15000);
});
