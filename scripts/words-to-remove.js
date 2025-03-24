// scripts/words-to-remove.js
const wordAdmin = require('../utils/wordAdmin');

async function reviewWordsToRemove() {
  try {
    console.log('Fetching words that might need to be removed...');
    const words = await wordAdmin.getWordsToRemove(3); // 3 or more drop ratings
    
    if (words.length === 0) {
      console.log('No words with enough drop ratings to consider removing.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need removal:`);
    console.log('------------------------------------------------------');
    
    words.forEach((word, index) => {
      console.log(`${index + 1}. "${word.word}"`);
      console.log(`   Drop ratings: ${word.drop_count}/${word.total_ratings} (${word.drop_percentage.toFixed(1)}%)`);
      console.log(`   RECOMMENDATION: Remove this word`);
      console.log(`   Run: node scripts/remove-word.js "${word.word}"`);
      console.log('------------------------------------------------------');
    });
    
    // Instructions
    console.log('\nTo remove a word:');
    console.log('node scripts/remove-word.js [word]');
    console.log('Example: node scripts/remove-word.js "Difficult Word"');
    
  } catch (error) {
    console.error('Error fetching words to remove:', error);
  } finally {
    process.exit();
  }
}

reviewWordsToRemove();