// scripts/reject-suggestion.js
const wordAdmin = require('../utils/wordAdmin');

async function rejectSuggestion() {
  // Get command line arguments
  const suggestionId = parseInt(process.argv[2]);
  
  if (!suggestionId || isNaN(suggestionId)) {
    console.error('Error: Suggestion ID is required and must be a number');
    console.log('Usage: node scripts/reject-suggestion.js [suggestion-id]');
    console.log('Example: node scripts/reject-suggestion.js 3');
    process.exit(1);
  }
  
  try {
    console.log(`Rejecting suggestion ID ${suggestionId}...`);
    await wordAdmin.rejectSuggestion(suggestionId);
    console.log('Suggestion rejected successfully!');
  } catch (error) {
    console.error('Error rejecting suggestion:', error.message);
  } finally {
    process.exit();
  }
}

rejectSuggestion();
