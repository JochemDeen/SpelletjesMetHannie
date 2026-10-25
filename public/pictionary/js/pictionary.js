// public/pictionary/js/pictionary.js: the Pictionary game page.
// The server holds the one shared game; this page polls its state (as seen
// by this player) every few seconds and shows the matching screen.

const POLL_MS = 5000;
const THINKING_SECONDS = 60;
const MAX_ROUNDS = 5;
const DIFFICULTY_LABELS = { easy: 'Makkelijk', medium: 'Gemiddeld', hard: 'Moeilijk' };
const PHASE_TITLES = {
    choose: 'Kies een moeilijkheid',
    thinking: 'Bedenk je tekening',
    drawing: 'Teken je woord!',
    modify: 'Pas je tekening aan',
    guessing: 'Wat is het?',
    'guessing-watching': '',
    feedback: 'Beoordeel de gokken',
    idle: '',
    Off: ''
};
const SECTIONS = ['off-container', 'word-selection', 'thinking-container', 'drawing-container',
    'guess-container', 'grading-guesses', 'guesses-table-container'];

const canvas = document.getElementById('drawing-canvas');
const board = new DrawingBoard(canvas, { onChange: onBoardChange });

let game = null;          // last state from the server
let shownKey = null;      // which screen is showing (state|round|game)
let drawingKey = null;    // localStorage key for the drawing in progress
let busy = false;         // a drawing or grades are being sent
let timer = null;         // the running countdown, if any

const keyOf = (data) => `${data.state}|${data.round}|${data.game_id}`;

function show(...ids) {
    SECTIONS.forEach(id => document.getElementById(id).classList.toggle('hidden', !ids.includes(id)));
}

function setTitle(text) {
    document.getElementById('phase-title').textContent = text || '';
}

// ---------- Polling ----------

async function refresh(force = false) {
    let data;
    try {
        data = await api('/api/pictionary/state');
    } catch (error) {
        return; // keep the current screen; the next poll tries again
    }
    game = data;
    if (force || keyOf(data) !== shownKey) {
        shownKey = keyOf(data);
        render(data);
    } else if (data.state === 'guessing' || data.state === 'guessing-watching') {
        updateGuessesTable();
    }
}

function render(data) {
    stopTimer();
    setTitle(PHASE_TITLES[data.state]);
    switch (data.state) {
        case 'scoring':
            window.location.href = '/pictionary/scoreboard';
            break;
        case 'Off':
            showMessage('🙈', data.reason === 'not-enough-players'
                ? 'Er doen nu te weinig mensen mee met Pictionary. Zet het aan bij de <a href="/settings">instellingen</a>!'
                : `Je doet niet mee met dit spel${data.drawer_name ? ` (${escapeHtml(data.drawer_name)} tekent)` : ''}. Wil je de volgende keer meedoen? Zet Pictionary aan bij de <a href="/settings">instellingen</a>.`);
            break;
        case 'idle':
            showMessage('✏️', `<strong>${escapeHtml(data.drawer_name)}</strong> is aan de beurt om te tekenen. Even geduld, deze pagina ververst vanzelf.`);
            break;
        case 'choose':
            renderChoose();
            break;
        case 'thinking':
            renderThinking(data.word);
            break;
        case 'drawing':
            renderDrawing('draw');
            break;
        case 'modify':
            renderDrawing('modify');
            break;
        case 'guessing':
            renderGuessing(true);
            break;
        case 'guessing-watching':
            renderGuessing(false);
            break;
        case 'feedback':
            renderGrading();
            break;
        default:
            showMessage('🤔', 'Er ging iets mis. Probeer de pagina opnieuw te laden.');
    }
}

function showMessage(icon, html) {
    show('off-container');
    document.getElementById('off-icon').textContent = icon;
    document.getElementById('off-message').innerHTML = html;
}

// ---------- Countdown ----------

// Counts down `seconds` with a smoothly shrinking bar; calls onDone at 0
function startTimer(seconds, onDone) {
    stopTimer();
    const container = document.getElementById('drawing-container');
    const bar = document.getElementById('timer-bar');
    const text = document.getElementById('timer-text');
    const endAt = Date.now() + seconds * 1000;

    bar.style.transition = 'none';
    bar.style.width = '100%';
    void bar.offsetWidth;
    bar.style.transition = `width ${seconds}s linear`;
    bar.style.width = '0%';

    const tick = () => {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        text.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        container.classList.toggle('timer-low', left <= 10);
        if (left <= 0) {
            stopTimer();
            onDone();
        }
    };
    tick();
    timer = setInterval(tick, 250);
}

function stopTimer() {
    clearInterval(timer);
    timer = null;
}

// ---------- Drawer: choose & think ----------

async function renderChoose() {
    show('word-selection');
    const options = document.getElementById('difficulty-options');
    options.innerHTML = '';
    let maxScores = {};
    try {
        maxScores = await api('/api/pictionary/max-scores');
    } catch (error) {
        // the buttons work without the points
    }
    [['easy', '🟢'], ['medium', '🟡'], ['hard', '🔴']].forEach(([value, icon]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'difficulty-option';
        button.innerHTML = `<span class="difficulty-icon">${icon}</span>
            <span>${DIFFICULTY_LABELS[value]}</span>
            <small>max ${maxScores[value] ?? '?'} punten</small>`;
        button.addEventListener('click', async () => {
            options.querySelectorAll('button').forEach(b => { b.disabled = true; });
            try {
                const data = await api('/api/pictionary/set-difficulty', { method: 'POST', body: { difficulty: value } });
                const next = { ...game, state: 'thinking', word: data.word };
                shownKey = keyOf(next);
                render(next);
            } catch (error) {
                toast(error.message, { type: 'error' });
                refresh(true);
            }
        });
        options.appendChild(button);
    });
}

function renderThinking(word) {
    show('thinking-container');
    document.getElementById('thinking-word').textContent = word || '';
    const timerText = document.getElementById('thinking-timer');
    const endAt = Date.now() + THINKING_SECONDS * 1000;
    const startDrawing = () => {
        stopTimer();
        renderDrawing('draw');
    };
    timer = setInterval(() => {
        const left = Math.max(0, Math.ceil((endAt - Date.now()) / 1000));
        timerText.textContent = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
        if (left <= 0) startDrawing();
    }, 250);
    document.getElementById('start-drawing-btn').onclick = startDrawing;
}

// ---------- Drawer: drawing and touching up ----------

// mode 'draw': the first drawing; mode 'modify': the one touch-up per round
async function renderDrawing(mode) {
    setTitle(PHASE_TITLES[mode === 'draw' ? 'drawing' : 'modify']);
    show('drawing-container');
    const finishButton = document.getElementById('finish-drawing');
    finishButton.disabled = true;
    board.disable();

    let data;
    try {
        data = await api(mode === 'draw' ? '/api/pictionary/start-drawing' : '/api/pictionary/enter-modify-state', { method: 'POST' });
    } catch (error) {
        toast(error.message, { type: 'error' });
        refresh(true);
        return;
    }
    shownKey = keyOf({ ...game, state: mode === 'draw' ? 'drawing' : 'modify', round: data.round });
    document.getElementById('draw-word').textContent = data.word;

    board.reset();
    if (mode === 'modify' && data.image_src) {
        try {
            await board.setBaseImage(data.image_src);
        } catch (error) {
            toast('De tekening kon niet worden geladen.', { type: 'error' });
        }
    }
    // Picks up where you were if the page was reloaded while drawing
    drawingKey = `pictionary-drawing-${game.game_id}-${data.round}-${mode}`;
    try {
        const saved = localStorage.getItem(drawingKey);
        if (saved) board.restore(saved);
    } catch (e) {
        // storage unavailable
    }
    updateHistoryButtons();

    if (data.countdown <= 0) {
        finishDrawing(mode);
        return;
    }
    board.enable();
    finishButton.disabled = false;
    finishButton.textContent = mode === 'draw' ? 'Klaar!' : 'Klaar met aanpassen';
    finishButton.onclick = () => finishDrawing(mode);
    startTimer(data.countdown, () => finishDrawing(mode));
}

async function finishDrawing(mode) {
    if (busy) return;
    busy = true;
    stopTimer();
    board.disable();
    document.getElementById('finish-drawing').disabled = true;

    const url = mode === 'draw' ? '/api/pictionary/submit-drawing' : '/api/pictionary/submit-modified-drawing';
    const body = (mode === 'draw' && !board.hasNewStrokes()) ? { empty: true } : { drawing: board.toDataURL() };
    try {
        const result = await api(url, { method: 'POST', body });
        if (result.status === 'empty') {
            toast('Je hebt niets getekend, dus dit spel telt niet. Er begint een nieuw spel.', { duration: 5000 });
        } else {
            toast(mode === 'draw' ? 'Je tekening is verstuurd!' : 'Je aanpassing is opgeslagen!', { type: 'success' });
        }
        try {
            localStorage.removeItem(drawingKey);
        } catch (e) {
            // ignore
        }
    } catch (error) {
        toast(error.message, { type: 'error' });
    }
    busy = false;
    refresh(true);
}

function onBoardChange() {
    updateHistoryButtons();
    if (!drawingKey || !board.enabled) return;
    try {
        localStorage.setItem(drawingKey, board.serialize());
    } catch (e) {
        // storage full or unavailable: the drawing just isn't restorable
    }
}

function updateHistoryButtons() {
    document.getElementById('undo-button').disabled = board.strokes.length === 0;
    document.getElementById('redo-button').disabled = board.redoStack.length === 0;
}

function setupToolbar() {
    const toolbar = document.getElementById('toolbar');
    const setActive = (selector, button) => {
        toolbar.querySelectorAll(selector).forEach(b => b.classList.toggle('active', b === button));
    };
    toolbar.querySelectorAll('.swatch').forEach(button => {
        button.addEventListener('click', () => {
            board.color = button.dataset.color;
            setActive('.swatch', button);
            if (board.tool === 'eraser') {
                board.tool = 'pen';
                setActive('.tool-btn[data-tool]', toolbar.querySelector('[data-tool="pen"]'));
            }
        });
    });
    toolbar.querySelectorAll('.tool-btn[data-tool]').forEach(button => {
        button.addEventListener('click', () => {
            board.tool = button.dataset.tool;
            setActive('.tool-btn[data-tool]', button);
        });
    });
    toolbar.querySelectorAll('.size-btn').forEach(button => {
        button.addEventListener('click', () => {
            board.size = Number(button.dataset.size);
            setActive('.size-btn', button);
        });
    });
    document.getElementById('undo-button').addEventListener('click', () => board.undo());
    document.getElementById('redo-button').addEventListener('click', () => board.redo());
    document.getElementById('clear-button').addEventListener('click', () => {
        board.clear();
        toast('Alles gewist. Per ongeluk? Druk op ↶.');
    });
}

// ---------- Guessing ----------

async function renderGuessing(canGuess) {
    show('guess-container', 'guesses-table-container');
    const form = document.getElementById('guess-submission');
    const waiting = document.getElementById('guess-waiting');
    form.classList.toggle('hidden', !canGuess);
    waiting.classList.toggle('hidden', canGuess);
    if (canGuess) {
        document.getElementById('guess-input').value = '';
    } else {
        setTitle(game.is_drawer ? 'De anderen zijn aan het raden' : 'Wachten op de anderen');
        waiting.textContent = game.is_drawer
            ? 'Zodra iedereen een gok heeft gedaan, mag jij ze beoordelen.'
            : 'Je gok is binnen! Zodra iedereen heeft geraden, beoordeelt de tekenaar de gokken.';
    }

    try {
        const data = await api('/api/pictionary/get-image');
        document.getElementById('drawing-caption').innerHTML =
            `Tekening van <strong>${escapeHtml(data.drawerName)}</strong> · ${DIFFICULTY_LABELS[data.difficulty] || ''} · ronde ${data.round} van ${MAX_ROUNDS}`;
        document.getElementById('image-canvas').innerHTML =
            `<img src="${escapeHtml(data.imageSrc)}" alt="Tekening van ${escapeHtml(data.drawerName)}">`;
    } catch (error) {
        document.getElementById('image-canvas').innerHTML = '';
    }
    updateGuessesTable();
}

document.getElementById('guess-submission').addEventListener('submit', async (event) => {
    event.preventDefault();
    const input = document.getElementById('guess-input');
    const guess = input.value.trim();
    if (!guess) {
        toast('Je hebt niks ingevuld!', { type: 'error' });
        return;
    }
    const button = document.getElementById('submit-guess');
    button.disabled = true;
    try {
        await api('/api/pictionary/submit-guess', { method: 'POST', body: { guess } });
        toast('Je gok is verstuurd!', { type: 'success' });
        refresh(true);
    } catch (error) {
        toast(error.message, { type: 'error' });
    }
    button.disabled = false;
});

// SQLite timestamps are UTC without a zone ("2026-10-25 14:03:00")
function formatGuessTime(value) {
    if (!value) return { time: '–', full: '' };
    const date = new Date(value.replace(' ', 'T') + 'Z');
    if (Number.isNaN(date.getTime())) return { time: '–', full: '' };
    return {
        time: date.toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
        full: date.toLocaleString('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    };
}

async function updateGuessesTable() {
    let guesses;
    try {
        ({ guesses } = await api('/api/pictionary/get-guesses'));
    } catch (error) {
        return;
    }
    const tableBody = document.getElementById('guessesTableBody');
    tableBody.innerHTML = '';
    if (!guesses.length) {
        tableBody.innerHTML = '<tr><td colspan="5" class="muted">Nog geen gokken.</td></tr>';
        return;
    }
    guesses.forEach((guess) => {
        const { time, full } = formatGuessTime(guess.time);
        const row = document.createElement('tr');
        if (guess.feedback == 5) row.className = 'top-guess';
        row.innerHTML = `
            <td>${escapeHtml(guess.round_number)}</td>
            <td>${escapeHtml(guess.username || 'Onbekend')}</td>
            <td title="${escapeHtml(full)}">${escapeHtml(time)}</td>
            <td>${escapeHtml(guess.text)}${guess.feedback == 5 ? ' ⭐' : ''}</td>
            <td>${guess.feedback ? escapeHtml(guess.feedback) : '⏳'}</td>`;
        tableBody.appendChild(row);
    });
}

// ---------- Drawer: grading ----------

async function renderGrading() {
    show('grading-guesses', 'guesses-table-container');
    updateGuessesTable();
    const list = document.getElementById('guesses-list');
    const submitButton = document.getElementById('submit-grades');
    const modifyButton = document.getElementById('modify-drawing');
    list.innerHTML = '<p class="muted">Gokken laden…</p>';
    submitButton.disabled = true;

    let image, toGrade;
    try {
        [image, toGrade] = await Promise.all([api('/api/pictionary/get-image'), api('/api/pictionary/get-guesses-to-grade')]);
    } catch (error) {
        toast(error.message, { type: 'error' });
        return;
    }
    document.getElementById('grading-word').textContent = image.word;
    document.getElementById('image-canvas-guessing').innerHTML =
        `<img src="${escapeHtml(image.imageSrc)}" alt="Jouw tekening">`;

    modifyButton.disabled = !toGrade.canModify;
    modifyButton.textContent = toGrade.canModify
        ? '✏️ Maak een kleine aanpassing (15 seconden)'
        : 'Je hebt de tekening deze ronde al aangepast';
    modifyButton.onclick = () => renderDrawing('modify');

    list.innerHTML = '';
    const guesses = toGrade.guesses;
    if (guesses.some(g => g.suggested_grade)) {
        const note = document.createElement('p');
        note.className = 'suggestion-note';
        note.textContent = '💡 De computer heeft alvast een cijfer gekozen. Je kunt het zelf nog aanpassen.';
        list.appendChild(note);
    }
    if (!guesses.length) {
        list.insertAdjacentHTML('beforeend', '<p class="muted">Niemand heeft deze ronde een gok gedaan.</p>');
    }
    guesses.forEach((guess) => {
        const row = document.createElement('div');
        row.className = 'grade-row';
        const text = document.createElement('span');
        text.className = 'grade-text';
        text.textContent = guess.text;
        const buttons = document.createElement('div');
        buttons.className = 'grade-buttons';
        for (let grade = 1; grade <= 5; grade++) {
            const button = document.createElement('button');
            button.type = 'button';
            button.className = 'grade-button';
            button.dataset.id = guess.action_id;
            button.dataset.grade = grade;
            button.textContent = grade === 5 ? '5 ✔' : grade;
            if (guess.suggested_grade === grade) button.classList.add('selected');
            button.addEventListener('click', () => {
                buttons.querySelectorAll('.grade-button').forEach(b => b.classList.toggle('selected', b === button));
            });
            buttons.appendChild(button);
        }
        row.append(text, buttons);
        list.appendChild(row);
    });

    submitButton.disabled = false;
    submitButton.onclick = async () => {
        if (busy) return;
        const feedback = [];
        for (const guess of guesses) {
            const selected = list.querySelector(`.grade-button.selected[data-id="${guess.action_id}"]`);
            if (!selected) {
                toast('Geef eerst elke gok een cijfer.', { type: 'error' });
                return;
            }
            feedback.push({ action_id: guess.action_id, feedback: Number(selected.dataset.grade) });
        }
        busy = true;
        submitButton.disabled = true;
        try {
            await api('/api/pictionary/submit-grades', { method: 'POST', body: { feedback } });
            toast('Beoordeeld!', { type: 'success' });
        } catch (error) {
            toast(error.message, { type: 'error' });
            submitButton.disabled = false;
        }
        busy = false;
        refresh(true);
    };
}

// ---------- Start ----------

setupToolbar();
poll(() => (busy ? null : refresh()), POLL_MS);
