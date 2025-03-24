// scripts/add-word.js
const wordAdmin = require('../utils/wordAdmin');

function addWord() {
  // Get command line arguments
  const word = process.argv[2];
  const difficulty = process.argv[3];
  
  if (!word) {
    console.error('Error: Word is required');
    console.log('Usage: node scripts/add-word.js [word] [difficulty]');
    console.log('Example: node scripts/add-word.js "New Word" easy');
    process.exit(1);
  }
  
  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    console.error('Error: Difficulty is required and must be one of: easy, medium, hard');
    console.log('Usage: node scripts/add-word.js [word] [difficulty]');
    process.exit(1);
  }
  
  try {
    console.log(`Adding word "${word}" to ${difficulty} difficulty...`);
    const added = wordAdmin.addWord(word, difficulty);
    
    if (added) {
      console.log('Word added successfully!');
    } else {
      console.log('Failed to add word. It may already exist.');
    }
  } catch (error) {
    console.error('Error adding word:', error.message);
  } finally {
    process.exit();
  }
}

addWord();