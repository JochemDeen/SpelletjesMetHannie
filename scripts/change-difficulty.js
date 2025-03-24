// scripts/change-difficulty.js
const wordAdmin = require('../utils/wordAdmin');

function changeDifficulty() {
  // Get command line arguments
  const word = process.argv[2];
  const fromDifficulty = process.argv[3];
  const toDifficulty = process.argv[4];
  
  if (!word) {
    console.error('Error: Word is required');
    console.log('Usage: node scripts/change-difficulty.js [word] [from-difficulty] [to-difficulty]');
    console.log('Example: node scripts/change-difficulty.js "Complex Word" medium hard');
    process.exit(1);
  }
  
  if (!fromDifficulty || !['easy', 'medium', 'hard'].includes(fromDifficulty)) {
    console.error('Error: Source difficulty is required and must be one of: easy, medium, hard');
    console.log('Usage: node scripts/change-difficulty.js [word] [from-difficulty] [to-difficulty]');
    process.exit(1);
  }
  
  if (!toDifficulty || !['easy', 'medium', 'hard'].includes(toDifficulty)) {
    console.error('Error: Target difficulty is required and must be one of: easy, medium, hard');
    console.log('Usage: node scripts/change-difficulty.js [word] [from-difficulty] [to-difficulty]');
    process.exit(1);
  }
  
  try {
    console.log(`Changing difficulty of "${word}" from ${fromDifficulty} to ${toDifficulty}...`);
    const changed = wordAdmin.changeWordDifficulty(word, fromDifficulty, toDifficulty);
    
    if (changed) {
      console.log('Word difficulty changed successfully!');
    } else {
      console.log('Failed to change word difficulty.');
    }
  } catch (error) {
    console.error('Error changing word difficulty:', error.message);
  } finally {
    process.exit();
  }
}

changeDifficulty();
