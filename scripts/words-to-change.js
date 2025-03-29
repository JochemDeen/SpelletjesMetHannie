// scripts/words-to-change.js
const wordAdmin = require('../utils/wordAdmin');

async function reviewDifficultyChanges() {
  try {
    console.log('Fetching words that might need difficulty changes...');
    const words = await wordAdmin.getWordsToChangeDifficulty(3, 60); // 5+ ratings, 60% threshold
    
    if (words.length === 0) {
      console.log('No words with enough ratings to consider changing difficulty.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need difficulty changes:`);
    console.log('------------------------------------------------------');
    
    words.forEach((word, index) => {
      console.log(`${index + 1}. "${word.word}" (Currently: ${word.current_difficulty})`);
      console.log(`   Ratings: ${word.total_ratings} total`);
      console.log(`   Easy: ${word.easy_count} (${word.easy_percentage.toFixed(1)}%)`);
      console.log(`   Medium: ${word.medium_count} (${word.medium_percentage.toFixed(1)}%)`);
      console.log(`   Hard: ${word.hard_count} (${word.hard_percentage.toFixed(1)}%)`);
      console.log(`   RECOMMENDATION: Change to ${word.recommended_difficulty}`);
      console.log(`   Reason: ${word.change_reason}`);
      console.log(`   Run: node scripts/change-difficulty.js "${word.word}" ${word.current_difficulty} ${word.recommended_difficulty}`);
      console.log('------------------------------------------------------');
    });
    
    // Instructions
    console.log('\nTo change a word\'s difficulty:');
    console.log('node scripts/change-difficulty.js [word] [from-difficulty] [to-difficulty]');
    console.log('Example: node scripts/change-difficulty.js "Complex Word" medium hard');
    
  } catch (error) {
    console.error('Error fetching words to change difficulty:', error);
  } finally {
    process.exit();
  }
}

reviewDifficultyChanges();