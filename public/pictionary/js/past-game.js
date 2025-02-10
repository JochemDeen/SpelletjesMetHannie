document.addEventListener("DOMContentLoaded", async function () {
    const urlParams = new URLSearchParams(window.location.search);
    let gameId = urlParams.get("game_id");

    if (!gameId) {
        console.error("No game_id provided");
        return;
    }

    async function fetchGameData(gameId) {
        try {
            const response = await fetch(`/api/pictionary/get-game?game_id=${gameId}`);
            if (!response.ok) throw new Error("Failed to fetch game data.");
            return await response.json();
        } catch (error) {
            console.error("Error fetching game data:", error);
        }
    }

    async function updateGameView(gameId) {
        const data = await fetchGameData(gameId);
        if (!data) return;
        console.log(data);

        const date = formatDate(new Date(data.date));

        // Update game info (game ID + date)
        document.getElementById("game-info").textContent = `Spel ${gameId} (${date})`;

        // Handle navigation buttons
        const prevButton = document.getElementById("prevDateButton");
        const nextButton = document.getElementById("nextDateButton");

        if (data.prev_game_id) {
            prevButton.style.display = "inline-block";
            prevButton.onclick = () => updateGameView(data.prev_game_id);
        } else {
            prevButton.style.display = "none";
        }

        if (data.next_game_id) {
            nextButton.style.display = "inline-block";
            nextButton.onclick = () => updateGameView(data.next_game_id);
        } else {
            nextButton.style.display = "none";
        }

        const difficulty = data.difficulty === "easy" ? "Makkelijk" : data.difficulty === "medium" ? "Gemiddeld" : "Moeilijk";
        
        // Show the drawing
        document.getElementById("image-canvas").innerHTML = `
            <h3>Tekening door ${data.drawer}</h3>
            <img src="${data.imageSrc}" alt="Drawing by ${data.drawer}" style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;" />
            <p style="font-size: 20px;margin: 6px 0 0 0">Getekend woord: <strong>${data.word}</strong></p>
            <p style="font-size: 14px;margin: 0 0">(Moeilijkheidsgraad: ${difficulty})</p>
        `;

        // Show guesses
        const tableBody = document.getElementById("guessesTableBody");
        tableBody.innerHTML = "";
        data.guesses.forEach((guess) => {
            const row = document.createElement("tr");
            const formattedTime = formatGuessTime(guess.time);
            row.innerHTML = `
                <td>${guess.round_number}</td>
                <td>${guess.username}</td>
                <td>${formattedTime}</td>
                <td>${guess.text}${guess.feedback == 5 ? ' ⭐' : ''}</td>
                <td>${guess.feedback}</td>
            `;
            tableBody.appendChild(row);
        });
    }

    updateGameView(gameId);
});
const formatDate = (date) => {
    const year = date.getFullYear();
    const month = date.toLocaleString('nl-NL', { month: 'short' }); // jan, feb, etc.

    //const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${day} ${month} ${year}`;
};
function formatGuessTime(isoString) {
    // isoString might be "2025-01-01 10:00" or "2025-01-01T10:00:00Z"
    // If you need a quick parse hack:
    // 1) Convert "2025-01-01 10:00" -> "2025-01-01T10:00"
    let normalized = isoString.replace(" ", "T");
    // Then parse
    const d = new Date(normalized);
    
    if (isNaN(d.getTime())) return isoString; // fallback if invalid
    
    // Format like "1-jan 10:00"
    // (Using Dutch style, but you can adapt)
    const day = d.getDate();
    const month = d.toLocaleString('nl-NL', { month: 'short' }); // jan, feb, etc.
    const hour = String(d.getHours()).padStart(2, '0');
    const minute = String(d.getMinutes()).padStart(2, '0');
    
    return `${hour}:${minute}`;
  }
  