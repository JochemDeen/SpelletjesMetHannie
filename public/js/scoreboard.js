document.addEventListener('DOMContentLoaded', async () => {
    let currentMonth = new Date().toISOString().slice(0, 7); // replaced by the server's (Dutch) month
    try {
      // Fetch monthly scores
      const response = await fetch('/api/get-monthly-scores');
      const data = await response.json();
      currentMonth = data.month;
      if (data.success && data.scores && data.scores.length) {
        renderMonthlyScores(data.scores);
      } else {
        // Handle case when there are no scores
        renderNoScores();
      }
  
      // Fetch highest scorer counts
      const responseHighest = await fetch('/api/get-highest-scorer-counts');
      const highestData = await responseHighest.json();
      if (highestData.success && Array.isArray(highestData.highestScores)) {
        renderHighestScores(highestData.highestScores);
      }

      // Fetch all-time top monthly scores
      const responseTopMonthly = await fetch('/api/get-top-monthly-scores?limit=3');
      const topMonthlyData = await responseTopMonthly.json();
      if (topMonthlyData.success && Array.isArray(topMonthlyData.topScores)) {
        renderTopMonthlyScores(topMonthlyData.topScores);
      }
    } catch (error) {
      console.error('Failed to load scores:', error);
    }

      // Render previous month winner
    renderPreviousMonthWinner();

  
    function renderMonthlyScores(scores) {
      const monthHeader = document.querySelector(`[data-month-section] h2[data-month]`);
      const orderedList = document.querySelector(`[data-month-section] ol[data-month-list]`);
    
      if (monthHeader && orderedList) {
        monthHeader.textContent = `Scores voor ${getMonthName(currentMonth)}`;
    
        // Sort descending by score; if scores are equal, return 0 (keeps order)
        scores.sort((a, b) => {
            const diff = b.score - a.score; 
            if (diff !== 0) return diff; 
            return Math.random() - 0.5; // Randomize order for equal scores
        });
    
        // Clear previous entries if any
        orderedList.innerHTML = '';
    
        let rank = 0;
        let lastScore = null;
        scores.forEach((score, index) => {
          // If the current score is less than the previous one, update the rank.
          if (lastScore === null || score.score < lastScore) {
            rank = index + 1;
          }
          lastScore = score.score;
    
          const listItem = document.createElement('li');
    
          const rankSpan = document.createElement('span');
          rankSpan.classList.add('rank');
          rankSpan.textContent = `${rank}.`;
    
          const username = document.createElement('span');
          username.classList.add('username');
          username.textContent = score.username;
    
          const scoreValue = document.createElement('span');
          scoreValue.classList.add('score');
          scoreValue.textContent = score.score;
    
          listItem.appendChild(rankSpan);
          listItem.appendChild(username);
          listItem.appendChild(scoreValue);
          orderedList.appendChild(listItem);
        });
      }
    }
    
  
    function renderNoScores() {
      const monthHeader = document.querySelector(`[data-month-section] h2[data-month]`);
      const orderedList = document.querySelector(`[data-month-section] ol[data-month-list]`);
      if (monthHeader && orderedList) {
        monthHeader.textContent = `Er zijn nog geen scores voor ${getMonthName(currentMonth)}.`;
        orderedList.innerHTML = '';
      }
    }

    // Last month's winner(s), as decided by the server (nobody wins a month without points)
    async function renderPreviousMonthWinner() {
      try {
        const data = await api('/api/get-previous-month-winner');
        const monthName = getMonthName(data.month);
        document.getElementById('previous-month-winner-title').textContent = `Winnaar van ${monthName}:`;
        document.getElementById('previous-month-winner-info').textContent = data.winners.length
          ? `${formatWinnerNames(data.winners)} met ${data.score} punten!`
          : 'Geen winnaar.';
      } catch (error) {
        console.error('Failed to load previous month winner:', error);
      }
    }


    function renderHighestScores(highestScores) {
      const orderedList = document.getElementById('highest-scorer-list');
      if (!orderedList) return;
  
      // Sort scores in descending order
      highestScores.sort((a, b) => {
        const diff = b.highestCount - a.highestCount; 
        if (diff !== 0) return diff; 
        return Math.random() - 0.5; // Randomize when scores are the same
    });
      // Clear previous entries if any
      orderedList.innerHTML = '';
  
      let rank = 0;
      let lastScore = null;
  
      highestScores.forEach((entry, index) => {
          // If the current score is less than the previous one, update the rank.
          if (lastScore === null || entry.highestCount < lastScore) {
              rank = index + 1;
          }
          lastScore = entry.highestCount;
  
          const listItem = document.createElement('li');
  
          const rankSpan = document.createElement('span');
          rankSpan.classList.add('rank');
          rankSpan.textContent = `${rank}.`;
  
          const username = document.createElement('span');
          username.classList.add('username');
          username.textContent = entry.username;
  
          const highestCount = document.createElement('span');
          highestCount.classList.add('score');
          highestCount.textContent = entry.highestCount;
  
          listItem.appendChild(rankSpan);
          listItem.appendChild(username);
          listItem.appendChild(highestCount);
          orderedList.appendChild(listItem);
      });
  }
    function renderTopMonthlyScores(topScores) {
      const orderedList = document.getElementById('top-monthly-scores-list');
      if (!orderedList) return;

      // Already sorted descending by the server, but sort defensively.
      topScores.sort((a, b) => b.score - a.score);

      orderedList.innerHTML = '';

      if (topScores.length === 0) {
        const listItem = document.createElement('li');
        listItem.textContent = 'Er zijn nog geen scores.';
        orderedList.appendChild(listItem);
        return;
      }

      topScores.forEach((entry, index) => {
        const listItem = document.createElement('li');

        const rankSpan = document.createElement('span');
        rankSpan.classList.add('rank');
        rankSpan.textContent = `${index + 1}.`;

        const username = document.createElement('span');
        username.classList.add('username');
        username.textContent = `${entry.username} (${getMonthName(entry.month)})`;

        const scoreValue = document.createElement('span');
        scoreValue.classList.add('score');
        scoreValue.textContent = entry.score;

        listItem.appendChild(rankSpan);
        listItem.appendChild(username);
        listItem.appendChild(scoreValue);
        orderedList.appendChild(listItem);
      });
    }

    function getMonthName(month) {
        const [year, monthNumber] = month.split('-');
        const date = new Date(year, monthNumber - 1);
        return date.toLocaleString('nl-NL', { month: 'long', year: 'numeric' });
    }
});

// Helper function to format winner names naturally
function formatWinnerNames(names) {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} en ${names[1]}`;
  return `${names.slice(0, -1).join(', ')} en ${names[names.length - 1]}`;
}