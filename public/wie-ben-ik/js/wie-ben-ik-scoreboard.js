//public/wie-ben-ik/js/wie-ben-ik-scoreboard.js
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch last game score
        const lastGameResponse = await fetch('/api/wie-ben-ik/last-game-score');
        const lastGameData = await lastGameResponse.json();
        renderLastGameScore(lastGameData);

        // Fetch monthly scores
        const monthResponse = await fetch('/api/wie-ben-ik/monthly-scores');
        const monthData = await monthResponse.json();
        if (monthData.success && monthData.scores.length > 0) {
            renderMonthlyScores(monthData.scores);
        } else {
            renderNoScores();
        }

        // Fetch last month's winner
        const previousMonthResponse = await fetch('/api/wie-ben-ik/previous-month-winner');
        const previousMonthData = await previousMonthResponse.json();
        renderPreviousMonthWinner(previousMonthData);
    } catch (error) {
        console.error('Failed to load scores:', error);
    }

    function renderLastGameScore(data) {
        const lastGameHeader = document.getElementById('last-game-header');
        const lastGameList = document.getElementById('last-game-list');
        const titleEl = document.getElementById('last-game-title');

        if (data.success && Array.isArray(data.score) && data.score.length > 0) {
            lastGameHeader.textContent = 'Laatste Spel:';
            const winnersText = (data.winners && data.winners.length > 0)
                ? `👑 Gewonnen door <span class="highlight-word">${data.winners.join(' en ')}</span> in ronde ${data.round} 👑`
                : 'Niemand heeft gewonnen';
            titleEl.innerHTML = `Thema: <span class="highlight-word">${data.theme_name || '?'}</span> — ${winnersText}`;

            lastGameList.innerHTML = '';
            data.score.sort((a, b) => b.score - a.score);

            let currentRank = 1;
            let previousScore = null;

            data.score.forEach((entry, index) => {
                if (previousScore !== null && entry.score < previousScore) {
                    currentRank = index + 1;
                }
                previousScore = entry.score;

                const listItem = document.createElement('li');
                listItem.innerHTML = `<span class="rank">${currentRank}.</span>
                                      <span class="username">${entry.username}</span>
                                      <span class="score">${entry.score}</span>`;
                lastGameList.appendChild(listItem);
            });

            // Add a link to view this game (all characters visible)
            const viewGameContainer = document.createElement('div');
            viewGameContainer.classList.add('view-game-container');

            const viewGameLink = document.createElement('a');
            viewGameLink.href = `/wie-ben-ik/past-game.html?game_id=${data.game_id}`;
            viewGameLink.textContent = 'Bekijk dit spel';
            viewGameLink.classList.add('view-game-button');

            viewGameContainer.appendChild(viewGameLink);
            lastGameList.appendChild(viewGameContainer);
        } else {
            lastGameHeader.textContent = 'Laatste Spel';
            lastGameList.innerHTML = '<li>Geen score beschikbaar</li>';
            titleEl.innerHTML = '';
        }
    }

    function renderMonthlyScores(scores) {
        const monthHeader = document.getElementById('current-month-header');
        const orderedList = document.getElementById('monthly-score-list');

        const currentMonth = new Date().toISOString().slice(0, 7);
        monthHeader.textContent = `Scores voor ${getMonthName(currentMonth)}`;

        orderedList.innerHTML = '';
        scores.sort((a, b) => b.total_score - a.total_score);

        let currentRank = 1;
        let previousScore = null;

        scores.forEach((score, index) => {
            if (previousScore !== null && score.total_score < previousScore) {
                currentRank = index + 1;
            }
            previousScore = score.total_score;

            const listItem = document.createElement('li');
            listItem.innerHTML = `<span class="rank">${currentRank}.</span>
                                  <span class="username">${score.username}</span>
                                  <span class="score">${score.total_score}</span>`;
            orderedList.appendChild(listItem);
        });
    }

    function renderNoScores() {
        const monthHeader = document.getElementById('current-month-header');
        const orderedList = document.getElementById('monthly-score-list');
        const currentMonth = new Date().toISOString().slice(0, 7);
        monthHeader.textContent = `Er zijn nog geen scores voor ${getMonthName(currentMonth)}.`;
        orderedList.innerHTML = '';
    }

    function renderPreviousMonthWinner(data) {
        const title = document.getElementById('previous-month-winner-title');
        const info = document.getElementById('previous-month-winner-info');
        const section = document.querySelector('.previous-month-winner');

        if (data.success && data.winner) {
            title.textContent = `Winnaar van ${getMonthName(getPreviousMonth())}:`;
            info.textContent = `${data.winner} met ${data.score} punten!`;
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
