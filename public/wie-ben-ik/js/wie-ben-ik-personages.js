//public/wie-ben-ik/js/wie-ben-ik-personages.js
let themes = [];

function show(id) {
    document.getElementById(id).classList.remove("hidden");
}

function renderTheme(themeId) {
    const theme = themes.find(t => t.id === themeId);
    if (!theme) return;

    document.getElementById("theme-count").textContent = `${theme.figuren.length} personages`;

    const listDiv = document.getElementById("characters-list");
    listDiv.innerHTML = "";
    const figures = [...theme.figuren].sort((a, b) => a.naam.localeCompare(b.naam, "nl"));
    figures.forEach((figuur) => {
        const card = document.createElement("div");
        card.classList.add("character-card");
        card.innerHTML = `
            <div class="character-name">${figuur.naam}</div>
            <div class="character-description">${figuur.omschrijving || ""}</div>
        `;
        listDiv.appendChild(card);
    });
}

async function init() {
    try {
        const response = await fetch("/api/wie-ben-ik/characters");
        if (response.status === 403) {
            const err = await response.json();
            document.getElementById("blocked-message").textContent =
                err.error || "De personagelijst is niet beschikbaar tijdens een spel.";
            show("blocked-container");
            return;
        }
        if (!response.ok) throw new Error("Failed to fetch characters.");
        const data = await response.json();
        themes = data.themes;

        const select = document.getElementById("theme-select");
        themes.forEach((theme) => {
            const option = document.createElement("option");
            option.value = theme.id;
            option.textContent = `${theme.naam} (${theme.figuren.length})`;
            select.appendChild(option);
        });
        select.addEventListener("change", () => renderTheme(select.value));

        show("browser-container");
        if (themes.length > 0) renderTheme(themes[0].id);
    } catch (error) {
        console.error("Error loading characters:", error);
        document.getElementById("blocked-message").textContent =
            "De personages konden niet geladen worden. Probeer het later opnieuw.";
        show("blocked-container");
    }
}

window.addEventListener("DOMContentLoaded", init);
