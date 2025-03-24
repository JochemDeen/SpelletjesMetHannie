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
    
    try {
      const response = await fetch('/api/pictionary/random-word-to-rate');
      
      if (!response.ok) {
        throw new Error('Failed to fetch random word');
      }
      
      const data = await response.json();
      
      if (data.success) {
        currentWord = data.word;
        currentWordId = data.word_id; // If the backend provides an ID
        wordToRate.textContent = currentWord;
        // If we're showing words the user hasn't seen, add this to the seen set
        seenWords.add(currentWord);
      } else {
        throw new Error(data.error || 'Error loading word');
      }
    } catch (error) {
      console.error('Error loading random word:', error);
      
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
    const thankYouMessage = document.createElement('div');
    thankYouMessage.id = 'thank-you-message';
    thankYouMessage.textContent = message;
    thankYouMessage.style.position = 'fixed';
    thankYouMessage.style.top = '50%';
    thankYouMessage.style.left = '50%';
    thankYouMessage.style.transform = 'translate(-50%, -50%)';
    thankYouMessage.style.padding = '15px 25px';
    thankYouMessage.style.backgroundColor = '#4CAF50';
    thankYouMessage.style.color = 'white';
    thankYouMessage.style.borderRadius = '5px';
    thankYouMessage.style.fontSize = '18px';
    thankYouMessage.style.fontWeight = 'bold';
    thankYouMessage.style.zIndex = '1000';
    thankYouMessage.style.opacity = '0';
    thankYouMessage.style.transition = 'opacity 0.3s ease-in-out';
    
    document.body.appendChild(thankYouMessage);
    
    // Fade in
    setTimeout(() => {
      thankYouMessage.style.opacity = '1';
    }, 10);
    
    // Remove after 2 seconds with fade out
    setTimeout(() => {
      thankYouMessage.style.opacity = '0';
      setTimeout(() => {
        thankYouMessage.remove();
      }, 300);
    }, 2000);
  }
  
  // Function to show a confirmation dialog
  function showConfirmationDialog(message, onConfirm) {
    // Create the dialog overlay
    const overlay = document.createElement('div');
    overlay.style.position = 'fixed';
    overlay.style.top = '0';
    overlay.style.left = '0';
    overlay.style.width = '100%';
    overlay.style.height = '100%';
    overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    overlay.style.display = 'flex';
    overlay.style.justifyContent = 'center';
    overlay.style.alignItems = 'center';
    overlay.style.zIndex = '2000';
    
    // Create the dialog box
    const dialog = document.createElement('div');
    dialog.style.width = '300px';
    dialog.style.backgroundColor = 'white';
    dialog.style.borderRadius = '5px';
    dialog.style.boxShadow = '0 2px 10px rgba(0, 0, 0, 0.2)';
    dialog.style.padding = '20px';
    
    // Create the message
    const messageElement = document.createElement('p');
    messageElement.textContent = message;
    messageElement.style.marginTop = '0';
    messageElement.style.marginBottom = '20px';
    messageElement.style.textAlign = 'center';
    
    // Create the buttons
    const buttonContainer = document.createElement('div');
    buttonContainer.style.display = 'flex';
    buttonContainer.style.justifyContent = 'space-around';
    
    const cancelButton = document.createElement('button');
    cancelButton.textContent = 'Annuleren';
    cancelButton.style.padding = '8px 15px';
    cancelButton.style.backgroundColor = '#f44336';
    cancelButton.style.color = 'white';
    cancelButton.style.border = 'none';
    cancelButton.style.borderRadius = '4px';
    cancelButton.style.cursor = 'pointer';
    
    const confirmButton = document.createElement('button');
    confirmButton.textContent = 'Ja, verwijderen';
    confirmButton.style.padding = '8px 15px';
    confirmButton.style.backgroundColor = '#4CAF50';
    confirmButton.style.color = 'white';
    confirmButton.style.border = 'none';
    confirmButton.style.borderRadius = '4px';
    confirmButton.style.cursor = 'pointer';
    
    // Add event listeners to buttons
    cancelButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
    });
    
    confirmButton.addEventListener('click', () => {
      document.body.removeChild(overlay);
      onConfirm();
    });
    
    // Assemble the dialog
    buttonContainer.appendChild(cancelButton);
    buttonContainer.appendChild(confirmButton);
    dialog.appendChild(messageElement);
    dialog.appendChild(buttonContainer);
    overlay.appendChild(dialog);
    
    // Add the dialog to the document
    document.body.appendChild(overlay);
  }
  
  // Initialize with a random word
  loadRandomWord();
});