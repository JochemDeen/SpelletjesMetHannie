// public/js/compare.js: everyone's Woordle results for one day ("Samenvatting").
// Results of a day are only visible once you've finished that day yourself.

document.addEventListener('DOMContentLoaded', async () => {
    const compareContainer = document.getElementById('compare-container');
    const currentDateElem = document.getElementById('currentDate');
    const prevDateButton = document.getElementById('prevDateButton');
    const nextDateButton = document.getElementById('nextDateButton');

    // Dates are handled as 'YYYY-MM-DD' strings; noon avoids DST edge cases
    const toKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    const fromKey = (key) => new Date(`${key}T12:00:00`);
    const todayKey = toKey(new Date());
    let selectedKey = todayKey;
    let earliestKey = todayKey;

    try {
        const data = await api('/api/get-earliest-date');
        earliestKey = data.earliestDate;
    } catch (error) {
        // No results at all yet: only today is available
    }

    const shiftDay = (key, days) => {
        const date = fromKey(key);
        date.setDate(date.getDate() + days);
        return toKey(date);
    };

    const formatDay = (key) => {
        if (key === todayKey) return 'Vandaag';
        if (key === shiftDay(todayKey, -1)) return 'Gisteren';
        return fromKey(key).toLocaleDateString('nl-NL', { weekday: 'long', day: 'numeric', month: 'long' });
    };

    const showMessage = (html) => {
        compareContainer.innerHTML = `<div class="card compare-message">${html}</div>`;
    };

    const renderResults = (results) => {
        compareContainer.innerHTML = '';
        // Solved first (earliest first), then the ones that didn't make it
        results.sort((a, b) => (b.success - a.success) || (new Date(a.solveTime) - new Date(b.solveTime)));

        results.forEach((result) => {
            const card = document.createElement('div');
            card.className = 'card result-card';

            const header = document.createElement('div');
            header.className = 'result-header';
            const solveTime = result.solveTime
                ? new Date(result.solveTime).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
                : null;
            header.innerHTML = `
                <span class="result-name">${escapeHtml(result.username)}</span>
                <span class="result-meta">${result.success ? `${result.guesses.length}/6 · ${solveTime}` : 'Niet geraden'}</span>
                <span class="result-score">${result.score} pt</span>
            `;
            card.appendChild(header);

            const grid = document.createElement('div');
            grid.className = 'mini-grid';
            result.guesses.forEach((guess, rowIndex) => {
                [...guess].forEach((letter, colIndex) => {
                    const box = document.createElement('div');
                    box.className = `mini-tile ${result.feedback[rowIndex][colIndex]}`;
                    box.textContent = letter;
                    grid.appendChild(box);
                });
            });
            card.appendChild(grid);
            compareContainer.appendChild(card);
        });
    };

    const load = async () => {
        currentDateElem.textContent = formatDay(selectedKey);
        prevDateButton.disabled = selectedKey <= earliestKey;
        nextDateButton.disabled = selectedKey >= todayKey;
        try {
            const data = await api(`/api/get-results?date=${selectedKey}`);
            if (data.results && data.results.length) {
                renderResults(data.results);
            } else {
                showMessage('Er zijn voor deze dag geen resultaten.');
            }
        } catch (error) {
            if (error.status === 403) {
                showMessage(selectedKey === todayKey
                    ? 'Speel eerst het woord van vandaag, dan zie je hoe de anderen het deden. <br><a class="btn btn-primary" href="/mastermind">Naar Woordle</a>'
                    : 'Je hebt deze dag niet (helemaal) gespeeld, dus de resultaten blijven geheim.');
            } else {
                showMessage(escapeHtml(error.message));
            }
        }
    };

    prevDateButton.addEventListener('click', () => {
        selectedKey = shiftDay(selectedKey, -1);
        load();
    });
    nextDateButton.addEventListener('click', () => {
        selectedKey = shiftDay(selectedKey, 1);
        load();
    });

    // Share a picture of the results (html2canvas); falls back to a message
    document.getElementById('shareButton').addEventListener('click', async () => {
        try {
            const canvas = await html2canvas(document.getElementById('captureSection'), { backgroundColor: '#f7f2e7' });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `woordle-${selectedKey}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file] });
            } else {
                toast('Delen kan niet in deze browser. Probeer het op je telefoon.');
            }
        } catch (error) {
            if (error.name !== 'AbortError') toast('Delen is niet gelukt.', { type: 'error' });
        }
    });

    load();
});
