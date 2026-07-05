//public/wie-ben-ik/js/past-game.js
document.addEventListener('DOMContentLoaded', () => {
    const params = new URLSearchParams(window.location.search);
    const gameId = params.get('game_id');

    if (!gameId) {
        document.getElementById('game-info').textContent = 'Geen spel gevonden';
        return;
    }

    loadGame(gameId);

    async function loadGame(id) {
        try {
            const response = await fetch(`/api/wie-ben-ik/get-game?game_id=${id}`);
            if (!response.ok) {
                document.getElementById('game-info').textContent = 'Spel niet gevonden';
                return;
            }
            const game = await response.json();
            renderGame(game);
        } catch (error) {
            console.error('Error fetching past game:', error);
        }
    }

    function renderGame(game) {
        // Header with date and theme
        const date = formatDate(game.date);
        document.getElementById('game-info').textContent = `Spel ${game.game_id} — ${date} — ${game.theme_name || '?'}`;

        // Navigation
        setupNavButton('prevDateButton', game.prev_game_id);
        setupNavButton('nextDateButton', game.next_game_id);

        // Winner banner
        const banner = document.getElementById('winner-banner');
        if (game.winners && game.winners.length > 0) {
            banner.textContent = `👑 Gewonnen door ${game.winners.join(' en ')} in ronde ${game.rounds} 👑`;
            banner.classList.remove('hidden');
        } else {
            banner.classList.add('hidden');
        }

        // Players with all characters visible
        const listDiv = document.getElementById('players-list');
        listDiv.innerHTML = '';
        game.players.forEach((player) => {
            const card = document.createElement('div');
            card.classList.add('player-card');
            if (player.is_winner) card.classList.add('player-winner');
            card.innerHTML = `
                <div class="player-name">${player.is_winner ? '👑 ' : ''}${player.username}${player.is_winner ? ' 👑' : ''}</div>
                <div class="character-name">${player.character_name || '?'}</div>
                <div class="character-description">${player.character_description || ''}</div>
            `;
            listDiv.appendChild(card);
        });

        // Full history with vote counts
        const tableBody = document.getElementById('historyTableBody');
        tableBody.innerHTML = '';
        game.questions.forEach((q) => {
            const row = document.createElement('tr');
            const isWinningGuess = q.is_guess && q.ja > q.nee;
            if (q.is_guess) row.classList.add('history-guess');
            if (isWinningGuess) row.classList.add('history-winner');
            const label = q.is_guess ? `🎯 ${q.text}` : q.text;
            row.innerHTML = `
                <td>${q.round_number}${isWinningGuess ? ' 👑' : ''}</td>
                <td>${q.username}</td>
                <td class="history-text">${label}</td>
                <td>${q.ja}</td>
                <td>${q.nee}</td>
                <td>${q.onbekend}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    function setupNavButton(buttonId, targetGameId) {
        const button = document.getElementById(buttonId);
        if (targetGameId) {
            button.disabled = false;
            button.onclick = () => {
                window.location.href = `/wie-ben-ik/past-game.html?game_id=${targetGameId}`;
            };
        } else {
            button.disabled = true;
        }
    }

    function formatDate(isoString) {
        if (!isoString) return '';
        const normalized = isoString.replace(' ', 'T') + 'Z';
        const d = new Date(normalized);
        if (isNaN(d.getTime())) return isoString;
        return d.toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' });
    }
});
