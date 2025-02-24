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

      // Render previous month winner
    renderPreviousMonthWinner();

  
    function renderMonthlyScores(scores) {
      const monthHeader = document.querySelector(`[data-month-section] h2[data-month]`);
      const orderedList = document.querySelector(`[data-month-section] ol[data-month-list]`);
    
      if (monthHeader && orderedList) {
        const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
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
        const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
        monthHeader.textContent = `Er zijn nog geen scores voor ${getMonthName(currentMonth)}.`;
        orderedList.innerHTML = '';
      }
    }

    // Render the previous month winner
    async function renderPreviousMonthWinner() {
      const previousMonth = getPreviousMonth();
      try {
        const response = await fetch(`/api/get-monthly-scores?month=${previousMonth}`);
        const data = await response.json();
        if (data.success && data.scores && data.scores.length > 0) {
          const scores = data.scores;
          // Sort descending by score (no secondary sort by name)
          scores.sort((a, b) => {
              const diff = b.score - a.score; 
              if (diff !== 0) return diff; 
              return Math.random() - 0.5; // Randomize order for equal scores
          });
          // The highest score is in the first entry
          const highestScore = scores[0].score;
          // In case of ties, collect all winners
          const winners = scores.filter(item => item.score === highestScore);
          const winnerNames = winners.map(item => item.username).join(', ');
          // Set the section text
          const monthName = getMonthName(previousMonth);
          document.getElementById('previous-month-winner-title').textContent = `Winnaar van ${monthName}:`;
          document.getElementById('previous-month-winner-info').textContent = `${winnerNames} met ${highestScore} punten!`;
        } else {
          // No scores for previous month
          const monthName = getMonthName(previousMonth);
          document.getElementById('previous-month-winner-title').textContent = `Winnaar van ${monthName}:`;
          document.getElementById('previous-month-winner-info').textContent = `Geen winnaar.`;
        }
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
    function getPreviousMonth() {
      const date = new Date();
      date.setMonth(date.getMonth() - 1);
      return date.toISOString().slice(0, 7);
    }
    

    function getMonthName(month) {
        const [year, monthNumber] = month.split('-');
        const date = new Date(year, monthNumber - 1);
        return date.toLocaleString('en-US', { month: 'long', year: 'numeric' });
    }
});
