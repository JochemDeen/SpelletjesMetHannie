//public/wie-ben-ik/js/wie-ben-ik.js
const titles = {
    THEME: "Kies een thema!",
    QUESTION: "Stel je vraag!",
    VOTING: "Beantwoord de vragen!",
    WAITING: "Wie ben ik?",
    IDLE: "Wie ben ik?"
};

const gameTitleElement = document.getElementById("game-title");
const roundInfoElement = document.getElementById("round-info");

let lastRenderedState = null;
let lastRenderedRound = null;

function updateGameTitle(state) {
    switch (state) {
        case "theme-vote":
            gameTitleElement.textContent = titles.THEME;
            break;
        case "question":
            gameTitleElement.textContent = titles.QUESTION;
            break;
        case "voting":
            gameTitleElement.textContent = titles.VOTING;
            break;
        default:
            gameTitleElement.textContent = titles.IDLE;
            break;
    }
}

async function fetchGameState() {
    try {
        const response = await fetch("/api/wie-ben-ik/state");
        if (!response.ok) throw new Error("Failed to fetch game state.");
        const data = await response.json();
        console.log("Game state fetched:", data);
        return data;
    } catch (error) {
        console.error("Error fetching game state:", error);
        return { state: "idle" };
    }
}

function hideAllContainers() {
    const containers = [
        "off-container",
        "waiting-container",
        "theme-vote-container",
        "players-container",
        "question-container",
        "voting-container",
        "history-container"
    ];
    containers.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.classList.add("hidden");
    });
}

function show(id) {
    document.getElementById(id).classList.remove("hidden");
}

async function handleGameState(data) {
    const state = data.state;
    updateGameTitle(state);

    if (state === "scoring") {
        window.location.href = "/wie-ben-ik/scoreboard";
        return;
    }

    lastRenderedState = state;
    lastRenderedRound = data.round || null;

    hideAllContainers();

    if (data.round && data.round > 0 && data.theme_name) {
        roundInfoElement.textContent = `Thema: ${data.theme_name} — Ronde ${data.round}`;
        roundInfoElement.classList.remove("hidden");
    } else {
        roundInfoElement.classList.add("hidden");
    }

    switch (state) {
        case "Off":
            show("off-container");
            if (data.reason) {
                document.getElementById("off-message").textContent = data.reason;
            }
            break;
        case "theme-vote":
            show("theme-vote-container");
            await renderThemeOptions();
            break;
        case "theme-vote-waiting":
            show("waiting-container");
            document.getElementById("waiting-message").textContent =
                "Je stem is binnen! Wachten tot iedereen een thema heeft gekozen...";
            await renderPlayers(true);
            break;
        case "question":
            show("question-container");
            await renderPlayers();
            await renderHistory();
            break;
        case "question-waiting":
            show("waiting-container");
            document.getElementById("waiting-message").textContent =
                "Je vraag is binnen! Wachten tot iedereen een vraag heeft gesteld...";
            await renderPlayers();
            await renderHistory();
            break;
        case "voting":
            show("voting-container");
            await renderVoting();
            await renderPlayers();
            await renderHistory();
            break;
        case "voting-waiting":
            show("waiting-container");
            document.getElementById("waiting-message").textContent =
                "Je hebt overal op gestemd! Wachten op de stemmen van de anderen...";
            await renderPlayers();
            await renderHistory();
            break;
        default:
            show("waiting-container");
            document.getElementById("waiting-message").textContent = "Even wachten...";
            break;
    }
}

// ----------------------
// Theme vote
// ----------------------
async function renderThemeOptions() {
    const optionsDiv = document.getElementById("theme-options");
    optionsDiv.innerHTML = "";
    try {
        const response = await fetch("/api/wie-ben-ik/themes");
        const data = await response.json();
        const icons = {
            wereldleiders: "👑", wetenschappers: "🔬", stripfiguren: "💬",
            sprookjes: "🏰", bekende_mensen: "⭐", superhelden_games: "🦸",
            religie_mythologie: "⚡", disney: "🐭", alle: "🌈"
        };
        data.themes.forEach((theme) => {
            const btn = document.createElement("button");
            btn.classList.add("theme-option");
            if (theme.id === "alle") btn.classList.add("theme-all");
            btn.innerHTML = `
                <span class="theme-icon">${icons[theme.id] || "🎭"}</span>
                <span class="theme-name">${theme.naam}</span>
                <small>(${theme.aantal} personages)</small>
            `;
            btn.addEventListener("click", async () => {
                try {
                    const res = await fetch("/api/wie-ben-ik/theme-vote", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ theme_id: theme.id })
                    });
                    if (!res.ok) {
                        const err = await res.json();
                        alert(err.error || "Stemmen is niet gelukt.");
                    }
                } catch (error) {
                    console.error("Error submitting theme vote:", error);
                }
                initGame();
            });
            optionsDiv.appendChild(btn);
        });
    } catch (error) {
        console.error("Error fetching themes:", error);
    }
}

// ----------------------
// Players & characters
// ----------------------
async function renderPlayers(themeVotePhase = false) {
    try {
        const response = await fetch("/api/wie-ben-ik/players");
        if (!response.ok) return;
        const data = await response.json();
        const listDiv = document.getElementById("players-list");
        listDiv.innerHTML = "";

        data.players.forEach((player) => {
            const card = document.createElement("div");
            card.classList.add("player-card");
            if (player.is_me) card.classList.add("player-me");

            if (themeVotePhase) {
                const voted = player.has_voted_theme ? "✅ heeft gestemd" : "⏳ moet nog stemmen";
                card.innerHTML = `
                    <div class="player-name">${player.username}${player.is_me ? " (jij)" : ""}</div>
                    <div class="player-status">${voted}</div>
                `;
            } else if (player.is_me) {
                card.innerHTML = `
                    <div class="player-name">${player.username} (jij)</div>
                    <div class="character-name mystery">???</div>
                    <div class="character-description">Raad wie je bent!</div>
                `;
            } else {
                card.innerHTML = `
                    <div class="player-name">${player.username}</div>
                    <div class="character-name">${player.character_name || "?"}</div>
                    <div class="character-description">${player.character_description || ""}</div>
                `;
            }
            listDiv.appendChild(card);
        });
        show("players-container");
    } catch (error) {
        console.error("Error fetching players:", error);
    }
}

// ----------------------
// Ask a question / make a guess
// ----------------------
async function submitQuestion() {
    const input = document.getElementById("question-input");
    const guessCheckbox = document.getElementById("guess-checkbox");
    const submitButton = document.getElementById("submit-question");
    const text = input.value.trim();

    if (!text) {
        alert("Je hebt niks ingevuld!");
        return;
    }
    const isGuess = guessCheckbox.checked;
    if (isGuess && !confirm(`Je doet een GOK: "${text}"\n\nAls de anderen het ermee eens zijn, heb je gewonnen. Doorgaan?`)) {
        return;
    }

    submitButton.disabled = true;
    try {
        const response = await fetch("/api/wie-ben-ik/question", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, is_guess: isGuess })
        });
        if (!response.ok) {
            const err = await response.json();
            alert(err.error || "Versturen is niet gelukt.");
        } else {
            input.value = "";
            guessCheckbox.checked = false;
        }
    } catch (error) {
        console.error("Error submitting question:", error);
    }
    submitButton.disabled = false;
    initGame();
}

// ----------------------
// Voting
// ----------------------
async function renderVoting() {
    const listDiv = document.getElementById("voting-list");
    listDiv.innerHTML = "";
    try {
        const response = await fetch("/api/wie-ben-ik/to-vote");
        const data = await response.json();

        if (!data.questions || data.questions.length === 0) {
            initGame();
            return;
        }

        data.questions.forEach((q) => {
            const card = document.createElement("div");
            card.classList.add("vote-card");
            if (q.is_guess) card.classList.add("vote-guess");

            const adviceHtml = (q.is_guess && q.llm_advice)
                ? `<div class="llm-advice">💡 De computer denkt: <strong>${q.llm_advice.toUpperCase()}</strong></div>`
                : "";

            card.innerHTML = `
                <div class="vote-question-header">
                    ${q.is_guess ? '<span class="guess-badge">🎯 GOK</span>' : ""}
                    <span class="vote-asker">${q.username}</span> is
                    <span class="vote-character">${q.character_name}</span>
                    <span class="vote-character-hint">(${q.character_description || ""})</span>
                </div>
                <div class="vote-question-text">"${q.text}"</div>
                ${adviceHtml}
                <div class="vote-buttons">
                    <button class="vote-btn vote-ja" data-answer="ja">Ja</button>
                    <button class="vote-btn vote-nee" data-answer="nee">Nee</button>
                    <button class="vote-btn vote-onbekend" data-answer="??">?</button>
                </div>
            `;

            card.querySelectorAll(".vote-btn").forEach((btn) => {
                btn.addEventListener("click", async () => {
                    const answer = btn.dataset.answer;

                    // If the voter goes against the LLM suggestion on a guess, double-check.
                    if (q.is_guess && q.llm_advice && answer !== "??" && answer !== q.llm_advice) {
                        const sure = confirm(`De computer denkt "${q.llm_advice.toUpperCase()}", maar jij stemt "${answer.toUpperCase()}".\n\nWeet je het zeker?`);
                        if (!sure) return;
                    }

                    card.querySelectorAll(".vote-btn").forEach(b => b.disabled = true);
                    try {
                        const res = await fetch("/api/wie-ben-ik/vote", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({ question_id: q.question_id, answer })
                        });
                        if (!res.ok) {
                            const err = await res.json();
                            alert(err.error || "Stemmen is niet gelukt.");
                        }
                    } catch (error) {
                        console.error("Error submitting vote:", error);
                    }
                    card.remove();
                    if (document.querySelectorAll("#voting-list .vote-card").length === 0) {
                        initGame();
                    }
                });
            });

            listDiv.appendChild(card);
        });
    } catch (error) {
        console.error("Error fetching questions to vote on:", error);
    }
}

// ----------------------
// History table
// ----------------------
async function renderHistory() {
    try {
        const response = await fetch("/api/wie-ben-ik/questions");
        if (!response.ok) return;
        const data = await response.json();
        if (!data.questions || data.questions.length === 0) return;

        const tableBody = document.getElementById("historyTableBody");
        tableBody.innerHTML = "";

        // Newest round on top
        const questions = [...data.questions].sort((a, b) =>
            b.round_number - a.round_number || a.question_id - b.question_id);

        questions.forEach((q) => {
            const row = document.createElement("tr");
            if (q.is_guess) row.classList.add("history-guess");
            if (q.is_mine) row.classList.add("history-mine");
            const censored = q.text === "***";
            let label = q.is_guess ? `🎯 ${q.text}` : q.text;
            if (censored) label = '<span class="censored">✨ nog geheim ✨</span>';
            const name = q.is_mine ? `<strong>${q.username} (jij)</strong>` : q.username;
            const pending = '<span class="pending">⏳</span>';
            row.innerHTML = `
                <td>${q.round_number}</td>
                <td>${name}</td>
                <td class="history-text">${label}</td>
                <td>${q.resolved ? q.ja : pending}</td>
                <td>${q.resolved ? q.nee : pending}</td>
                <td>${q.resolved ? q.onbekend : pending}</td>
            `;
            tableBody.appendChild(row);
        });
        show("history-container");
    } catch (error) {
        console.error("Error fetching history:", error);
    }
}

// ----------------------
// Init & polling
// ----------------------
async function initGame() {
    const data = await fetchGameState();
    await handleGameState(data);
}

async function pollGameState() {
    const data = await fetchGameState();
    // Only re-render when something changed, so typing a question isn't interrupted.
    if (data.state !== lastRenderedState || (data.round || null) !== lastRenderedRound) {
        await handleGameState(data);
    }
}

window.addEventListener("DOMContentLoaded", () => {
    initGame();
    setInterval(pollGameState, 8000);

    document.getElementById("submit-question").addEventListener("click", submitQuestion);
    document.getElementById("question-input").addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submitQuestion();
        }
    });
});
