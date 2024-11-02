const gameContainer = document.getElementById('game-container');
const keyboardRows = [
    document.getElementById('row-1'),
    document.getElementById('row-2'),
    document.getElementById('row-3')
];

let currentGuess = "";
let currentRow = 0;
let gameEnded = false;

// Create the game grid and restore state if available
(async function loadGameState() {
    try {
      const response = await fetch('/api/load-game-state');
      const data = await response.json();
    if (data.success && data.state) {
        currentRow = 0;
        data.state.guesses.forEach((guess, index) => {
            currentGuess = guess;
            updateGrid();
            if (currentRow == data.state.currentRow && data.state.success) {
                animateReveal(data.state.success, data.state.feedback[index], deltaDelay = 0);
            } else {
                animateReveal(false, data.state.feedback[index], deltaDelay = 0);
            }
            currentRow++;
        });
        currentGuess = "";
        if (data.state.success || currentRow === 6) {
            document.getElementById('compare-link').style.display = 'inline';
            gameEnded = true;
        }
    }
    } catch (error) {
      console.error('Failed to load game state:', error);
    }
  })();
  

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
            alert(`${word} zit niet in het woordenboek`);
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
    animateReveal(true,data.feedback,deltaDelay = 300);
    document.getElementById('compare-link').style.display = 'inline';
    gameEnded = true;
    } else {
    animateReveal(false, data.feedback,deltaDelay = 300);
    currentRow++;
    currentGuess = "";
    if (currentRow === 6 ) {
        document.getElementById('compare-link').style.display = 'inline';
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
        validateWord(currentGuess);
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



function updateGrid() {
  const startIndex = currentRow * 5;
  for (let i = 0; i < 5; i++) {
    const letterBox = gameContainer.querySelector(`[data-index='${startIndex + i}']`);
    letterBox.textContent = currentGuess[i] || "";
  }
}


function animateReveal(isCorrect, feedback = [],deltaDelay = 0) {
    const startIndex = currentRow * 5;
    for (let i = 0; i < 5; i++) {
      const letterBox = gameContainer.querySelector(`[data-index='${startIndex + i}']`);
      const letter = currentGuess[i];
      const delay = i * deltaDelay; // Delay each box by 300ms

      setTimeout(() => {
        if (isCorrect) {
          letterBox.style.backgroundColor = 'green';
          letterBox.style.color = 'white';
        } else {
          if (feedback[i] === 'correct') {
            letterBox.style.backgroundColor = 'green';
            letterBox.style.color = 'white';
          } else if (feedback[i] === 'misplaced') {
            letterBox.style.backgroundColor = '#c9a228'; // Ochre yellow
            letterBox.style.color = 'white';
          } else {
            letterBox.style.backgroundColor = 'gray';
            letterBox.style.color = 'white';
          }

          // Update keyboard color
          const keyElement = Array.from(document.querySelectorAll('.key')).find(k => k.textContent === letter);
          if (keyElement) {
            if (feedback[i] === 'correct') {
              keyElement.style.backgroundColor = 'green';
              keyElement.style.color = 'white';
            } else if (feedback[i] === 'misplaced' && keyElement.style.backgroundColor !== 'green') {
              keyElement.style.backgroundColor = '#c9a228';
              keyElement.style.color = 'white';
            } else if (feedback[i] === 'incorrect') {
              keyElement.style.backgroundColor = '#4d4d4d'; // Darker gray for incorrect letters
              keyElement.style.color = 'white';
            }
          }
        }

        // Remove border if color is set
        letterBox.style.border = "none";
      }, delay);
  }
}

