const pastelOchre = getComputedStyle(document.documentElement).getPropertyValue('--pastel-ochre').trim();
const pastelGreen = getComputedStyle(document.documentElement).getPropertyValue('--pastel-green').trim();
const gray = getComputedStyle(document.documentElement).getPropertyValue('--gray').trim();


document.addEventListener('DOMContentLoaded', async () => {
    const compareContainer = document.getElementById('compare-container');
    try {
        const response = await fetch('/api/get-results');
        const data = await response.json();
        if (data.success && data.results) {
            renderResults(data.results);
        }
    } catch (error) {
        console.error('Failed to load results:', error);
    }

    function renderResults(results) {
        // Sort results by solve time (earliest first)
        results.sort((a, b) => new Date(a.solveTime) - new Date(b.solveTime));

        // Header for the date
        const subHeader = document.createElement('h2');
        const solveDate = new Date(results[0].solveTime);
        subHeader.textContent = `${solveDate.getDate()} ${solveDate.toLocaleString('nl-NL', { month: 'short' })} ${solveDate.getFullYear()}`;
        subHeader.classList.add('results-date-header');
        compareContainer.appendChild(subHeader);
    
        results.forEach(result => {
            // Container for each user's result
            const userContainer = document.createElement('div');
            userContainer.classList.add('user-container');
    
            // Header for username, solve time, and score
            const header = document.createElement('div');
            header.classList.add('user-header');
    
            const solveTime = new Date(result.solveTime);
            const statusSymbol = result.success ? '✓' : '✗';
            header.innerHTML = `
                <span class="username">${statusSymbol} ${result.username}</span>
                <span class="score">⭐ Score: ${result.score}</span>
                <span class="solve-time">${result.success ? `⏰ ${solveTime.getHours().toString().padStart(2, '0')}:${solveTime.getMinutes().toString().padStart(2, '0')}` : "❌ Niet opgelost"}</span>
            `;
    
            userContainer.appendChild(header);
    

            // Create a grid for the user's guesses
            const gridContainer = document.createElement('div');
            gridContainer.classList.add('game-grid');
            gridContainer.style.gridTemplateColumns = 'repeat(5, 50px)';
            gridContainer.style.gridTemplateRows = `repeat(${result.guesses.length}, 50px)`;

            result.guesses.forEach((guess, rowIndex) => {
                for (let colIndex = 0; colIndex < guess.length; colIndex++) {
                    const letter = guess[colIndex];
                    const letterBox = document.createElement('div');
                    letterBox.classList.add('letter-box');
                    letterBox.textContent = letter;

                    // Apply feedback styles
                    const feedback = result.feedback[rowIndex][colIndex];
                    if (feedback === 'correct') {
                        letterBox.style.backgroundColor = pastelGreen;
                        letterBox.style.color = 'white';
                    } else if (feedback === 'misplaced') {
                        letterBox.style.backgroundColor = pastelOchre;
                        letterBox.style.color = 'white';
                    } else if (feedback === 'incorrect') {
                        letterBox.style.backgroundColor = gray;
                        letterBox.style.color = 'white';
                    }

                    gridContainer.appendChild(letterBox);
                }
            });


            userContainer.appendChild(gridContainer);
            compareContainer.appendChild(userContainer);
        });
    }
});
