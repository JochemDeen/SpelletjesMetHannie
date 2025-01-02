//import axios from 'axios';

const titles = {
    DRAW: "Teken je woord!",
    CHOOSE: "Kies een woord!",
    GUESS: "Raad het woord!",
    GRADE: "Beoordeel de antwoorden!",
    IDLE: "Pictionary!"
};
const gameTitleElement = document.getElementById("game-title");

function updateGameTitle(state) {
    switch (state) {
        case "draw":
            gameTitleElement.textContent = titles.DRAW;
            break;
        case "choose":
            gameTitleElement.textContent = titles.CHOOSE;
            break;
        case "guess":
            gameTitleElement.textContent = titles.GUESS;
            break;
        case "grade":
            gameTitleElement.textContent = titles.GRADE;
        default:
            gameTitleElement.textContent = titles.IDLE;
    }
}

// Function to Fetch the Initial Game State
async function fetchInitialGameState() {
    // try {
    //     const response = await fetch("/api/pictionary/state");
    //     if (!response.ok) throw new Error("Failed to fetch initial game state.");
        
    //     const data = await response.json();
    //     return data.state; // Assuming response has { state: "draw/choose/guess/idle" }
    // } catch (error) {
    //     console.error("Error fetching game state:", error);
    //     return "idle"; // Default to idle state
    // }
    const states = ["draw", "choose", "guess", "grade", "idle"];
    // pick a random or fixed test state
    state = states[Math.floor(Math.random() * states.length)];
    state = "draw";
    console.log("Initial state fetched:", state);
    return state;
  
}

// Function to Handle the Game State
function handleGameState(state) {
    updateGameTitle(state);
  
    // 1. Hide all relevant containers first
    hideAllContainers();
  
    // 2. Show the container & call the function for the chosen state
    switch (state) {
      case "draw":
        document.getElementById("drawing-container").classList.remove("hidden");
        handleDraw(); // or pass the canvasRef or any other args if needed
        break;
      case "choose":
        document.getElementById("word-selection").classList.remove("hidden");
        handleChoose();
        break;
      case "guess":
        document.getElementById("guess-submission").classList.remove("hidden");
        handleGuess();
        break;
      case "grade":
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
    // const startPayload = { playerId, gameId };
    // const startResponse = await axios.post('/api/pictionary/start-drawing', startPayload);

    // if (startResponse.status !== 200) {
    //   throw new Error('Failed to initialize drawing session.');
    // }

    // const countdownDuration = startResponse.data.countdown; // Duration in seconds
    // MOCK DATA
    const wordToDraw = "Olifant";
    const countdownDuration = 60; // say 100 seconds
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
        // submitDrawing(...);
      });

    // 3. When the countdown finishes, submit the drawing automatically
    setTimeout(async () => {
        finishButton.disabled = true;
        disableDrawing(canvasRef);
        disableColors();
        console.log("Time's up – disabled drawing and button.");
  
      //await submitDrawing(canvasRef, playerId, gameId, timerBar, onDrawingComplete);
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
  
    // Color buttons
  document
  .querySelectorAll("#color-picker .color")
  .forEach((colorBtn) => {
    colorBtn.addEventListener("click", () => {
      selectedColor = colorBtn.dataset.color;
      console.log("Color changed to:", selectedColor);
    });
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

        ctx.strokeStyle = selectedColor;
        ctx.lineWidth = 2;
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

  const submitDrawing = async (canvasRef, playerId, gameId, timerBar, onDrawingComplete) => {
    try {
      // Stop the timer bar
      timerBar.style.width = '0%';
  
      // Extract the drawing from the canvas as base64
      const canvas = canvasRef.current;
      const drawingData = canvas.toDataURL('image/png');
  
      const payload = {
        playerId,
        gameId,
        drawing: drawingData,
        timestamp: new Date().toISOString(),
      };
  
      // Send the drawing to the backend
      const response = await axios.post('/api/pictionary/submit-drawing', payload);
  
      if (response.status === 200) {
        console.log('Drawing submitted successfully:', response.data);
  
        // Notify parent or update state
        if (onDrawingComplete) onDrawingComplete(response.data);
      } else {
        console.warn('Unexpected response while submitting drawing:', response);
      }
    } catch (error) {
      console.error('Error submitting drawing:', error.message);
    }
  };

  async function handleChoose() {
    try {
        // Step 1: Fetch words from backend
        const response = await fetch('/api/pictionary/get-words');
        const words = await response.json();

        // Step 2: Show words to the user for selection (assume frontend UI handles this)
        const selectedWord = await showWordSelectionUI(words); // Function that lets user pick a word

        if (selectedWord) {
            // Step 3: Send the selected word to backend
            const result = await fetch('/api/pictionary/submit-word', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ word: selectedWord })
            });

            if (result.ok) {
                console.log('Word submitted successfully');
            } else {
                console.error('Failed to submit word');
            }
        }
    } catch (error) {
        console.error('Error in handleChoose:', error);
    }
}

async function handleGuess() {
    try {
        // Step 1: Get the guess input
        const guessInput = document.getElementById('guessInput').value;

        if (!guessInput) {
            alert('Please enter a guess before submitting!');
            return;
        }

        // Step 2: Submit the guess to the backend
        const response = await fetch('/api/pictionary/submit-guess', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ guess: guessInput })
        });

        if (!response.ok) {
            console.error('Failed to submit guess');
            return;
        }

        // Step 3: Update guesses table
        await updateGuessesTable();
        console.log('Guess submitted and table updated');
    } catch (error) {
        console.error('Error in handleGuess:', error);
    }
}

async function handleGrade() {
    try {
        // Step 1: Fetch guesses to be graded
        const response = await fetch('/api/pictionary/get-guesses-to-grade');
        const guesses = await response.json();

        // Step 2: Display guesses for grading
        const gradedGuesses = await showGradingUI(guesses); 
        // Example: `showGradingUI` collects feedback for each guess { id, grade }

        // Step 3: Send the feedback to the backend
        const result = await fetch('/api/pictionary/submit-grades', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ feedback: gradedGuesses })
        });

        if (result.ok) {
            console.log('Grades submitted successfully');
        } else {
            console.error('Failed to submit grades');
        }
    } catch (error) {
        console.error('Error in handleGrade:', error);
    }
}

async function showGradingUI(guesses) {
    const feedback = [];

    for (const guess of guesses) {
        const grade = prompt(`Grade this guess: "${guess.text}" (true/false/close):`);
        if (['true', 'false', 'close'].includes(grade)) {
            feedback.push({ id: guess.id, grade });
        } else {
            alert('Invalid input, try again');
            return showGradingUI(guesses); // Retry grading
        }
    }

    return feedback;
}

async function updateGuessesTable() {
    try {
        // Step 1: Fetch the updated guesses from backend
        const guessesResponse = await fetch('/api/pictionary/get-guesses');
        if (!guessesResponse.ok) {
            console.error('Failed to fetch guesses');
            return;
        }

        const guesses = await guessesResponse.json();

        // Step 2: Get the table element where guesses will be displayed
        const tableBody = document.getElementById('guessesTableBody');
        if (!tableBody) {
            console.error('Guesses table body not found');
            return;
        }

        // Step 3: Clear the existing table rows
        tableBody.innerHTML = '';

        // Step 4: Populate the table with the latest guesses
        guesses.forEach((guess, index) => {
            const row = document.createElement('tr');

            // Columns: Index, Guess Time, Status (if available)
            row.innerHTML = `
                <td>${index + 1}</td>
                <td>${guess.time || 'N/A'}</td>
                <td>${guess.user || 'Unknown'}</td>
                <td>${guess.status || 'Pending'}</td>
            `;

            tableBody.appendChild(row);
        });

        console.log('Guesses table updated successfully');
    } catch (error) {
        console.error('Error in updateGuessesTable:', error);
    }
}
function handleIdle() {
    console.log("Handling 'Idle' state...");
    // Add logic for the default state
}

// Main Game Initialization
async function initGame() {
    const initialState = await fetchInitialGameState(); // Fetch the starting state
    handleGameState(initialState); // Handle the initial game state
}

// Run the Game Initialization when the page loads
window.addEventListener("DOMContentLoaded", initGame);