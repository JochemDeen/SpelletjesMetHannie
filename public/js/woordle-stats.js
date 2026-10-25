// public/js/woordle-stats.js: draws a player's Woordle statistics. Used by
// the statistics page and by the popup at the end of a game.

function formatStatNumber(value) {
    if (value === null || value === undefined) return '–';
    if (typeof value === 'number' && Number.isNaN(value)) return '–';
    return String(value);
}

// The row of big numbers. keys: which stats to show, in order.
function renderStatTiles(container, stats, keys = ['totalGames', 'percentCorrect', 'currentStreak', 'maxStreak']) {
    const labels = {
        totalGames: 'Gespeeld',
        percentCorrect: 'Gewonnen',
        currentStreak: 'Reeks nu',
        maxStreak: 'Langste reeks',
        totalScore: 'Punten totaal',
        monthlyScore: 'Punten deze maand',
        averageGuess: 'Gemiddeld',
        medianGuess: 'Mediaan'
    };
    container.innerHTML = '';
    keys.forEach((key) => {
        let value = stats[key];
        if (key === 'percentCorrect') value = `${Math.round(Number(value) || 0)}%`;
        const tile = document.createElement('div');
        tile.className = 'stat-tile';
        const number = document.createElement('span');
        number.className = 'stat-number';
        number.textContent = formatStatNumber(value);
        const label = document.createElement('span');
        label.className = 'stat-label';
        label.textContent = labels[key] || key;
        tile.append(number, label);
        container.appendChild(tile);
    });
}

// Horizontal bars for "won in 1..6 guesses". highlight: the row to colour
// (e.g. today's number of guesses), or null.
function renderDistribution(container, distribution, highlight = null) {
    container.innerHTML = '';
    const counts = [1, 2, 3, 4, 5, 6].map(i => distribution[i] || 0);
    const max = Math.max(1, ...counts);
    counts.forEach((count, index) => {
        const row = document.createElement('div');
        row.className = 'dist-row';
        const label = document.createElement('span');
        label.className = 'dist-label';
        label.textContent = index + 1;
        const track = document.createElement('div');
        track.className = 'dist-track';
        const bar = document.createElement('div');
        bar.className = 'dist-bar' + (highlight === index + 1 ? ' dist-bar-highlight' : '');
        // At least a sliver, so the number always fits
        bar.style.width = `max(2em, ${(count / max) * 100}%)`;
        bar.textContent = count;
        track.appendChild(bar);
        row.append(label, track);
        container.appendChild(row);
    });
}
