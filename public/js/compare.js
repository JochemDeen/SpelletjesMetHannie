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

        const subHeader = document.createElement('h2');
        const solveDate = new Date(results[0].solveTime);
        subHeader.textContent = `${solveDate.getDate()} ${solveDate.toLocaleString('nl-NL', { month: 'short' })} ${solveDate.getFullYear()}`;
        compareContainer.appendChild(subHeader);

        results.forEach(result => {
            // Create a user container
            const userContainer = document.createElement('div');
            userContainer.classList.add('user-container');

            // Create a header for the user's name and solve time
            const header = document.createElement('h2');
            const solveTime = new Date(result.solveTime);
            if (result.success) {
                header.textContent = `${result.username} - Opgelost om: ${solveTime.getHours().toString().padStart(2, '0')}:${solveTime.getMinutes().toString().padStart(2, '0')}`;
            } else {
                header.textContent = `${result.username} - Niet opgelost`;
            }
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
                        letterBox.style.backgroundColor = 'green';
                        letterBox.style.color = 'white';
                    } else if (feedback === 'misplaced') {
                        letterBox.style.backgroundColor = '#c9a228'; // Ochre yellow
                        letterBox.style.color = 'white';
                    } else if (feedback === 'incorrect') {
                        letterBox.style.backgroundColor = 'gray';
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
