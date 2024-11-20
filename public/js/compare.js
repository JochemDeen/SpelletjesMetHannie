const pastelOchre = getComputedStyle(document.documentElement).getPropertyValue('--pastel-ochre').trim();
const pastelGreen = getComputedStyle(document.documentElement).getPropertyValue('--pastel-green').trim();
const gray = getComputedStyle(document.documentElement).getPropertyValue('--gray').trim();

document.addEventListener('DOMContentLoaded', async () => {
    const compareContainer = document.getElementById('compare-container');
    const currentDateElem = document.getElementById('currentDate');
    const prevDateButton = document.getElementById('prevDateButton');
    const nextDateButton = document.getElementById('nextDateButton');
    let selectedDate = new Date();
    let earliestDate;

    // Fetch the earliest date from the backend
    const fetchEarliestDate = async () => {
        try {
            const response = await fetch('/api/get-earliest-date');
            const data = await response.json();
            if (data.success) {
                return new Date(data.earliestDate); // Format from backend: YYYY-MM-DD
            } else {
                console.error('Failed to fetch earliest date:', data.message);
                return new Date(); // Fallback to today
            }
        } catch (error) {
            console.error('Error fetching earliest date:', error);
            return new Date(); // Fallback to today
        }
    };

    earliestDate = await fetchEarliestDate();


    // Format date as YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };

    // Update button states based on the selected date
    const updateButtonVisibility = () => {
        const normalizeDate = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
        const normalizedSelectedDate = normalizeDate(selectedDate);
        const normalizedToday = normalizeDate(new Date());
        const normalizedEarliestDate = normalizeDate(earliestDate);
    
        prevDateButton.style.display = normalizedSelectedDate <= normalizedEarliestDate ? 'none' : 'inline-block';
        nextDateButton.style.display = normalizedSelectedDate >= normalizedToday ? 'none' : 'inline-block';
    };
        // Update the displayed date and fetch results
    const updateDateDisplay = async () => {
        currentDateElem.textContent = formatDate(selectedDate);
        await fetchAndRenderResults(formatDate(selectedDate));
        updateButtonVisibility(); // Ensure buttons are correctly shown or hidden
    };


    // Fetch results for the selected date
    const fetchAndRenderResults = async (date) => {
        try {
            const response = await fetch(`/api/get-results?date=${date}`);
            const data = await response.json();
            compareContainer.innerHTML = ""; // Clear existing results

            if (data.success && data.results) {
                renderResults(data.results);
            } else {
                compareContainer.innerHTML = `<p>No results available for this date.</p>`;
            }
        } catch (error) {
            console.error('Failed to load results:', error);
            compareContainer.innerHTML = `<p>Error fetching results. Please try again later.</p>`;
        }
    };

    // Render results
    const renderResults = (results) => {
        results.sort((a, b) => new Date(a.solveTime) - new Date(b.solveTime));

        results.forEach(result => {
            const userContainer = document.createElement('div');
            userContainer.classList.add('user-container');

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

            const gridContainer = document.createElement('div');
            gridContainer.classList.add('game-grid');
            gridContainer.style.gridTemplateColumns = 'repeat(5, 50px)';
            gridContainer.style.gridTemplateRows = `repeat(${result.guesses.length}, 50px)`;

            result.guesses.forEach((guess, rowIndex) => {
                for (let colIndex = 0; colIndex < guess.length; colIndex++) {
                    const letterBox = document.createElement('div');
                    letterBox.classList.add('letter-box');
                    letterBox.textContent = guess[colIndex];

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
    };

    prevDateButton.addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() - 1);
        updateDateDisplay();
    });

    nextDateButton.addEventListener('click', () => {
        selectedDate.setDate(selectedDate.getDate() + 1);
        updateDateDisplay();
    });

    

    // Initialize
    updateDateDisplay();
});
