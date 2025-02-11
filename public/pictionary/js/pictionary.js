//import axios from 'axios';

const titles = {
    DRAW: "Teken je woord!",
    CHOOSE: "Kies een moeilijkheidsgraad!",
    GUESS: "Raad het woord!",
    GRADE: "Beoordeel de antwoorden!",
    IDLE: "Pictionary!"
};
const gameTitleElement = document.getElementById("game-title");

function updateGameTitle(state) {
    switch (state) {
        case "drawing":
            gameTitleElement.textContent = titles.DRAW;
            break;
        case "choose":
            gameTitleElement.textContent = titles.CHOOSE;
            break;
        case "guessing":
            gameTitleElement.textContent = titles.GUESS;
            break;
        case "feedback":
            gameTitleElement.textContent = titles.GRADE;
            break;
        default:
            gameTitleElement.textContent = titles.IDLE;
            break;
    }
}

// Function to Fetch the Initial Game State
async function fetchGameState() {
    try {
        const response = await fetch("/api/pictionary/state");
        if (!response.ok) throw new Error("Failed to fetch initial game state.");
        
        const data = await response.json();
        console.log("Initial data fetched:", data);
        return data.state; // Assuming response has { state: "draw/choose/guess/idle" }
    } catch (error) {
        console.error("Error fetching game state:", error);
        return "idle"; // Default to idle state
    }
  
}

// Function to Handle the Game State
function handleGameState(state) {
    updateGameTitle(state);

      // If the game is in the "scoring" state, redirect to the scoreboard
      if (state === "scoring") {
        window.location.href = "/pictionary/scoreboard";
        return; 
    }
  
    // 1. Hide all relevant containers first
    hideAllContainers();
  
    // 2. Show the container & call the function for the chosen state
    switch (state) {
      case "drawing":
        document.getElementById("drawing-container").classList.remove("hidden");
        handleDraw(); // or pass the canvasRef or any other args if needed
        break;
      case "choose":
        document.getElementById("word-selection").classList.remove("hidden");
        document.getElementById("difficulty-options").classList.remove("hidden");
        handleChoose();
        break;
      case "guessing":
        document.getElementById("guess-container").classList.remove("hidden");
        document.getElementById("guessing").classList.remove("hidden");

        document.getElementById("guess-submission-controls").classList.remove("hidden");
        handleGuess();
        break;
    case "guessing-watching":
        document.getElementById("guess-container").classList.remove("hidden");
        document.getElementById("guessing").classList.remove("hidden");
        document.getElementById("guess-submission-controls").classList.add("hidden"); // Hide input & button
        handleGuess();
        break;
    
      case "feedback":
        document.getElementById("grading-guesses").classList.remove("hidden");
        handleGrade();
        break;
      default:
        break;
    }
  }
  
function hideAllContainers() {
    const containers = [
      "word-selection",
      "drawing-container",
      "guess-submission",
      "guesses-table-container",
      "grading-guesses",
    ];
  
    containers.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.add("hidden");
    });
  }


const handleDraw = async () => {
    const canvas = document.getElementById("drawing-canvas");
    const canvasRef = { current: canvas };
    const wordTitleEl = document.getElementById("draw-word-title");
    const finishButton = document.getElementById("finish-drawing");
    finishButton.disabled = false; // enable at start
  
    try{
    // 1. Start the drawing session and get the countdown duration
    const startResponse = await axios.post('/api/pictionary/start-drawing');

    if (startResponse.status !== 200) {
      throw new Error('Failed to initialize drawing session.');
    }

    const countdownDuration = startResponse.data.countdown; // Duration in seconds
    const wordToDraw = startResponse.data.word;

    wordTitleEl.innerHTML = `Teken een <span class="highlight-word">${wordToDraw}</span>, je hebt ${countdownDuration} seconden`;
    console.log(`Countdown started: ${countdownDuration} seconds`);
  
    // 2. Start the timer and enable the canvas for drawing
    const { timerBar, timerInterval } = startCountdown(countdownDuration);

    enableDrawing(canvasRef);

    finishButton.addEventListener("click", () => {
        finishButton.disabled = true;
        disableDrawing(canvasRef);
        disableColors();

        clearInterval(timerInterval);
        console.log("Done button clicked. Drawing disabled, timer frozen.")
        // If you want to submit right away:
        submitDrawing(canvasRef, timerBar);
      });

    // 3. When the countdown finishes, submit the drawing automatically
    setTimeout(async () => {
        finishButton.disabled = true;
        disableDrawing(canvasRef);
        disableColors();
        console.log("Time's up – disabled drawing and button.");
  
      await submitDrawing(canvasRef, timerBar);
    }, countdownDuration * 1000);
  } catch (error) {
    console.error('Error in handleDraw:', error.message);
  }
};

function disableColors() {
    const colorButtons = document.querySelectorAll('#color-picker .color');
    colorButtons.forEach(btn => {
      btn.classList.add('hidden');
    });

    const eraserBtn = document.getElementById('eraser-button');
    eraserBtn.classList.add('hidden');
}
function disableDrawing(canvasRef) {
    const canvas = canvasRef.current;
    // Easiest way: remove event listeners
    canvas.removeEventListener("mousedown", canvasRef.startMouseDrawing);
    canvas.removeEventListener("mousemove", canvasRef.moveMouseDrawing);
    canvas.removeEventListener("mouseup", canvasRef.stopMouseDrawing);
  
    canvas.removeEventListener("touchstart", canvasRef.startTouchDrawing);
    canvas.removeEventListener("touchmove", canvasRef.moveTouchDrawing);
    canvas.removeEventListener("touchend", canvasRef.stopTouchDrawing);
    }

function startCountdown(duration) {
    const timerBar = document.getElementById("timer-bar");
    if (!timerBar) return null; // Defensive check
    
    let timeLeft = duration;
    
    // Update progress bar every second
    const timerInterval = setInterval(() => {
        timeLeft -= 1;
        const percentage = (timeLeft / duration) * 100;
        timerBar.style.width = `${percentage}%`;
    
        if (timeLeft <= 0) {
        clearInterval(timerInterval);
        }
    }, 1000);
    
    return { timerBar, timerInterval };
    }

  const enableDrawing = (canvasRef) => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let drawing = false;
    let selectedColor = '#000000'; // Default color
    let selectedTool = "pen";
  
// ===================
  // HOOK UP THE COLORS
  // ===================
  document.querySelectorAll("#color-picker .color")
    .forEach((colorBtn) => {
        colorBtn.addEventListener("click", () => {
            selectedTool = "pen";
        selectedColor = colorBtn.dataset.color;
        console.log("Color changed to:", selectedColor);
        });
    });

// ===================
  // HOOK UP THE ERASER
  // ===================
  const eraserBtn = document.getElementById("eraser-button");
  eraserBtn.addEventListener("click", () => {
    selectedTool = "eraser";
    console.log("Tool changed to eraser");
  });

  // 4. Add the listeners
  canvas.addEventListener("mousedown", startMouseDrawing);
  canvas.addEventListener("mousemove", moveMouseDrawing);
  canvas.addEventListener("mouseup", stopMouseDrawing);

  canvas.addEventListener("touchstart", startTouchDrawing, { passive: false });
  canvas.addEventListener("touchmove", moveTouchDrawing, { passive: false });
  canvas.addEventListener("touchend", stopTouchDrawing);

  // 5. Attach references so we can remove them later
  canvasRef.startMouseDrawing = startMouseDrawing;
  canvasRef.moveMouseDrawing = moveMouseDrawing;
  canvasRef.stopMouseDrawing = stopMouseDrawing;
  canvasRef.startTouchDrawing = startTouchDrawing;
  canvasRef.moveTouchDrawing = moveTouchDrawing;
  canvasRef.stopTouchDrawing = stopTouchDrawing;

    function startMouseDrawing(e) {
        drawing = true;
        ctx.beginPath();

        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        // offsetX is usually scaled automatically, but to be consistent:
        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        ctx.moveTo(x, y);
      }
    
      function moveMouseDrawing(e) {
        if (!drawing) return;
        const rect = canvas.getBoundingClientRect();

        // Scale from display size back to the canvas’s internal coordinate space
        const scaleX = canvas.width / rect.width;  
        const scaleY = canvas.height / rect.height;

        const x = (e.clientX - rect.left) * scaleX;
        const y = (e.clientY - rect.top) * scaleY;

        if (selectedTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out"; // remove pixels
            ctx.lineWidth = 20;
          } else {
            ctx.globalCompositeOperation = "source-over"; // normal drawing
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = 2;
          }
      
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
      }
    
      function stopMouseDrawing() {
        drawing = false;
        // optional: ctx.closePath();
      }
    
      // Touch equivalents
      function startTouchDrawing(e) {
        e.preventDefault();
        drawing = true;
        ctx.beginPath();
        ctx.lineWidth = selectedTool === "eraser" ? 25 : 6;


        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;

        ctx.moveTo(x, y);
      }
    
      function moveTouchDrawing(e) {
        if (!drawing) return;
        e.preventDefault();

        const touch = e.touches[0];
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;

        const x = (touch.clientX - rect.left) * scaleX;
        const y = (touch.clientY - rect.top) * scaleY;

        if (selectedTool === "eraser") {
            ctx.globalCompositeOperation = "destination-out"; // remove pixels
            ctx.lineWidth = 20;
          } else {
            ctx.globalCompositeOperation = "source-over"; // normal drawing
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = 10;
          }


        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
        ctx.lineTo(x, y);
        ctx.stroke();
      }
    
      function stopTouchDrawing(e) {
        e.preventDefault();
        drawing = false;
        // optional: ctx.closePath();
      }
  };

  function exportCanvasWithWhiteBackground(canvas) {
    const width = canvas.width;
    const height = canvas.height;
    // Create a new canvas element
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = width;
    tempCanvas.height = height;
    const ctx = tempCanvas.getContext('2d');
  
    // Fill with white
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, width, height);
  
    // Draw the original canvas on top
    ctx.drawImage(canvas, 0, 0);
  
    // Export the resulting image as a data URL
    return tempCanvas.toDataURL('image/png');
  }

  const submitDrawing = async (canvasRef, timerBar) => {
    try {
      // Stop the timer bar
      timerBar.style.width = '0%';
    
      // Extract the drawing from the canvas as a base64 string
      const canvas = canvasRef.current;
      const drawingData = exportCanvasWithWhiteBackground(canvas);
    
      const payload = {
        drawing: drawingData,  // Send the drawing data under the key 'drawing'
        timestamp: new Date().toISOString(), // optional if needed
      };
    
      // Send the drawing to the backend
      const response = await axios.post('/api/pictionary/submit-drawing', payload);
    
      if (response.status === 200) {
        console.log('Drawing submitted successfully:', response.data);
        // 🔄 Refresh game state after submission
        const newState = await fetchGameState();
        handleGameState(newState);
        
      } else {
        console.warn('Unexpected response while submitting drawing:', response);
      }
    } catch (error) {
      console.error('Error submitting drawing:', error.message);
    }
  };

  async function handleChoose() {
    try {
        // Step 1: Ask user for difficulty selection
        const difficulty = await showDifficultySelectionUI();

        // Step 2: Send the difficulty to backend and get the assigned word
        const response = await fetch('/api/pictionary/set-difficulty', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ difficulty })
        });

        const data = await response.json();

        if (response.ok) {
            console.log(`Assigned word: ${data.word}, Max Points: ${data.maxPoints}`);

            // 🔄 Immediately update game state
            handleGameState(data.state);
        } else {
            console.error('Failed to set difficulty');
        }
    } catch (error) {
        console.error('Error in handleChoose:', error);
    }
}

async function showDifficultySelectionUI() {
  return new Promise(async (resolve) => {
      const selectionContainer = document.getElementById("word-selection");
      const optionsDiv = document.getElementById("difficulty-options");

      // Clear previous options
      optionsDiv.innerHTML = "";

      // Fetch max points
      let maxScores = {};
      try {
          const response = await fetch("/api/pictionary/max-scores");
          maxScores = await response.json();
      } catch (error) {
          console.error("Failed to fetch max scores:", error);
      }

      // Difficulty options in Dutch
      const difficulties = [
          { label: "Makkelijk", value: "easy", maxPoints: maxScores.easy || "?", icon: "🟢" },
          { label: "Gemiddeld", value: "medium", maxPoints: maxScores.medium || "?", icon: "🟡" },
          { label: "Moeilijk", value: "hard", maxPoints: maxScores.hard || "?", icon: "🔴" }
      ];

      // Create buttons
      difficulties.forEach(({ label, value, maxPoints, icon }) => {
          const btn = document.createElement("button");
          btn.classList.add("difficulty-option", `difficulty-${value}`);
          btn.innerHTML = `
              <span class="difficulty-icon">${icon}</span>
              <span>${label}</span>
              <small>(Max: ${maxPoints} punten)</small>
          `;

          btn.addEventListener("click", () => {
              selectionContainer.classList.add("hidden");
              resolve(value);
          });

          optionsDiv.appendChild(btn);
      });

      // Show selection container
      selectionContainer.classList.remove("hidden");
  });
}
function showWordSelectionUI(words) {
    return new Promise((resolve) => {
      // Grab the container from your HTML
      const wordSelectionContainer = document.getElementById("word-selection");
      const wordOptionsDiv = document.getElementById("word-options");
  
      // Clear any previous items
      wordOptionsDiv.innerHTML = "";
  
      // Show the container
      wordSelectionContainer.classList.remove("hidden");
    
      // Create a div for the actual list of words
      const wordsList = document.createElement("div");
      wordsList.classList.add("words-list");
      wordOptionsDiv.appendChild(wordsList);
  
      // Add a clickable box for each word
      words.forEach((word) => {
        const wordDiv = document.createElement("div");
        wordDiv.classList.add("word-option");
        wordDiv.textContent = word;
        
        // On click, hide the container & resolve the chosen word
        wordDiv.addEventListener("click", () => {
          wordSelectionContainer.classList.add("hidden");
          resolve(word);
        });
  
        wordsList.appendChild(wordDiv);
      });
    });
  }

async function handleGuess() {
    document.getElementById("guess-submission").classList.remove("hidden");
    document.getElementById("guesses-table-container").classList.remove("hidden");

    document.getElementById('guess-input').value = "";

    // Step 1: Fetch the image to be guessed
    const response = await fetch('/api/pictionary/get-image');
    const data = await response.json();
    const drawerName = data.drawerName;
    const imageSrc = data.imageSrc;
    const difficulty = data.difficulty === 'easy' ? 'Makkelijk' : data.difficulty === 'medium' ? 'Gemiddeld' : 'Moeilijk';
  
    const imageCanvasDiv = document.getElementById("image-canvas");
    imageCanvasDiv.innerHTML = `
    <div style="text-align: center; margin-bottom: 10px; font-size: 18px; color: #333;">
      Tekening door <span style="font-weight: bold;">${drawerName}</span><br>
      <span style="font-size: 14px;">(Moeilijkheidsgraad: ${difficulty})</span>
    </div>
    <img src="${imageSrc}" alt="Drawing by ${drawerName}" 
      style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;" />
    `;
    updateGuessesTable(); // Update the guesses table first
}
async function submitGuess() {
    try {
        const guessInputEl = document.getElementById('guess-input');
        const guessValue = guessInputEl.value.trim();


        if (!guessValue) {
            alert('Je hebt niks ingevuld!');
            return;
        }

        // Step 3: Submit the guess to the backend
        console.log('Submitting guess:', guessValue);
        const response = await fetch('/api/pictionary/submit-guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guess: guessValue })
        });
        if (!response.ok) {
            console.error('Failed to submit guess');
            return;
        } else{
          // 🔄 Refresh game state after submission
          const newState = await fetchGameState();
          handleGameState(newState);

        }

        // Step 4: Update guesses table
        await updateGuessesTable();
        console.log('Guess submitted and table updated');
    } catch (error) {
        console.error('Error in handleGuess:', error);
    }
}

async function handleGrade() {

    const wordTitleEl = document.getElementById("grading-guesses-title");

    try {
        // Step 1: Fetch the image to be guessed
        const response = await fetch('/api/pictionary/get-image');
        const data = await response.json();
        const drawerName = data.drawerName;
        const imageSrc = data.imageSrc;
        const wordToDraw = data.word;

        wordTitleEl.innerHTML = `Teken een <span class="highlight-word">${wordToDraw}</span>`;
    
        const imageCanvasDiv = document.getElementById("image-canvas-guessing");
        imageCanvasDiv.innerHTML = `
        <img src="${imageSrc}" alt="Drawing by ${drawerName}" 
            style="max-width: 100%; height: auto; border: 1px solid #ddd; border-radius: 8px;" />
        `;
        // Step 2: Fetch guesses to be graded
        const response_guesses = await fetch('/api/pictionary/get-guesses-to-grade');
        const data_guesses = await response_guesses.json();
        const guesses = data_guesses.guesses;
        console.log('Guesses to grade:', guesses);
       
        // Step 3: Display guesses for grading
        const gradedGuesses = await showGradingUI(guesses); 
        // Example: `showGradingUI` collects feedback for each guess { id, grade }

        // Step 4: Send the feedback to the backend
        const result = await fetch('/api/pictionary/submit-grades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback: gradedGuesses })
        });

        if (result.ok) {
            console.log('Grades submitted successfully');
            // 🔄 Refresh game state after submission
            const newState = await fetchGameState();
            handleGameState(newState);
        } else {
           console.error('Failed to submit grades');
        }
    } catch (error) {
        console.error('Error in handleGrade:', error);
    }
}

async function showGradingUI(guesses) {
    const gradingContainer = document.getElementById('grading-guesses');
    const guessesList = document.getElementById('guesses-list');
    const submitButton = document.getElementById('submit-grades');

    // Clear existing content
    guessesList.innerHTML = '';

    // Create grading elements for each guess
    guesses.forEach((guess) => {
        const guessContainer = document.createElement('div');
        guessContainer.classList.add('guess-container');

        const guessText = document.createElement('span');
        guessText.textContent = guess.text;
        guessText.classList.add('guess-text');
        guessContainer.appendChild(guessText);

        const gradingButtons = document.createElement('div');
        gradingButtons.classList.add('grading-buttons');

        for (let i = 1; i <= 5; i++) {
            const gradeButton = document.createElement('button');
            gradeButton.textContent = i;
            gradeButton.dataset.id = guess.action_id;
            gradeButton.dataset.grade = i;
            gradeButton.classList.add('grade-button');
            gradeButton.addEventListener('click', () => {
                document.querySelectorAll(`button[data-id="${guess.action_id}"]`).forEach((btn) => {
                    btn.classList.remove('selected');
                });
                gradeButton.classList.add('selected');
                if (i === 5) {
                    guessContainer.querySelector('.correct-indicator').classList.remove('hidden');
                } else {
                    guessContainer.querySelector('.correct-indicator').classList.add('hidden');
                }
            });
            gradingButtons.appendChild(gradeButton);
        }

        guessContainer.appendChild(gradingButtons);

        const correctIndicator = document.createElement('span');
        correctIndicator.textContent = '✔';
        correctIndicator.classList.add('correct-indicator', 'hidden');
        guessContainer.appendChild(correctIndicator);

        guessesList.appendChild(guessContainer);
    });

    gradingContainer.classList.remove('hidden');

    return new Promise((resolve) => {
        submitButton.addEventListener('click', () => {
            const feedback = [];
            let valid = true;

            guesses.forEach((guess) => {
                const selectedButton = document.querySelector(
                    `button[data-id="${guess.action_id}"].selected`
                );
                if (selectedButton) {
                    feedback.push({
                        action_id: guess.action_id,
                        feedback: parseInt(selectedButton.dataset.grade, 10),
                    });
                } else {
                    valid = false;
                }
            });

            if (!valid) {
                alert('Please grade all guesses before submitting.');
            } else {
                gradingContainer.classList.add('hidden');
                console.log('Grades submitted:', feedback);
                resolve(feedback);
            }
        });
    });
}


async function updateGuessesTable() {
    try {
        const guessesResponse = await fetch('/api/pictionary/get-guesses');
        const data = await guessesResponse.json();
        const guesses = data.guesses; 
        console.log('Guesses fetched:', guesses);
    

        const tableBody = document.getElementById('guessesTableBody');
        if (!tableBody) {
            console.error('Guesses table body not found');
            return;
        }

        tableBody.innerHTML = '';

        guesses.forEach((guess, index) => {
            const row = document.createElement('tr');

            // Format the date more nicely
            const formattedTime = formatGuessTime(guess.time);

            row.innerHTML = `
            <td>${guess.round_number}</td>
            <td>${guess.username || 'Onbekend'}</td>
            <td>${formattedTime || 'N/A'}</td>
            <td>${guess.text || '***'}</td>
            <td>${guess.feedback ? guess.feedback : '<span style="font-size: 10px;">⏳</span>'}</td>`;
            tableBody.appendChild(row);
        });

        console.log('Guesses table updated successfully');
    } catch (error) {
        console.error('Error in updateGuessesTable:', error);
    }
}
function formatGuessTime(isoString) {
  // isoString might be "2025-01-01 10:00" or "2025-01-01T10:00:00Z"
  // If you need a quick parse hack:
  // 1) Convert "2025-01-01 10:00" -> "2025-01-01T10:00"
  // Then parse
  let normalized = isoString.replace(" ", "T") + "Z";  // Ensure it's treated as UTC
  const d = new Date(normalized);  // Now it will correctly parse as UTC
  const localTime = new Date(d.getTime() + d.getTimezoneOffset() * 60000);  // Convert to local

  
  if (isNaN(d.getTime())) return isoString; // fallback if invalid
  
  // Format like "1-jan 10:00"
  // (Using Dutch style, but you can adapt)
  const day = localTime.getDate();
  const month = localTime.toLocaleString('nl-NL', { month: 'short' });
  const hour = String(localTime.getHours()).padStart(2, '0');
  const minute = String(localTime.getMinutes()).padStart(2, '0');

  return `${hour}:${minute}`;
}

function handleIdle() {
    console.log("Handling 'Idle' state...");
    // Add logic for the default state
}

// Main Game Initialization
async function initGame() {
    const initialState = await fetchGameState(); 
    handleGameState(initialState);
}

// Run the Game Initialization when the page loads
window.addEventListener("DOMContentLoaded", initGame);
document.getElementById('submit-guess').addEventListener('click', submitGuess);