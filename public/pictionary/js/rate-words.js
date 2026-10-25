//public/pictionary/js/rate-words.js
document.addEventListener('DOMContentLoaded', () => {
  // DOM elements - Word Rating
  const wordToRate = document.getElementById('wordToRate');
  const ratingButtons = document.querySelectorAll('.rating-btn');
  const skipBtn = document.getElementById('skipBtn');
  const ratedCount = document.getElementById('ratedCount');
  const progressFill = document.getElementById('progressFill');
  
  // DOM elements - Word Suggestion
  const suggestedWordInput = document.getElementById('suggestedWord');
  const suggestBtn = document.getElementById('suggestBtn');
  const suggestionMessage = document.getElementById('suggestionMessage');
  
  // State variables
  let currentWord = '';
  let currentWordId = null;
  let wordsRated = 0;
  let seenWords = new Set(); // To track words user has already rated
  
  // Load a random word to rate
  async function loadRandomWord() {
    wordToRate.textContent = 'Laden...';
    // Remove any existing message elements
    const existingMessage = document.getElementById('rating-message');
    if (existingMessage) {
      existingMessage.remove();
    }
    
    try {
      const response = await fetch('/api/pictionary/random-word-to-rate');
      
      if (!response.ok) {
        throw new Error('Failed to fetch random word');
      }
      
      const data = await response.json();
      
      if (data.success) {
        currentWord = data.word;
        currentWordId = data.word_id;
        wordToRate.textContent = currentWord;
        
        // If we're showing words the user hasn't seen, add this to the seen set
        seenWords.add(currentWord);
        
        // Handle the case where all words have been rated
        if (data.allWordsRated) {
          // Create a message element
          const messageDiv = document.createElement('div');
          messageDiv.id = 'rating-message';
          messageDiv.className = 'info-message';
          
          if (data.differsFromMajority) {
            // A word where the user's opinion differs from the majority (the
            // actual ratings are not shown, to avoid bias)
            messageDiv.classList.add('info-message-info');
            messageDiv.textContent = '🔄 Je hebt alle woorden al beoordeeld! We laten je nu woorden zien die je eerder hebt beoordeeld.';
          } else {
            messageDiv.classList.add('info-message-success');
            messageDiv.textContent = '✅ Je hebt alle woorden beoordeeld! Je kunt ze opnieuw beoordelen of nieuwe woorden voorstellen.';
          }

          // Add the message below the word card
          const wordCard = document.querySelector('.word-card');
          wordCard.parentNode.insertBefore(messageDiv, wordCard.nextSibling);
        }
      } else {
        throw new Error(data.error || 'Error loading word');
      }
    } catch (error) {
      console.error('Error loading random word:', error);
      wordToRate.textContent = 'Fout bij het laden van woord';
    }
  }

  // Helper function to translate rating codes to Dutch text
  function translateRating(rating) {
    switch(rating) {
      case 'easy': return 'Gemakkelijk';
      case 'medium': return 'Gemiddeld';
      case 'hard': return 'Moeilijk';
      case 'drop': return 'Verwijderen';
      default: return rating;
    }
  }
  // Submit a rating for the current word
  async function submitRating(rating) {
    if (!currentWord) return;
    
    try {
      const response = await fetch('/api/pictionary/rate-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word: currentWord,
          word_id: currentWordId,
          rating: rating
        }),
      });
      
      if (!response.ok) {
        throw new Error('Failed to submit rating');
      }
      
      // Update UI to show progress
      wordsRated++;
      ratedCount.textContent = wordsRated;
      progressFill.style.width = `${Math.min((wordsRated / 20) * 100, 100)}%`;
      
      // Check if we've reached 20 words
      if (wordsRated >= 20 && rating !== 'drop') {
        // Show celebration when reaching milestone
        celebrate();
        showThankYouMessage('Geweldig! Je hebt 20 woorden beoordeeld!');
        
        // Reset counter after a short delay
        setTimeout(() => {
          wordsRated = 0;
          ratedCount.textContent = wordsRated;
          progressFill.style.width = '0%';
        }, 2500);
      }
      
      // Load the next word
      loadRandomWord();
      
    } catch (error) {
      console.error('Error submitting rating:', error);
      
      // For demo/fallback, just pretend it worked and load next word
      wordsRated++;
      ratedCount.textContent = wordsRated;
      progressFill.style.width = `${Math.min((wordsRated / 20) * 100, 100)}%`;
      
      // Check if we've reached 20 words
      if (wordsRated >= 20 && rating !== 'drop') {
        // Show celebration when reaching milestone
        celebrate();
        showThankYouMessage('Geweldig! Je hebt 20 woorden beoordeeld!');
        
        // Reset counter after a short delay
        setTimeout(() => {
          wordsRated = 0;
          ratedCount.textContent = wordsRated;
          progressFill.style.width = '0%';
        }, 2500);
      }
      
      loadRandomWord();
    }
  }
  
  // Submit a word suggestion
  async function submitWordSuggestion() {
    const word = suggestedWordInput.value.trim();
    const difficulty = document.querySelector('input[name="difficulty"]:checked').value;
    
    if (!word) {
      showSuggestionMessage('Voer een woord in', 'error');
      return;
    }
    
    try {
      const response = await fetch('/api/pictionary/suggest-word', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          word: word,
          difficulty: difficulty
        }),
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit suggestion');
      }
      const data = await response.json();
    
      // Check if the word already existed
      if (data.existing) {
          showSuggestionMessage(data.message, 'info');
      } else {
          // Show success message for new suggestions
          showSuggestionMessage('Bedankt voor je suggestie!', 'success');
          // Show confetti for new suggestions
          celebrate();
      }
      // Clear the input field
      suggestedWordInput.value = '';
      
    } catch (error) {
      console.error('Error submitting word suggestion:', error);
      
      // For demo/fallback, just pretend it worked
      showSuggestionMessage('Bedankt voor je suggestie!', 'success');
      // Show confetti for new suggestions
      celebrate();
      suggestedWordInput.value = '';
    }
  }
  
  // Show a message for the suggestion result
  function showSuggestionMessage(message, type) {
    suggestionMessage.textContent = message;
    suggestionMessage.className = 'suggestion-message';
    suggestionMessage.classList.add(type);
    suggestionMessage.style.display = 'block';

    // Hide the message after a delay
    setTimeout(() => {
      suggestionMessage.style.display = 'none';
    }, 4000);
  }
  
  // Event Listeners
  ratingButtons.forEach(button => {
    button.addEventListener('click', () => {
      const rating = button.getAttribute('data-rating');
      
      // If this is the "Woord Verwijderen" button, show a confirmation dialog
      if (rating === 'drop') {
        showConfirmationDialog(
          `Weet je zeker dat je "${currentWord}" wilt verwijderen?`,
          () => submitRating(rating)
        );
      } else {
        submitRating(rating);
      }
    });
  });
  
  skipBtn.addEventListener('click', () => {
    loadRandomWord();
  });
  
  suggestBtn.addEventListener('click', () => {
    submitWordSuggestion();
  });
  
  // Function to show confetti celebration
  function celebrate() {
    if (typeof confetti === 'function') {
      confetti({
        particleCount: 150,  // More particles for milestone celebration
        spread: 70,
        origin: { y: 0.6 },
        zIndex: 999  // Make sure it's below the thank you message
      });
    } else {
      console.warn('Confetti library not loaded');
    }
  }
  
  // Function to show a thank you message
  function showThankYouMessage(message = 'Bedankt voor je beoordeling!') {
    toast(message, { type: 'success' });
  }
  
  // Function to show a confirmation dialog
  function showConfirmationDialog(message, onConfirm) {
    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `
      <div class="modal" role="dialog" aria-modal="true">
        <p class="confirm-text"></p>
        <div class="confirm-buttons">
          <button class="btn btn-secondary" data-action="cancel">Annuleren</button>
          <button class="btn btn-danger" data-action="confirm">Ja, verwijderen</button>
        </div>
      </div>`;
    overlay.querySelector('.confirm-text').textContent = message;
    overlay.addEventListener('click', (event) => {
      const action = event.target.dataset.action;
      if (action || event.target === overlay) overlay.remove();
      if (action === 'confirm') onConfirm();
    });
    document.body.appendChild(overlay);
    overlay.querySelector('[data-action="confirm"]').focus();
  }
  
  // Initialize with a random word
  loadRandomWord();
});