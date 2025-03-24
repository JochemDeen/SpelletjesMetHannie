// scripts/review-suggestions.js
const wordAdmin = require('../utils/wordAdmin');

async function reviewSuggestions() {
  try {
    console.log('Fetching suggestions that need review...');
    const suggestions = await wordAdmin.getSuggestionsForReview(3); // 3 or more ratings
    
    if (suggestions.length === 0) {
      console.log('No suggestions with enough ratings to review.');
      return;
    }
    
    console.log(`Found ${suggestions.length} suggestions to review:`);
    console.log('------------------------------------------------------');
    
    suggestions.forEach((suggestion, index) => {
      const dropPercentage = (suggestion.drop_count / suggestion.rating_count * 100).toFixed(1);
      
      console.log(`${index + 1}. "${suggestion.word}" (Suggested as: ${suggestion.suggested_difficulty})`);
      console.log(`   ID: ${suggestion.id}`);
      console.log(`   Ratings: ${suggestion.rating_count} total`);
      console.log(`   Easy: ${suggestion.easy_count} (${(suggestion.easy_count / suggestion.rating_count * 100).toFixed(1)}%)`);
      console.log(`   Medium: ${suggestion.medium_count} (${(suggestion.medium_count / suggestion.rating_count * 100).toFixed(1)}%)`);
      console.log(`   Hard: ${suggestion.hard_count} (${(suggestion.hard_count / suggestion.rating_count * 100).toFixed(1)}%)`);
      console.log(`   Drop: ${suggestion.drop_count} (${dropPercentage}%)`);
      console.log(`   Times shown: ${suggestion.used_count}`);
      
      // Recommendation
      let recommendedDifficulty = null;
      let recommendedAction = '';
      
      // If more than 50% want to drop it, recommend rejection
      if (dropPercentage >= 50) {
        console.log('   RECOMMENDATION: Reject (high drop rate)');
        recommendedAction = `node scripts/reject-suggestion.js ${suggestion.id}`;
        console.log(`   Run: ${recommendedAction}`);
      } else {
        // Find the highest rated difficulty
        const ratings = [
          { difficulty: 'easy', count: suggestion.easy_count },
          { difficulty: 'medium', count: suggestion.medium_count },
          { difficulty: 'hard', count: suggestion.hard_count }
        ];
        
        ratings.sort((a, b) => b.count - a.count);
        recommendedDifficulty = ratings[0].difficulty;
        
        const topPercentage = (ratings[0].count / suggestion.rating_count * 100).toFixed(1);
        
        if (topPercentage >= 50) {
          console.log(`   RECOMMENDATION: Accept as ${recommendedDifficulty} (${topPercentage}% consensus)`);
          recommendedAction = `node scripts/accept-suggestion.js ${suggestion.id} ${recommendedDifficulty}`;
          console.log(`   Run: ${recommendedAction}`);
        } else {
          console.log(`   RECOMMENDATION: Consider as ${recommendedDifficulty} (${topPercentage}% - low consensus)`);
          recommendedAction = `node scripts/accept-suggestion.js ${suggestion.id} ${recommendedDifficulty}`;
          console.log(`   Run: ${recommendedAction} (if you agree with this classification)`);
        }
      }
      
      console.log('------------------------------------------------------');
    });
    
    // Overall instructions
    console.log('\nGeneral Information:');
    console.log('\nTo accept a suggestion:');
    console.log('node scripts/accept-suggestion.js [suggestion-id] [difficulty]');
    console.log('Example: node scripts/accept-suggestion.js 5 medium');
    
    console.log('\nTo reject a suggestion:');
    console.log('node scripts/reject-suggestion.js [suggestion-id]');
    console.log('Example: node scripts/reject-suggestion.js 3');
    
  } catch (error) {
    console.error('Error reviewing suggestions:', error);
  } finally {
    process.exit();
  }
}

reviewSuggestions();