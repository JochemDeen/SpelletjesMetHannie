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

        switch (state) {
            case "choose":
            case "drawing":
                text = "Tekenen";
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

// Run function once and refresh every 15 seconds
document.addEventListener("DOMContentLoaded", () => {
    updatePictionaryStatus();
    setInterval(updatePictionaryStatus, 15000);
});