// scripts/remove-word.js
const wordAdmin = require('../utils/wordAdmin');

function removeWord() {
  // Get command line arguments
  const word = process.argv[2];
  
  if (!word) {
    console.error('Error: Word is required');
    console.log('Usage: node scripts/remove-word.js [word]');
    console.log('Example: node scripts/remove-word.js "Difficult Word"');
    process.exit(1);
  }
  
  try {
    console.log(`Removing word "${word}" from all difficulty levels...`);
    const removed = wordAdmin.removeWord(word);
    
    if (removed) {
      console.log('Word removed successfully!');
    } else {
      console.log('Word not found in any difficulty level.');
    }
  } catch (error) {
    console.error('Error removing word:', error.message);
  } finally {
    process.exit();
  }
}

removeWord();
