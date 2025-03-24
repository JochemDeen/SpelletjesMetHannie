// scripts/accept-suggestion.js
const wordAdmin = require('../utils/wordAdmin');

async function acceptSuggestion() {
  // Get command line arguments
  const suggestionId = parseInt(process.argv[2]);
  const difficulty = process.argv[3];
  
  if (!suggestionId || isNaN(suggestionId)) {
    console.error('Error: Suggestion ID is required and must be a number');
    console.log('Usage: node scripts/accept-suggestion.js [suggestion-id] [difficulty]');
    console.log('Example: node scripts/accept-suggestion.js 5 medium');
    process.exit(1);
  }
  
  if (!difficulty || !['easy', 'medium', 'hard'].includes(difficulty)) {
    console.error('Error: Difficulty is required and must be one of: easy, medium, hard');
    console.log('Usage: node scripts/accept-suggestion.js [suggestion-id] [difficulty]');
    console.log('Example: node scripts/accept-suggestion.js 5 medium');
    process.exit(1);
  }
  
  try {
    console.log(`Accepting suggestion ID ${suggestionId} as ${difficulty}...`);
    await wordAdmin.acceptSuggestion(suggestionId, difficulty);
    console.log('Suggestion accepted successfully!');
  } catch (error) {
    console.error('Error accepting suggestion:', error.message);
  } finally {
    process.exit();
  }
}

acceptSuggestion();
