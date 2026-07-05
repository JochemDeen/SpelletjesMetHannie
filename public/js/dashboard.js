async function updatePictionaryStatus() {
    const statusElement = document.querySelector(".game-card a[href='/pictionary'] .status-temp");

    if (!statusElement) return; // Safety check if element is missing

    try {
        const response = await fetch("/api/pictionary/state");
        if (!response.ok) throw new Error("Failed to fetch game state");

        const data = await response.json();
        const state = data.state || "idle";

        let text = "Wachten";
        let statusClass = "status-yellow";
        console.log('STATE', state);

        switch (state) {
            case "choose":
            case "drawing":
                text = "Tekenen";
                statusClass = "status-green";
                break;
            case "modify":
                text = "Aanpassingen";
                statusClass = "status-green";
                break;
            case "guessing":
                text = "Raden";
                statusClass = "status-green";
                break;
            case "feedback":
                text = "Beoordelen";
                statusClass = "status-green";
                break;
            case "guessing-watching":
                text = "Wachten";
                statusClass = "status-yellow";
                break;
            case "Off":
                text = "Uit";
                statusClass = "status-gray";
                break;
            case "scoring":
                text = "Afgelopen!";
                statusClass = "status-blue";
                break;
            default:
                text = "Wachten";
                statusClass = "status-yellow";
                break;
        }

        // Update the status display
        statusElement.textContent = text;
        statusElement.className = `status-temp ${statusClass}`;
        
    } catch (error) {
        console.error("Error fetching Pictionary status:", error);
        statusElement.textContent = "Error";
        statusElement.className = "status-temp status-red";
    }
}
async function updateWieBenIkStatus() {
    const statusElement = document.getElementById("wie-ben-ik-status");

    if (!statusElement) return; // Safety check if element is missing

    try {
        const response = await fetch("/api/wie-ben-ik/state");
        if (!response.ok) throw new Error("Failed to fetch game state");

        const data = await response.json();
        const state = data.state || "idle";

        let text = "Wachten";
        let statusClass = "status-yellow";

        switch (state) {
            case "theme-vote":
                text = "Kies thema";
                statusClass = "status-green";
                break;
            case "question":
                text = "Stel je vraag";
                statusClass = "status-green";
                break;
            case "voting":
                text = "Stemmen";
                statusClass = "status-green";
                break;
            case "theme-vote-waiting":
            case "question-waiting":
            case "voting-waiting":
                text = "Wachten";
                statusClass = "status-yellow";
                break;
            case "Off":
                text = "Uit";
                statusClass = "status-gray";
                break;
            case "scoring":
                text = "Afgelopen!";
                statusClass = "status-blue";
                break;
            default:
                text = "Wachten";
                statusClass = "status-yellow";
                break;
        }

        statusElement.textContent = text;
        statusElement.className = `status-temp ${statusClass}`;

    } catch (error) {
        console.error("Error fetching Wie ben ik status:", error);
        statusElement.textContent = "Error";
        statusElement.className = "status-temp status-red";
    }
}

function setupUpdateNotification() {
    const closeButton = document.getElementById('closeUpdate');
    const updateContainer = document.getElementById('updateContainer');
    
    // Bepaal de versie van de huidige update. 
    // Bij een volgende update verander je dit naar 'v3', 'v4', etc.
    const updateVersion = 'v2'; 
    const storageKey = `updateDismissed_${updateVersion}`;
    
    if (closeButton && updateContainer) {
        closeButton.addEventListener('click', () => {
            updateContainer.style.display = 'none';
            
            // Sla op dat deze specifieke update-versie is weggeklikt
            localStorage.setItem(storageKey, 'true');
        });
        
        // Controleer of de gebruiker DEZE specifieke update al heeft weggeklikt
        if (localStorage.getItem(storageKey) === 'true') {
            updateContainer.style.display = 'none';
        }
    }
}
// Run function once and refresh every 15 seconds
document.addEventListener("DOMContentLoaded", () => {
    updatePictionaryStatus();
    updateWieBenIkStatus();
    setupUpdateNotification();
    setInterval(updatePictionaryStatus, 15000);
    setInterval(updateWieBenIkStatus, 15000);
});
