//public/wie-ben-ik/js/wie-ben-ik-scoreboard.js
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch last game score
        const lastGameResponse = await fetch('/api/wie-ben-ik/last-game-score');
        const lastGameData = await lastGameResponse.json();
        renderLastGameScore(lastGameData);

        // Fetch monthly win counts
        const monthResponse = await fetch('/api/wie-ben-ik/monthly-scores');
        const monthData = await monthResponse.json();
        if (monthData.success && monthData.scores.length > 0) {
            renderWinCounts(monthData.scores, 'monthly-score-list');
        } else {
            renderNoScores();
        }

        // Fetch last month's winner
        const previousMonthResponse = await fetch('/api/wie-ben-ik/previous-month-winner');
        const previousMonthData = await previousMonthResponse.json();
        renderPreviousMonthWinner(previousMonthData);

        // Fetch total win counts
        const totalResponse = await fetch('/api/wie-ben-ik/total-scores');
        const totalData = await totalResponse.json();
        if (totalData.success && totalData.scores.length > 0) {
            renderWinCounts(totalData.scores, 'total-score-list');
        }
    } catch (error) {
        console.error('Failed to load scores:', error);
    }

    function renderLastGameScore(data) {
        const lastGameHeader = document.getElementById('last-game-header');
        const linkContainer = document.getElementById('last-game-link');
        const titleEl = document.getElementById('last-game-title');

        if (data.success) {
            lastGameHeader.textContent = 'Laatste Spel:';
            const winnersText = (data.winners && data.winners.length > 0)
                ? `👑 Gewonnen door <span class="highlight-word">${data.winners.join(' en ')}</span> in ronde ${data.round} 👑`
                : 'Niemand heeft gewonnen';
            titleEl.innerHTML = `Thema: <span class="highlight-word">${data.theme_name || '?'}</span> — ${winnersText}`;

            linkContainer.innerHTML = '';
            const viewGameContainer = document.createElement('div');
            viewGameContainer.classList.add('view-game-container');

            const viewGameLink = document.createElement('a');
            viewGameLink.href = `/wie-ben-ik/past-game.html?game_id=${data.game_id}`;
            viewGameLink.textContent = 'Bekijk dit spel';
            viewGameLink.classList.add('view-game-button');

            viewGameContainer.appendChild(viewGameLink);
            linkContainer.appendChild(viewGameContainer);
        } else {
            lastGameHeader.textContent = 'Laatste Spel';
            titleEl.innerHTML = '';
            linkContainer.innerHTML = '';
        }
    }

    function renderWinCounts(scores, listId) {
        const orderedList = document.getElementById(listId);
        if (listId === 'monthly-score-list') {
            const currentMonth = new Date().toISOString().slice(0, 7);
            document.getElementById('current-month-header').textContent = `Keer goed geraden in ${getMonthName(currentMonth)}`;
        }

        orderedList.innerHTML = '';
        scores.sort((a, b) => b.wins - a.wins);

        let currentRank = 1;
        let previousWins = null;

        scores.forEach((entry, index) => {
            if (previousWins !== null && entry.wins < previousWins) {
                currentRank = index + 1;
            }
            previousWins = entry.wins;

            const listItem = document.createElement('li');
            listItem.innerHTML = `<span class="rank">${currentRank}.</span>
                                  <span class="username">${entry.username}</span>
                                  <span class="score">${entry.wins}</span>`;
            orderedList.appendChild(listItem);
        });
    }

    function renderNoScores() {
        const monthHeader = document.getElementById('current-month-header');
        const orderedList = document.getElementById('monthly-score-list');
        const currentMonth = new Date().toISOString().slice(0, 7);
        monthHeader.textContent = `Nog niemand heeft deze maand (${getMonthName(currentMonth)}) goed geraden.`;
        orderedList.innerHTML = '';
    }

    function renderPreviousMonthWinner(data) {
        const title = document.getElementById('previous-month-winner-title');
        const info = document.getElementById('previous-month-winner-info');
        const section = document.querySelector('.previous-month-winner');

        if (data.success && data.winner) {
            title.textContent = `Winnaar van ${getMonthName(getPreviousMonth())}:`;
            info.textContent = `${data.winner} met ${data.wins} keer goed geraden!`;
            section.style.display = 'block';
        } else {
            section.style.display = 'none';
        }
    }

    function getPreviousMonth() {
        const date = new Date();
        date.setDate(0);
        return date.toISOString().slice(0, 7);
    }

    function getMonthName(month) {
        const [year, monthNumber] = month.split('-');
        return new Date(year, monthNumber - 1).toLocaleString('nl-NL', { month: 'long', year: 'numeric' });
    }
});
