// public/js/stats.js: the Woordle statistics page

document.addEventListener('DOMContentLoaded', async () => {
    try {
        const { stats } = await api('/api/get-stats');
        renderStatTiles(document.getElementById('stats-summary'), stats,
            ['totalGames', 'percentCorrect', 'currentStreak', 'maxStreak']);
        renderStatTiles(document.getElementById('score-summary'), stats,
            ['monthlyScore', 'totalScore']);
        renderDistribution(document.getElementById('guess-distribution'), stats.guessDistribution, stats.latestGuessIndex);
        renderStatTiles(document.getElementById('average-stats'), stats, ['averageGuess', 'medianGuess']);

        if (stats.latestGuessTime) {
            const time = new Date(stats.latestGuessTime);
            document.getElementById('latest-guess-time').textContent = time.toLocaleString('nl-NL', {
                day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit'
            });
        }
    } catch (error) {
        toast(error.message, { type: 'error' });
    }
});
