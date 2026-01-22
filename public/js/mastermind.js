const pastelOchre = getComputedStyle(document.documentElement).getPropertyValue('--pastel-ochre').trim();
const pastelGreen = getComputedStyle(document.documentElement).getPropertyValue('--pastel-green').trim();
const gray = getComputedStyle(document.documentElement).getPropertyValue('--gray').trim();


const gameContainer = document.getElementById('game-container');
const keyboardRows = [
    document.getElementById('row-1'),
    document.getElementById('row-2'),
    document.getElementById('row-3')
];

let currentGuess = "";
let currentRow = 0;
let gameEnded = false;
let submittedWords = []; // Track submitted words
let feedbackHistory = [];

// Hint state variables
let hintPanelVisible = false;
let hintRequested = false;
let currentHint = null;
let hintsRemaining = 0;
let hintServiceAvailable = false;


// Create the game grid and restore state if available
(async function loadGameState() {
    try {
      const response = await fetch('/api/load-game-state');
      const data = await response.json();
    if (data.success && data.state) {
        currentRow = 0;
        data.state.guesses.forEach((guess, index) => {
            currentGuess = guess;
            submittedWords.push(guess.toLowerCase());
            updateGrid();
            feedbackHistory.push(data.state.feedback[index]);

            if (currentRow == data.state.currentRow && data.state.success) {
                animateReveal(data.state.success, data.state.feedback[index], deltaDelay = 0);
            } else {
                animateReveal(false, data.state.feedback[index], deltaDelay = 0);
            }
            currentRow++;
        });
        currentGuess = "";
        if (data.state.success || currentRow === 6) {
            document.getElementById('shareButton').style.display = 'inline';
            document.getElementById('shareButton').onclick = shareResults;
            gameEnded = true;
        }
    }
    } catch (error) {
      console.error('Failed to load game state:', error);
    }
  })();

  // mastermind.js
  function celebrate() {
    confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 }
    });
}
function showCongratulations() {
  const congratsMessage = document.createElement('div');
  congratsMessage.id = 'congrats-message';
  congratsMessage.textContent = 'Gefeliciteerd!';
  document.body.appendChild(congratsMessage);

  // Remove the message after 3 seconds
  setTimeout(() => {
      congratsMessage.remove();
  }, 3000);
}

async function validateWord(word) {
    try {
        const response = await fetch('/api/validate-word', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ word })
        });
        const data = await response.json();
        if (data.valid) {
            submitGuess(word);
        } else {
            showTemporaryMessage(`${word} zit niet in het woordenboek`);
            buzzCurrentGuess();
        }
    } catch (error) {
        console.error('Failed to validate word:', error);
    }
}

async function submitGuess(word) {
try {
    const response = await fetch('/api/submit-guess', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({ guess: word })
    });
    const data = await response.json();
    if (data.correct) {
      feedbackHistory.push(data.feedback);
      await animateReveal(true,data.feedback,deltaDelay = 300);
      showCongratulations();
      celebrate();
      document.getElementById('shareButton').style.display = 'inline';
      document.getElementById('shareButton').onclick = shareResults;
      gameEnded = true;
    } else {
      feedbackHistory.push(data.feedback);
      await animateReveal(false, data.feedback,deltaDelay = 300);
      currentRow++;
      currentGuess = "";
      if (currentRow === 6 ) {
        document.getElementById('shareButton').style.display = 'inline';
        document.getElementById('shareButton').onclick = shareResults;
        gameEnded = true;
      }
    }
} catch (error) {
    console.error('Failed to submit guess:', error);
}
}

// Create the game grid
for (let i = 0; i < 30; i++) {
  const letterBox = document.createElement('div');
  letterBox.classList.add('letter-box');
  letterBox.setAttribute('data-index', i);
  gameContainer.appendChild(letterBox);
}

// Create the keyboard layout
const keysRow1 = "qwertyuiop".split("");
const keysRow2 = "asdfghjkl".split("");
const keysRow3 = ["enter", ..."zxcvbnm".split(""), "backspace"];

const createKeyElement = (key) => {
  const keyElement = document.createElement('div');
  keyElement.classList.add('key');
  keyElement.textContent = key;
  if (key === 'enter') keyElement.classList.add('enter');
  if (key === 'backspace') {
    keyElement.classList.add('backspace');
    keyElement.textContent = '⌫';
  }
  keyElement.addEventListener('click', () => handleKeyPress(key));
  return keyElement;
};

keysRow1.forEach(key => keyboardRows[0].appendChild(createKeyElement(key)));
keysRow2.forEach(key => keyboardRows[1].appendChild(createKeyElement(key)));
keysRow3.forEach(key => keyboardRows[2].appendChild(createKeyElement(key)));

function handleKeyPress(key) {
  if (gameEnded) return;

  if (key === 'enter') {
    if (currentGuess.length === 5) {
      if (submittedWords.includes(currentGuess.toLowerCase())) {
          showTemporaryMessage("Je hebt dit woord al geprobeerd.");
      } else {
          submittedWords.push(currentGuess.toLowerCase()); // Add to the submitted list
          validateWord(currentGuess);
      }
    } else {
      alert('Niet genoeg letters');
    }
  } else if (key === 'backspace') {
    if (currentGuess.length > 0) {
      currentGuess = currentGuess.slice(0, -1);
      updateGrid();
    }
  } else {
    if (currentGuess.length < 5) {
      currentGuess += key;
      updateGrid();
    }
  }
}

function generateSharePattern() {
  const totalRows = feedbackHistory.length;
  let shareText = `Mijn resultaat vandaag: ${totalRows}/6\n\n`; // Header with attempt count
  
  // For each row with feedback
  for (let row = 0; row < totalRows; row++) {
      const rowFeedback = feedbackHistory[row];
      
      // For each letter in the row
      for (let col = 0; col < 5; col++) {
          const cellFeedback = rowFeedback[col];
          
          // Add appropriate square emoji based on the feedback
          if (cellFeedback === 'correct') {
              shareText += '🟩'; // Green square for correct position
          } else if (cellFeedback === 'misplaced') {
              shareText += '🟨'; // Yellow square for correct letter, wrong position
          } else {
              shareText += '⬛'; // Black square for incorrect letter
          }
      }
      shareText += '\n'; // New line after each row
  }
  
  return shareText;
}
function shareResults() {
  const sharePattern = generateSharePattern();
    
    // Check if Web Share API is supported
    if (navigator.share) {
        navigator.share({
            title: 'Mijn resultaten vandaag',
            text: sharePattern
        })
        .catch(error => {
            console.error('Error sharing:', error);
            // Fallback for when sharing fails
            fallbackShare(sharePattern);
        });
    } else {
        // Fallback for browsers that don't support Web Share API
        fallbackShare(sharePattern);
    }
}


// Fallback sharing method (copy to clipboard)
function fallbackShare(text) {
  // Create a temporary textarea element
  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'absolute';
  textarea.style.left = '-9999px';
  document.body.appendChild(textarea);
  
  // Select and copy the text
  textarea.select();
  document.execCommand('copy');
  
  // Remove the textarea
  document.body.removeChild(textarea);
  
  // Notify the user
  showTemporaryMessage('Results copied to clipboard!');
}

function buzzCurrentGuess() {
  const startIndex = currentRow * 5;
  for (let i = 0; i < 5; i++) {
    const letterBox = gameContainer.querySelector(`[data-index='${startIndex + i}']`);
    // Add the buzz class
    letterBox.classList.add('buzz');

    // Remove the buzz class after the animation ends
    // to ensure the effect can be triggered again later
    letterBox.addEventListener('animationend', () => {
      letterBox.classList.remove('buzz');
    }, { once: true });
  }
}

function updateGrid() {
  const startIndex = currentRow * 5;
  for (let i = 0; i < 5; i++) {
    const letterBox = gameContainer.querySelector(`[data-index='${startIndex + i}']`);
    letterBox.textContent = currentGuess[i] || "";
  }
}

const keyState = {}; // Dictionary to track the highest state of each key

// Helper function to get the highest state for each key
function getStateColor(feedback) {
    if (feedback === 'correct') return pastelGreen;
    if (feedback === 'misplaced') return pastelOchre;
    return gray;
}

// Function to update the keyboard color based on the highest state encountered
function updateKeyColor(letter, feedback) {
  const currentColor = keyState[letter] || gray;
  const newColor = getStateColor(feedback);

  // Update if the new color has a higher priority or if it's the first time setting it
  if (
      (newColor === pastelGreen) || 
      (newColor === pastelOchre && currentColor !== pastelGreen) || 
      (!keyState[letter] && newColor === gray) // Allow gray if it's the first encounter for this key
  ) {
      keyState[letter] = newColor; // Store the highest state encountered
      const keyElement = Array.from(document.querySelectorAll('.key')).find(k => k.textContent === letter);
      if (keyElement) {
          keyElement.style.backgroundColor = keyState[letter];
          keyElement.style.color = 'white';
      }
  }
}


function animateReveal(isCorrect, feedback = [], deltaDelay = 0) {
  return new Promise((resolve) => {
      const startIndex = currentRow * 5;
      let animationsCompleted = 0;

      for (let i = 0; i < 5; i++) {
          const letterBox = gameContainer.querySelector(`[data-index='${startIndex + i}']`);
          const letter = currentGuess[i];
          const delay = i * deltaDelay; // Delay each box by deltaDelay ms

          setTimeout(() => {
              // Apply the visual updates
              if (isCorrect) {
                  letterBox.style.backgroundColor = pastelGreen;
                  letterBox.style.color = 'white';
              } else {
                  if (feedback[i] === 'correct') {
                      letterBox.style.backgroundColor = pastelGreen;
                      letterBox.style.color = 'white';
                  } else if (feedback[i] === 'misplaced') {
                      letterBox.style.backgroundColor = pastelOchre;
                      letterBox.style.color = 'white';
                  } else {
                      letterBox.style.backgroundColor = gray;
                      letterBox.style.color = 'white';
                  }

                  // Update keyboard color
                  updateKeyColor(letter, feedback[i]);
              }

              // Remove border if color is set
              letterBox.style.border = "none";

              // Check if this is the last animation
              if (i === 4) {
                  // All letters have been revealed
                  resolve();
              }
          }, delay);
      }
  });
}
// Function to display a brief on-screen message
function showTemporaryMessage(message) {
  const messageElement = document.createElement('div');
  messageElement.textContent = message;
  messageElement.style.position = 'fixed';
  messageElement.style.bottom = '20px';
  messageElement.style.left = '50%';
  messageElement.style.transform = 'translateX(-50%)';
  messageElement.style.backgroundColor = 'rgba(0, 0, 0, 0.7)';
  messageElement.style.color = 'white';
  messageElement.style.padding = '10px 20px';
  messageElement.style.borderRadius = '5px';
  messageElement.style.fontSize = '16px';
  messageElement.style.zIndex = '1000';
  document.body.appendChild(messageElement);

  setTimeout(() => {
      messageElement.remove();
  }, 2000); // Remove after 2 seconds
}

document.addEventListener('keydown', (event) => {
  if (gameEnded) return; // If the game is over, ignore further key presses
  if (hintPanelVisible) return; // Ignore keyboard input when hint panel is open

  const key = event.key.toLowerCase();

  if (key === 'enter') {
    // If Enter is pressed
    handleKeyPress('enter');
  } else if (key === 'backspace' || key === 'delete') {
    // If Backspace or Delete is pressed
    handleKeyPress('backspace');
  } else if (/^[a-z]$/.test(key)) {
    // If the key is a single alphabetic character (a–z)
    handleKeyPress(key);
  }
});

// =====================
// Hint Panel Functions
// =====================

// Toggle between keyboard and hint panel
function toggleHintPanel(show) {
    const keyboard = document.getElementById('keyboard');
    const hintPanel = document.getElementById('hint-panel');
    const hintToggle = document.getElementById('hint-toggle');

    if (show) {
        keyboard.style.display = 'none';
        hintPanel.style.display = 'flex';
        hintToggle.textContent = 'Terug';
        hintPanelVisible = true;
        // Update button state when opening panel
        updateHintButtonState();
    } else {
        keyboard.style.display = 'flex';
        hintPanel.style.display = 'none';
        hintToggle.textContent = 'Vraag Ollie';
        hintPanelVisible = false;
    }
}

// Update hint button state based on current game state
function updateHintButtonState() {
    const requestBtn = document.getElementById('request-hint-btn');
    const responseElement = document.getElementById('hint-response');

    // If hint already requested or no hints remaining, don't change
    if (hintRequested || hintsRemaining === 0) return;

    // Check if user has made any guesses
    if (submittedWords.length === 0) {
        requestBtn.textContent = 'Doe eerst een poging';
        requestBtn.disabled = true;
        requestBtn.classList.add('disabled');
        responseElement.style.display = 'none';
    } else {
        requestBtn.textContent = 'Vraag een hint';
        requestBtn.disabled = false;
        requestBtn.classList.remove('disabled');
    }
}

// Load hint status on page load
async function loadHintStatus() {
    try {
        const response = await fetch('/api/mastermind/hint-status');
        const data = await response.json();

        hintServiceAvailable = data.available;
        hintsRemaining = data.hintsRemaining;

        const hintToggleContainer = document.getElementById('hint-toggle-container');

        if (!hintServiceAvailable) {
            // Hide hint toggle if service not available
            hintToggleContainer.style.display = 'none';
            return;
        }

        updateHintUI(data.hintsRemaining, data.totalHints, data.todayHint);

        // If there's an existing hint for today, store it
        if (data.todayHint) {
            currentHint = data.todayHint;
            hintRequested = true;
        }
    } catch (error) {
        console.error('Failed to load hint status:', error);
        document.getElementById('hint-toggle-container').style.display = 'none';
    }
}

// Update hint UI elements
function updateHintUI(remaining, total, todayHint) {
    const quotaElement = document.getElementById('hint-quota');
    const requestBtn = document.getElementById('request-hint-btn');
    const responseElement = document.getElementById('hint-response');

    // Update quota display
    const used = total - remaining;
    quotaElement.textContent = `${used}/${total} hints gebruikt deze maand`;

    // Show existing hint if available
    if (todayHint) {
        responseElement.textContent = todayHint;
        responseElement.style.display = 'block';
        requestBtn.textContent = 'Hint al gevraagd vandaag';
        requestBtn.disabled = true;
        requestBtn.classList.add('disabled');
    } else if (remaining === 0) {
        requestBtn.textContent = 'Geen hints meer over';
        requestBtn.disabled = true;
        requestBtn.classList.add('disabled');
        responseElement.style.display = 'none';
    } else if (submittedWords.length === 0) {
        requestBtn.textContent = 'Doe eerst een poging';
        requestBtn.disabled = true;
        requestBtn.classList.add('disabled');
        responseElement.style.display = 'none';
    } else {
        requestBtn.textContent = 'Vraag een hint';
        requestBtn.disabled = false;
        requestBtn.classList.remove('disabled');
        responseElement.style.display = 'none';
    }
}

// Request a hint from the server
async function requestHint() {
    const requestBtn = document.getElementById('request-hint-btn');
    const loadingElement = document.getElementById('hint-loading');
    const responseElement = document.getElementById('hint-response');

    // Show loading state
    requestBtn.style.display = 'none';
    loadingElement.style.display = 'flex';
    responseElement.style.display = 'none';

    try {
        const response = await fetch('/api/mastermind/request-hint', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                guesses: submittedWords,
                feedback: feedbackHistory
            })
        });

        const data = await response.json();

        // Hide loading
        loadingElement.style.display = 'none';
        requestBtn.style.display = 'block';

        if (data.success) {
            currentHint = data.hint;
            hintRequested = true;
            hintsRemaining = data.hintsRemaining;

            // Update UI
            responseElement.textContent = data.hint;
            responseElement.style.display = 'block';
            requestBtn.textContent = 'Hint al gevraagd vandaag';
            requestBtn.disabled = true;
            requestBtn.classList.add('disabled');

            // Update quota
            const quotaElement = document.getElementById('hint-quota');
            const used = 3 - data.hintsRemaining;
            quotaElement.textContent = `${used}/3 hints gebruikt deze maand`;
        } else {
            showTemporaryMessage(data.error || 'Er ging iets mis');
        }
    } catch (error) {
        console.error('Failed to request hint:', error);
        loadingElement.style.display = 'none';
        requestBtn.style.display = 'block';
        showTemporaryMessage('Er ging iets mis bij het ophalen van de hint');
    }
}

// Initialize hint panel event listeners
function initHintPanel() {
    const hintToggle = document.getElementById('hint-toggle');
    const requestBtn = document.getElementById('request-hint-btn');

    hintToggle.addEventListener('click', () => {
        toggleHintPanel(!hintPanelVisible);
    });

    requestBtn.addEventListener('click', requestHint);

    // Load initial hint status
    loadHintStatus();
}

// Initialize hint panel when DOM is ready
initHintPanel();