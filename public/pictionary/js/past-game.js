// public/pictionary/js/past-game.js: a finished Pictionary game, with
// arrows to step through older and newer games.

const DIFFICULTY_LABELS = { easy: 'Makkelijk', medium: 'Gemiddeld', hard: 'Moeilijk' };

function formatGameDate(value) {
    return new Date(value.replace(' ', 'T') + 'Z').toLocaleDateString('nl-NL', {
        day: 'numeric', month: 'long', year: 'numeric'
    });
}

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

document.addEventListener('DOMContentLoaded', () => {
    const prevButton = document.getElementById('prevDateButton');
    const nextButton = document.getElementById('nextDateButton');
    let gameId = new URLSearchParams(window.location.search).get('game_id');

    async function show(id) {
        let data;
        try {
            data = await api(`/api/pictionary/get-game?game_id=${encodeURIComponent(id)}`);
        } catch (error) {
            toast(error.message, { type: 'error' });
            return;
        }
        gameId = id;
        history.replaceState(null, '', `?game_id=${id}`);

        document.getElementById('game-info').textContent = `Spel ${id} · ${formatGameDate(data.date)}`;
        prevButton.disabled = !data.prev_game_id;
        nextButton.disabled = !data.next_game_id;
        prevButton.onclick = () => show(data.prev_game_id);
        nextButton.onclick = () => show(data.next_game_id);

        const drawer = escapeHtml(data.drawer);
        document.getElementById('image-canvas').innerHTML = `
            <h3>Tekening van ${drawer}</h3>
            ${data.imageSrc ? `<img src="${escapeHtml(data.imageSrc)}" alt="Tekening van ${drawer}">` : '<p class="muted">Geen tekening</p>'}
            <p class="drawing-word">Het woord was: <strong>${escapeHtml(data.word)}</strong></p>
            <p class="muted">${DIFFICULTY_LABELS[data.difficulty] || ''}</p>
        `;

        const tableBody = document.getElementById('guessesTableBody');
        tableBody.innerHTML = '';
        data.guesses.forEach((guess) => {
            const { time, full } = formatGuessTime(guess.time);
            const row = document.createElement('tr');
            if (guess.feedback == 5) row.className = 'top-guess';
            row.innerHTML = `
                <td>${escapeHtml(guess.round_number)}</td>
                <td>${escapeHtml(guess.username)}</td>
                <td title="${escapeHtml(full)}">${escapeHtml(time)}</td>
                <td>${escapeHtml(guess.text)}${guess.feedback == 5 ? ' ⭐' : ''}</td>
                <td>${escapeHtml(guess.feedback ?? '–')}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    document.getElementById('shareButton').addEventListener('click', async () => {
        try {
            const canvas = await html2canvas(document.getElementById('game-state-container'), { backgroundColor: '#f7f2e7' });
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const file = new File([blob], `pictionary-${gameId}.png`, { type: 'image/png' });
            if (navigator.canShare && navigator.canShare({ files: [file] })) {
                await navigator.share({ files: [file] });
            } else {
                toast('Delen kan niet in deze browser. Probeer het op je telefoon.');
            }
        } catch (error) {
            if (error.name !== 'AbortError') toast('Delen is niet gelukt.', { type: 'error' });
        }
    });

    if (gameId) {
        show(gameId);
    } else {
        toast('Geen spel gekozen.', { type: 'error' });
    }
});
