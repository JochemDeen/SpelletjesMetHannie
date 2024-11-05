document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Fetch statistics from the server
        const response = await fetch('/api/get-stats');
        const data = await response.json();
        if (data.success) {
            updateStatsSummary(data.stats);
            renderGuessDistribution(data.stats.guessDistribution, data.stats.latestGuessIndex);
            updateAverageStats(data.stats);
        }
    } catch (error) {
        console.error('Failed to load statistics:', error);
    }

    function updateStatsSummary(stats) {
        document.getElementById('total-games').textContent = stats.totalGames;
        document.getElementById('percent-correct').textContent = `${Math.round(stats.percentCorrect)}%`;
        document.getElementById('current-streak').textContent = stats.currentStreak;
        document.getElementById('max-streak').textContent = stats.maxStreak;
        document.getElementById('total-score').textContent = stats.totalScore; // Update total score
        document.getElementById('monthly-score').textContent = stats.monthlyScore; // Update monthly score
    }

    function renderGuessDistribution(guessDistribution, latestGuessIndex) {
        const guessDistributionContainer = document.getElementById('guess-distribution');
        guessDistributionContainer.innerHTML = ''; // Clear any existing content

        for (let i = 1; i <= 6; i++) {
            const barWrapper = document.createElement('div');
            barWrapper.style.display = 'flex';
            barWrapper.style.alignItems = 'center';
            barWrapper.style.marginBottom = '10px';

            const label = document.createElement('div');
            label.textContent = `${i}`;
            label.style.marginRight = '5px';
            label.style.fontWeight = 'bold';
            label.style.width = '100px';
            label.style.textAlign = 'right';

            const barContainer = document.createElement('div');
            barContainer.classList.add('bar');
            barContainer.style.width = `${guessDistribution[i] * 10}%`;
            barContainer.textContent = `${guessDistribution[i]}`;
            barContainer.style.backgroundColor = (i === latestGuessIndex) ? 'green' : '#4d4d4d';

            barWrapper.appendChild(label);
            barWrapper.appendChild(barContainer);
            guessDistributionContainer.appendChild(barWrapper);
        }
    }

    function updateAverageStats(stats) {
        document.getElementById('average-guess').textContent = stats.averageGuess;
        document.getElementById('median-guess').textContent = stats.medianGuess;

        const latestGuessTime = new Date(stats.latestGuessTime);
        const formattedDate = `${latestGuessTime.getDate()}-${latestGuessTime.toLocaleString('nl-NL', { month: 'short' })} ${latestGuessTime.getHours().toString().padStart(2, '0')}:${latestGuessTime.getMinutes().toString().padStart(2, '0')}`;
        document.getElementById('latest-guess-time').textContent = formattedDate;
    }
});
