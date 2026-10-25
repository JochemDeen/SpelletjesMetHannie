// public/js/mastermind.js: the Woordle game (internally still "Mastermind").
// The server decides everything about the word; this page only shows the
// board, sends guesses and colours tiles and keys with the feedback.

const WORD_LENGTH = 5;
const MAX_GUESSES = 6;
const FLIP_STEP = 280; // ms between flipping tiles of one row
const STATE_PRIORITY = { incorrect: 1, misplaced: 2, correct: 3 };

const boardEl = document.getElementById('board');
const keyboardEl = document.getElementById('keyboard');
const statusLine = document.getElementById('status-line');

const game = {
    guesses: [],        // submitted words
    feedback: [],       // per word: ['correct' | 'misplaced' | 'incorrect', ...]
    current: '',        // the word being typed
    finished: false,
    success: false,
    answer: null,
    busy: false         // a guess is being sent or revealed: ignore input
};

const hint = { available: false, remaining: 0, total: 0, text: null };
const keyState = {};    // letter -> best state seen

// ---------- Board ----------

function buildBoard() {
    for (let r = 0; r < MAX_GUESSES; r++) {
        const row = document.createElement('div');
        row.className = 'board-row';
        row.setAttribute('role', 'row');
        for (let c = 0; c < WORD_LENGTH; c++) {
            const tile = document.createElement('div');
            tile.className = 'tile';
            tile.setAttribute('role', 'gridcell');
            row.appendChild(tile);
        }
        boardEl.appendChild(row);
    }
}

function rowEl(index) {
    return boardEl.children[index];
}

function renderCurrentRow() {
    const tiles = rowEl(game.guesses.length).children;
    for (let i = 0; i < WORD_LENGTH; i++) {
        const letter = game.current[i] || '';
        if (tiles[i].textContent !== letter && letter) {
            tiles[i].classList.remove('pop');
            void tiles[i].offsetWidth; // restart the animation
            tiles[i].classList.add('pop');
        }
        tiles[i].textContent = letter;
        tiles[i].classList.toggle('filled', !!letter);
    }
}

function paintRow(index, word, feedback) {
    [...rowEl(index).children].forEach((tile, i) => {
        tile.textContent = word[i];
        tile.className = `tile ${feedback[i]}`;
    });
}

// Flip the tiles one by one; resolves when the last one has its colour
function revealRow(index, word, feedback) {
    const tiles = [...rowEl(index).children];
    return new Promise((resolve) => {
        tiles.forEach((tile, i) => {
            setTimeout(() => {
                tile.classList.add('flip');
                // Change colour halfway, when the tile is edge-on
                setTimeout(() => {
                    tile.className = `tile flip ${feedback[i]}`;
                    updateKey(word[i], feedback[i]);
                }, 250);
                tile.addEventListener('animationend', () => {
                    tile.classList.remove('flip');
                    if (i === tiles.length - 1) resolve();
                }, { once: true });
            }, i * FLIP_STEP);
        });
    });
}

function shakeRow(index) {
    const row = rowEl(index);
    row.classList.remove('shake');
    void row.offsetWidth;
    row.classList.add('shake');
    row.addEventListener('animationend', () => row.classList.remove('shake'), { once: true });
}

function bounceRow(index) {
    [...rowEl(index).children].forEach((tile, i) => {
        setTimeout(() => tile.classList.add('bounce'), i * 100);
    });
}

// ---------- Keyboard ----------

const KEY_ROWS = [
    'qwertyuiop'.split(''),
    'asdfghjkl'.split(''),
    ['enter', ...'zxcvbnm'.split(''), 'backspace']
];

function buildKeyboard() {
    KEY_ROWS.forEach((keys, rowIndex) => {
        const row = document.createElement('div');
        row.className = 'keyboard-row';
        if (rowIndex === 1) row.appendChild(Object.assign(document.createElement('span'), { className: 'keyboard-spacer' }));
        keys.forEach((key) => {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'key';
            button.dataset.key = key;
            if (key === 'enter') {
                button.textContent = 'Enter';
                button.classList.add('wide');
            } else if (key === 'backspace') {
                button.textContent = '⌫';
                button.classList.add('wide');
                button.setAttribute('aria-label', 'Wissen');
            } else {
                button.textContent = key;
            }
            row.appendChild(button);
        });
        if (rowIndex === 1) row.appendChild(Object.assign(document.createElement('span'), { className: 'keyboard-spacer' }));
        keyboardEl.appendChild(row);
    });
    keyboardEl.addEventListener('click', (event) => {
        const button = event.target.closest('.key');
        if (button) {
            button.blur(); // so a later Enter on a real keyboard doesn't "click" it again
            handleKey(button.dataset.key);
        }
    });
}

// A key keeps its best colour: green beats yellow beats grey
function updateKey(letter, state) {
    if ((STATE_PRIORITY[state] || 0) <= (STATE_PRIORITY[keyState[letter]] || 0)) return;
    keyState[letter] = state;
    const button = keyboardEl.querySelector(`[data-key="${letter}"]`);
    if (button) button.className = `key ${state}`;
}

function handleKey(key) {
    if (game.finished || game.busy) return;
    if (key === 'enter') {
        submitCurrent();
    } else if (key === 'backspace') {
        game.current = game.current.slice(0, -1);
        renderCurrentRow();
    } else if (/^[a-z]$/.test(key) && game.current.length < WORD_LENGTH) {
        game.current += key;
        renderCurrentRow();
    }
}

document.addEventListener('keydown', (event) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return; // leave shortcuts like Cmd+R alone
    if (document.querySelector('.modal-backdrop:not(.hidden)')) return;
    const key = event.key.toLowerCase();
    if (key === 'enter') {
        event.preventDefault();
        handleKey('enter');
    } else if (key === 'backspace' || key === 'delete') {
        handleKey('backspace');
    } else if (/^[a-z]$/.test(key)) {
        handleKey(key);
    }
});

// ---------- Guessing ----------

async function submitCurrent() {
    const word = game.current;
    const rowIndex = game.guesses.length;
    if (word.length < WORD_LENGTH) {
        toast('Niet genoeg letters');
        shakeRow(rowIndex);
        return;
    }
    if (game.guesses.includes(word)) {
        toast('Dit woord heb je al geprobeerd');
        shakeRow(rowIndex);
        return;
    }

    game.busy = true;
    let data;
    try {
        data = await api('/api/submit-guess', { method: 'POST', body: { guess: word } });
    } catch (error) {
        // Nothing was stored: the row stays as it is so the player can try again
        toast(error.status === 400 ? error.message : 'Je poging kon niet worden verstuurd. Probeer het nog eens.',
            { type: 'error' });
        shakeRow(rowIndex);
        game.busy = false;
        return;
    }

    game.guesses.push(word);
    game.feedback.push(data.feedback);
    game.current = '';
    await revealRow(rowIndex, word, data.feedback);
    statusLine.textContent = describeRow(word, data.feedback);

    if (data.finished) {
        game.finished = true;
        game.success = data.correct;
        game.answer = data.answer || null;
        onFinished(true);
    }
    game.busy = false;
    updateHintButton();
}

function describeRow(word, feedback) {
    const names = { correct: 'goed', misplaced: 'verkeerde plek', incorrect: 'niet in het woord' };
    return [...word].map((letter, i) => `${letter.toUpperCase()} ${names[feedback[i]]}`).join(', ');
}

function onFinished(justNow) {
    document.getElementById('result-button').classList.remove('hidden');
    document.getElementById('hint-toggle').classList.add('hidden');
    if (!justNow) return;
    const lastRow = game.guesses.length - 1;
    if (game.success) {
        const praise = ['Geniaal!', 'Fantastisch!', 'Geweldig!', 'Knap gedaan!', 'Goed zo!', 'Pfoe, op het nippertje!'];
        toast(praise[lastRow] || 'Gefeliciteerd!', { type: 'success' });
        bounceRow(lastRow);
        if (typeof confetti === 'function') confetti({ particleCount: 120, spread: 70, origin: { y: 0.6 } });
    } else {
        toast(`Helaas! Het woord was ${(game.answer || '?').toUpperCase()}`, { duration: 4000 });
    }
    setTimeout(openEndModal, game.success ? 1800 : 2200);
}

// ---------- Modals ----------

function openModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.querySelector('.modal-close').focus();
}

function closeModal(modal) {
    modal.classList.add('hidden');
}

document.querySelectorAll('.modal-backdrop').forEach((modal) => {
    modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-close]')) closeModal(modal);
    });
});
document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') document.querySelectorAll('.modal-backdrop:not(.hidden)').forEach(closeModal);
});

let countdownTimer = null;

// Seconds until midnight in the Netherlands, when the next word starts
function secondsUntilNextWord() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23'
    }).formatToParts(new Date());
    const get = (type) => Number(parts.find(p => p.type === type).value);
    return 24 * 3600 - (get('hour') * 3600 + get('minute') * 60 + get('second'));
}

function startCountdown() {
    const el = document.getElementById('countdown');
    const tick = () => {
        const left = secondsUntilNextWord();
        const h = Math.floor(left / 3600);
        const m = Math.floor((left % 3600) / 60);
        const s = left % 60;
        el.textContent = `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    };
    tick();
    clearInterval(countdownTimer);
    countdownTimer = setInterval(tick, 1000);
}

async function openEndModal() {
    document.getElementById('end-title').textContent = game.success ? 'Gefeliciteerd! 🎉' : 'Helaas…';
    document.getElementById('end-answer').innerHTML = game.answer
        ? `Het woord was <strong>${escapeHtml(game.answer)}</strong>${game.success ? ` · ${game.guesses.length}/6` : ''}`
        : '';
    openModal('end-modal');
    startCountdown();
    try {
        const { stats } = await api('/api/get-stats');
        renderStatTiles(document.getElementById('end-stats'), stats);
        renderDistribution(document.getElementById('end-distribution'), stats.guessDistribution,
            game.success ? game.guesses.length : null);
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ---------- Sharing ----------

function shareText() {
    const date = new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long' });
    const score = game.success ? `${game.guesses.length}/6` : 'X/6';
    const grid = game.feedback
        .map(row => row.map(state => ({ correct: '🟩', misplaced: '🟨' }[state] || '⬜')).join(''))
        .join('\n');
    return `Woordle ${date} ${score}\n\n${grid}\n\n${location.origin}/woordle`;
}

async function shareResults() {
    const text = shareText();
    if (navigator.share) {
        try {
            await navigator.share({ text });
            return;
        } catch (error) {
            if (error.name === 'AbortError') return;
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        toast('Resultaat gekopieerd! Plak het in een berichtje.', { type: 'success' });
    } catch (error) {
        toast('Delen is niet gelukt.', { type: 'error' });
    }
}

// ---------- Hints from Ollie ----------

function updateHintButton() {
    const toggle = document.getElementById('hint-toggle');
    toggle.classList.toggle('hidden', !hint.available || game.finished);

    const button = document.getElementById('request-hint-btn');
    const response = document.getElementById('hint-response');
    document.getElementById('hint-quota').textContent =
        `${hint.total - hint.remaining} van ${hint.total} hints gebruikt deze maand`;

    response.classList.toggle('hidden', !hint.text);
    // Ollie sometimes marks letters as **T**: show those in bold
    response.innerHTML = escapeHtml(hint.text || '').replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
    if (hint.text) {
        button.textContent = 'Je hebt vandaag al een hint gekregen';
        button.disabled = true;
    } else if (hint.remaining === 0) {
        button.textContent = 'Geen hints meer deze maand';
        button.disabled = true;
    } else if (game.guesses.length === 0) {
        button.textContent = 'Doe eerst een poging';
        button.disabled = true;
    } else {
        button.textContent = 'Vraag een hint';
        button.disabled = false;
    }
}

async function loadHintStatus() {
    try {
        const data = await api('/api/mastermind/hint-status');
        hint.available = data.available;
        hint.remaining = data.hintsRemaining;
        hint.total = data.totalHints;
        hint.text = data.todayHint;
    } catch (error) {
        hint.available = false;
    }
    updateHintButton();
}

async function requestHint() {
    const button = document.getElementById('request-hint-btn');
    const loading = document.getElementById('hint-loading');
    button.classList.add('hidden');
    loading.classList.remove('hidden');
    try {
        const data = await api('/api/mastermind/request-hint', { method: 'POST' });
        hint.text = data.hint;
        hint.remaining = data.hintsRemaining;
    } catch (error) {
        toast(error.message, { type: 'error' });
    }
    loading.classList.add('hidden');
    button.classList.remove('hidden');
    updateHintButton();
}

// ---------- Start ----------

async function loadGame() {
    try {
        const data = await api('/api/load-game-state');
        if (data.success) {
            const state = data.state;
            state.guesses.forEach((word, i) => {
                game.guesses.push(word.toLowerCase());
                game.feedback.push(state.feedback[i]);
                paintRow(i, word.toLowerCase(), state.feedback[i]);
                [...word.toLowerCase()].forEach((letter, j) => updateKey(letter, state.feedback[i][j]));
            });
            if (state.finished) {
                game.finished = true;
                game.success = state.success;
                game.answer = state.answer || null;
                onFinished(false);
            }
        }
    } catch (error) {
        toast(error.message, { type: 'error' });
    }
    updateHintButton();
}

buildBoard();
buildKeyboard();
document.getElementById('help-button').addEventListener('click', () => openModal('help-modal'));
document.getElementById('hint-toggle').addEventListener('click', () => openModal('hint-modal'));
document.getElementById('request-hint-btn').addEventListener('click', requestHint);
document.getElementById('result-button').addEventListener('click', openEndModal);
document.getElementById('share-button').addEventListener('click', shareResults);
loadGame().then(loadHintStatus);

// First visit: explain the game once
try {
    if (!localStorage.getItem('woordleHelpSeen')) {
        openModal('help-modal');
        localStorage.setItem('woordleHelpSeen', '1');
    }
} catch (e) {
    // Storage unavailable: skip
}
