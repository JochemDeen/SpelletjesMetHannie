document.addEventListener('DOMContentLoaded', async () => {
    try {
      // Fetch monthly scores
      const response = await fetch('/api/get-monthly-scores');
      const data = await response.json();
      if (data.success && data.scores) {
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
    } catch (error) {
      console.error('Failed to load scores:', error);
    }
  
    function renderMonthlyScores(scores) {
      const monthHeader = document.querySelector(`[data-month-section] h2[data-month]`);
      const orderedList = document.querySelector(`[data-month-section] ol[data-month-list]`);
  
      if (monthHeader && orderedList) {
        const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        monthHeader.textContent = `Scores voor ${getMonthName(currentMonth)}`;
  
        scores.sort((a, b) => b.score - a.score); // Sort by highest score
  
        // Clear previous entries if any
        orderedList.innerHTML = '';
  
        scores.forEach((score, index) => {
          const listItem = document.createElement('li');
  
          const rank = document.createElement('span');
          rank.classList.add('rank');
          rank.textContent = `${index + 1}.`;
  
          const username = document.createElement('span');
          username.classList.add('username');
          username.textContent = score.username;
  
          const scoreValue = document.createElement('span');
          scoreValue.classList.add('score');
          scoreValue.textContent = score.score;
  
          listItem.appendChild(rank);
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
        const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        monthHeader.textContent = `Er zijn nog geen scores voor ${getMonthName(currentMonth)}.`;
        orderedList.innerHTML = '';
      }
    }

    function renderHighestScores(highestScores) {
        const orderedList = document.getElementById('highest-scorer-list');
        if (!orderedList) return;

        highestScores.sort((a, b) => b.highestCount - a.highestCount); // Sort by highest count

        // Clear previous entries if any
        orderedList.innerHTML = '';

        highestScores.forEach((entry, index) => {
            const listItem = document.createElement('li');

            const rank = document.createElement('span');
            rank.classList.add('rank');
            rank.textContent = `${index + 1}.`;

            const username = document.createElement('span');
            username.classList.add('username');
            username.textContent = entry.username;

            const highestCount = document.createElement('span');
            highestCount.classList.add('score');
            highestCount.textContent = entry.highestCount;

            listItem.appendChild(rank);
            listItem.appendChild(username);
            listItem.appendChild(highestCount);
            orderedList.appendChild(listItem);
        });
    }

    function getMonthName(month) {
        const [year, monthNumber] = month.split('-');
        const date = new Date(year, monthNumber - 1);
        return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
});
