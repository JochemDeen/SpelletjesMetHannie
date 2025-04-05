//public/pictionary/js/pictionary.js
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


let isDrawingSessionStarting = false;

const handleDraw = async () => {
  const canvas = document.getElementById("drawing-canvas");
  const canvasRef = { current: canvas };
  const wordTitleEl = document.getElementById("draw-word-title");
  const finishButton = document.getElementById("finish-drawing");
  if (isDrawingSessionStarting) {
    console.log("Drawing session already starting, ignoring duplicate call");
    return;
  }

  try {
    isDrawingSessionStarting = true;
    finishButton.disabled = false;

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

      finishButton.addEventListener("click", async () => {
          finishButton.disabled = true;
          disableDrawing(canvasRef);
          disableColors();
          clearInterval(timerInterval);
          
          console.log("Done button clicked. Drawing disabled, timer frozen.");
          // Submit the drawing
          await submitDrawing(canvasRef, timerBar);
        }, { once: true }); // Add the once: true option

      // 3. When the countdown finishes, submit the drawing automatically
      setTimeout(async () => {
          console.log("Time's up – disabled drawing and button.");
          if (!finishButton.disabled) {
            finishButton.disabled = true;
            disableDrawing(canvasRef);
            disableColors();
            clearInterval(timerInterval);
          
            // Make sure this runs by adding await and proper error handling
            try {
                await submitDrawing(canvasRef, timerBar);
            } catch (submitError) {
                console.error("Error submitting drawing on timeout:", submitError);
                // Attempt to refresh state even if submission failed
                const newState = await fetchGameState();
                handleGameState(newState);
            }
          }
      }, countdownDuration * 1000);
    isDrawingSessionStarting = false;
  } catch (error) {
      console.error('Error in handleDraw:', error.message);
      isDrawingSessionStarting = false; // Reset flag in case of error

      // Try to recover by fetching current state
      try {
          const newState = await fetchGameState();
          handleGameState(newState);
      } catch (stateError) {
          console.error('Failed to recover game state:', stateError);
      }
  }
};

// Also update the submitDrawing function to be more robust:
const submitDrawing = async (canvasRef, timerBar) => {
  try {
      // Stop the timer bar
      if (timerBar) {
          timerBar.style.width = '0%';
      }
  
      // Extract the drawing from the canvas as a base64 string
      const canvas = canvasRef.current;
      const drawingData = exportCanvasWithWhiteBackground(canvas);
  
      const payload = {
          drawing: drawingData,
          timestamp: new Date().toISOString(),
      };
  
      console.log('Submitting drawing to server...');
      // Send the drawing to the backend
      const response = await axios.post('/api/pictionary/submit-drawing', payload);
  
      if (response.status === 200) {
          console.log('Drawing submitted successfully:', response.data);
          // Refresh game state after submission
          const newState = await fetchGameState();
          handleGameState(newState);
      } else {
          console.warn('Unexpected response while submitting drawing:', response);
          throw new Error(`Unexpected response: ${response.status}`);
      }
  } catch (error) {
      console.error('Error submitting drawing:', error.message);
      // Still try to update game state
      try {
          const newState = await fetchGameState();
          handleGameState(newState);
      } catch (stateError) {
          console.error('Failed to recover after drawing submission error:', stateError);
      }
      throw error; // Re-throw to allow caller to handle
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

// 3. Add the function to disable thickness controls, similar to disableColors
function disableThicknessControls() {
  const thicknessButtons = document.querySelectorAll('#thickness-controls .thickness-btn');
  thicknessButtons.forEach(btn => {
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
    // Remove the custom cursor
    if (canvasRef.customCursor) {
      canvasRef.customCursor.remove();
    }

    // Restore default cursor
    canvas.style.cursor = 'default';
    disableColors();
    disableThicknessControls();
  
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
    let brushThickness = 6; // Default medium thickness

    // Add history for undo functionality
  let drawingHistory = [];
  let currentHistoryIndex = -1;

  // Create a cursor canvas element for custom cursor
  const cursorCanvas = document.createElement('canvas');
  const cursorCtx = cursorCanvas.getContext('2d');
  cursorCanvas.width = 40;  // Size of the cursor canvas
  cursorCanvas.height = 40;
  // Create a div to hold the custom cursor
  const customCursor = document.createElement('div');
  customCursor.id = 'custom-cursor';
  customCursor.style.position = 'absolute';
  customCursor.style.pointerEvents = 'none';
  customCursor.style.zIndex = '1000';
  customCursor.style.top = '0';
  customCursor.style.left = '0';
  customCursor.style.transform = 'translate(-50%, -50%)';
  customCursor.style.display = 'none';
  document.body.appendChild(customCursor);

    // Function to update the custom cursor
    function updateCustomCursor() {
      // Clear the cursor canvas
      cursorCtx.clearRect(0, 0, cursorCanvas.width, cursorCanvas.height);
      
      // Draw the cursor based on current tool and thickness
      if (selectedTool === "eraser") {
        // Eraser cursor - draw a circle with a red border
        cursorCtx.beginPath();
        cursorCtx.arc(cursorCanvas.width/2, cursorCanvas.height/2, 10, 0, 2 * Math.PI);
        cursorCtx.strokeStyle = 'rgba(255, 0, 0, 0.8)';
        cursorCtx.lineWidth = 2;
        cursorCtx.stroke();
        cursorCtx.fillStyle = 'rgba(255, 255, 255, 0.5)';
        cursorCtx.fill();
        
        // Add a cross in the middle
        cursorCtx.beginPath();
        cursorCtx.moveTo(cursorCanvas.width/2 - 5, cursorCanvas.height/2);
        cursorCtx.lineTo(cursorCanvas.width/2 + 5, cursorCanvas.height/2);
        cursorCtx.moveTo(cursorCanvas.width/2, cursorCanvas.height/2 - 5);
        cursorCtx.lineTo(cursorCanvas.width/2, cursorCanvas.height/2 + 5);
        cursorCtx.strokeStyle = 'red';
        cursorCtx.lineWidth = 1;
        cursorCtx.stroke();
      } else {
        // Pen cursor - draw a circle with the selected color
        cursorCtx.beginPath();
        cursorCtx.arc(cursorCanvas.width/2, cursorCanvas.height/2, brushThickness/2, 0, 2 * Math.PI);
        cursorCtx.fillStyle = selectedColor;
        cursorCtx.fill();
        
        // Add a white border for better visibility on dark colors
        cursorCtx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
        cursorCtx.lineWidth = 1;
        cursorCtx.stroke();
      }
      
      // Update the custom cursor with the new image
      customCursor.style.width = cursorCanvas.width + 'px';
      customCursor.style.height = cursorCanvas.height + 'px';
      customCursor.style.backgroundImage = `url(${cursorCanvas.toDataURL()})`;
      customCursor.style.backgroundSize = 'contain';
    }
  
    // Initial cursor update
    updateCustomCursor();
    canvas.addEventListener('mousemove', (e) => {
      const rect = canvas.getBoundingClientRect();
      customCursor.style.left = (e.clientX) + 'px';
      customCursor.style.top = (e.clientY) + 'px';
    });
    
    // Show the custom cursor when over the canvas
    canvas.addEventListener('mouseenter', () => {
      customCursor.style.display = 'block';
      canvas.style.cursor = 'none'; // Hide the default cursor
    });
    
    // Hide the custom cursor when leaving the canvas
    canvas.addEventListener('mouseleave', () => {
      customCursor.style.display = 'none';
      canvas.style.cursor = 'default'; // Restore the default cursor
    });
    
  
  
  // Save initial canvas state (blank)
  saveCanvasState();

  
// ===================
  // HOOK UP THE COLORS
  // ===================
  document.querySelectorAll("#color-picker .color")
    .forEach((colorBtn) => {
        colorBtn.addEventListener("click", () => {
            selectedTool = "pen";
        selectedColor = colorBtn.dataset.color;
        updateCustomCursor(); // Update cursor after color change
        console.log("Color changed to:", selectedColor);
        });
    });

// ===================
  // HOOK UP THE ERASER
  // ===================
  const eraserBtn = document.getElementById("eraser-button");
  eraserBtn.addEventListener("click", () => {
    selectedTool = "eraser";
    updateCustomCursor(); // Update cursor for eraser
    console.log("Tool changed to eraser");
  });

  // HOOK UP THE THICKNESS CONTROLS
  document.querySelectorAll(".thickness-btn").forEach((thicknessBtn) => {
    thicknessBtn.addEventListener("click", () => {
      brushThickness = parseInt(thicknessBtn.dataset.thickness);
      
      // Visual feedback - add active class to selected button
      document.querySelectorAll(".thickness-btn").forEach(btn => {
        btn.classList.remove("active");
      });
      thicknessBtn.classList.add("active");
      updateCustomCursor(); // Update cursor with new thickness
      
      console.log("Brush thickness changed to:", brushThickness);
    });
  });
  // Set the medium brush as active by default
  const mediumBrush = document.getElementById("medium-brush");
  if (mediumBrush) {
    mediumBrush.classList.add("active");
  }
  

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
  canvasRef.customCursor = customCursor;

  // HOOK UP THE UNDO BUTTON
  const undoButton = document.getElementById('undo-button');
  if (undoButton) {
    undoButton.addEventListener('click', handleUndo);
  }

  // Function to save the current canvas state
  function saveCanvasState() {
    // If we're not at the end of the history array, remove everything after current index
    if (currentHistoryIndex < drawingHistory.length - 1) {
      drawingHistory = drawingHistory.slice(0, currentHistoryIndex + 1);
    }
    
    // Limit history size to prevent memory issues
    if (drawingHistory.length >= 20) {
      drawingHistory.shift(); // Remove the oldest state
    } else {
      currentHistoryIndex++;
    }
    
    // Save current canvas state to history
    drawingHistory.push(canvas.toDataURL());
  }

    // Function to handle undo button
    function handleUndo() {
      if (currentHistoryIndex > 0) {
        currentHistoryIndex--;
        const image = new Image();
        image.src = drawingHistory[currentHistoryIndex];
        image.onload = function() {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(image, 0, 0);
        };
      }
    }
  

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
        if (selectedTool !== "eraser") {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = selectedColor;
          
          // Draw a small circle at the starting point
          ctx.beginPath();
          ctx.arc(x, y, brushThickness/2, 0, Math.PI * 2);
          ctx.fill();
          
          // Reset path and move to starting point again
          ctx.beginPath();
          ctx.moveTo(x, y);
        }
    
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
            ctx.lineWidth = 20;// Eraser is always thick
          } else {
            ctx.globalCompositeOperation = "source-over"; // normal drawing
            ctx.strokeStyle = selectedColor;
            ctx.lineWidth = brushThickness;

            // Set line properties for smoother lines
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Add some anti-aliasing/smoothing effect
            ctx.shadowColor = selectedColor;
            ctx.shadowBlur = 1; // Small blur for anti-aliasing
          }
      
        ctx.lineTo(x, y);
        ctx.stroke();
        ctx.strokeStyle = selectedColor;
        ctx.lineCap = 'round';
      }
    
      function stopMouseDrawing() {
        drawing = false;
        saveCanvasState(); 
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
        
        // For touch, also draw a dot at start
        if (selectedTool !== "eraser") {
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = selectedColor;
          
          // Draw a small circle at the starting point
          ctx.beginPath();
          ctx.arc(x, y, brushThickness/2, 0, Math.PI * 2);
          ctx.fill();
          
          // Reset path and move to starting point again
          ctx.beginPath();
          ctx.moveTo(x, y);
        }
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
            ctx.lineWidth = brushThickness;

            // Set line properties for smoother lines
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            
            // Add some anti-aliasing/smoothing effect
            ctx.shadowColor = selectedColor;
            ctx.shadowBlur = 1; // Small blur for anti-aliasing

          }
        ctx.lineTo(x, y);
        ctx.stroke();
        
        // For touch devices, move the custom cursor to follow the touch point
        customCursor.style.left = (touch.clientX) + 'px';
        customCursor.style.top = (touch.clientY) + 'px';
        customCursor.style.display = 'block';
      }
    
      function stopTouchDrawing(e) {
        e.preventDefault();
        if (drawing) {
          drawing = false;
          // Reset shadow to avoid affecting other operations
          ctx.shadowBlur = 0;
          saveCanvasState(); // Save state after completing a stroke
          
          // Hide custom cursor when touch ends
          customCursor.style.display = 'none';
        }    
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
            const { displayTime, fullDate } = formatGuessTime(guess.time);

            row.innerHTML = `
            <td>${guess.round_number}</td>
            <td>${guess.username || 'Onbekend'}</td>
            <td title="${fullDate}">${displayTime || 'N/A'}</td>
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
  if (!isoString) return { displayTime: 'N/A', fullDate: 'N/A' }; // Handle missing time

  let normalized = isoString.replace(" ", "T") + "Z";  // Normalize for UTC parsing
  const d = new Date(normalized);

  if (isNaN(d.getTime())) return { displayTime: 'N/A', fullDate: 'N/A' }; // Fallback if invalid
// Format like "1-jan 10:00"
  // (Using Dutch style, but you can adapt)
  const day = d.getDate();
  const month = d.toLocaleString('nl-NL', { month: 'short' });
  const hour = String(d.getHours()).padStart(2, '0');
  const minute = String(d.getMinutes()).padStart(2, '0');

  // Format for display
  const displayTime = `${hour}:${minute}`;
  const fullDate = `${day}-${month} ${hour}:${minute}`;

  return { displayTime, fullDate };
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