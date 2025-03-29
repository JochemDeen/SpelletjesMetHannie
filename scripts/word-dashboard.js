// scripts/word-dashboard.js
const wordAdmin = require('../utils/wordAdmin');

// Default threshold values
const DEFAULT_MIN_RATINGS = 3;
const DEFAULT_CONSENSUS_THRESHOLD = 50;
const DEFAULT_DROP_THRESHOLD = 50;

async function displayWordDashboard() {
  // Parse command line arguments for thresholds
  const args = parseCommandLineArgs();
  
  // Set thresholds based on arguments or defaults
  const minRatings = args.minRatings || DEFAULT_MIN_RATINGS;
  const consensusThreshold = args.consensusThreshold || DEFAULT_CONSENSUS_THRESHOLD;
  const dropThreshold = args.dropThreshold || DEFAULT_DROP_THRESHOLD;
  
  try {
    console.log('============================================================');
    console.log('                   PICTIONARY WORD DASHBOARD                ');
    console.log('============================================================');
    console.log(`Minimum ratings: ${minRatings}`);
    console.log(`Consensus threshold: ${consensusThreshold}%`);
    console.log(`Drop threshold: ${dropThreshold}%`);
    console.log('============================================================');
    
    // Get summary statistics
    await displaySummaryStatistics();
    
    // Review suggestions
    await reviewSuggestions(minRatings, consensusThreshold, dropThreshold);
    
    // Review difficulty changes
    await reviewDifficultyChanges(minRatings, consensusThreshold);
    
    // Review words to remove
    await reviewWordsToRemove(minRatings, dropThreshold);
    
    // Display command reference
    displayCommandReference();
    
  } catch (error) {
    console.error('Error in dashboard:', error);
  } finally {
    process.exit();
  }
}

async function displaySummaryStatistics() {
  try {
    console.log('\n============================================================');
    console.log('                    SUMMARY STATISTICS                      ');
    console.log('============================================================');
    
    // Get statistics from wordAdmin
    const stats = await wordAdmin.getWordStatistics();
    
    console.log(`Total words in database: ${stats.totalWords}`);
    console.log(`  - Easy: ${stats.easyWords}`);
    console.log(`  - Medium: ${stats.mediumWords}`);
    console.log(`  - Hard: ${stats.hardWords}`);
    console.log(`\nPending suggestions: ${stats.pendingSuggestions}`);
    console.log(`Total users who have rated: ${stats.uniqueRaters}`);
    console.log(`Total ratings submitted: ${stats.totalRatings}`);
    console.log(`Average ratings per word: ${stats.averageRatingsPerWord.toFixed(1)}`);
    console.log(`Words with no ratings: ${stats.unratedWords}`);
    console.log(`Most rated word: "${stats.mostRatedWord.word}" (${stats.mostRatedWord.count} ratings)`);
    
    // Calculate distribution
    console.log('\nRating distribution:');
    console.log(`  - Easy ratings: ${stats.easyRatings} (${(stats.easyRatings / stats.totalRatings * 100).toFixed(1)}%)`);
    console.log(`  - Medium ratings: ${stats.mediumRatings} (${(stats.mediumRatings / stats.totalRatings * 100).toFixed(1)}%)`);
    console.log(`  - Hard ratings: ${stats.hardRatings} (${(stats.hardRatings / stats.totalRatings * 100).toFixed(1)}%)`);
    console.log(`  - Drop ratings: ${stats.dropRatings} (${(stats.dropRatings / stats.totalRatings * 100).toFixed(1)}%)`);
    
  } catch (error) {
    console.error('Error fetching statistics:', error);
  }
}

async function reviewSuggestions(minRatings, consensusThreshold, dropThreshold) {
  try {
    console.log('\n============================================================');
    console.log('                   SUGGESTIONS TO REVIEW                    ');
    console.log('============================================================');
    
    const suggestions = await wordAdmin.getSuggestionsForReview(minRatings);
    
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
      
      // If more than threshold% want to drop it, recommend rejection
      if (parseFloat(dropPercentage) >= dropThreshold) {
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
        
        if (parseFloat(topPercentage) >= consensusThreshold) {
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
  } catch (error) {
    console.error('Error reviewing suggestions:', error);
  }
}

async function reviewDifficultyChanges(minRatings, consensusThreshold) {
  try {
    console.log('\n============================================================');
    console.log('                DIFFICULTY CHANGES TO REVIEW                ');
    console.log('============================================================');
    
    const words = await wordAdmin.getWordsToChangeDifficulty(minRatings, consensusThreshold);
    
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
  } catch (error) {
    console.error('Error fetching words to change difficulty:', error);
  }
}

async function reviewWordsToRemove(minRatings, dropThreshold) {
  try {
    console.log('\n============================================================');
    console.log('                    WORDS TO REMOVE                         ');
    console.log('============================================================');
    
    const words = await wordAdmin.getWordsToRemove(minRatings);
    
    if (words.length === 0) {
      console.log('No words with enough drop ratings to consider removing.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need removal:`);
    console.log('------------------------------------------------------');
    
    let wordsToRemove = 0;
    
    words.forEach((word, index) => {
      console.log(`${index + 1}. "${word.word}"`);
      console.log(`   Current difficulty: ${word.difficulty}`);
      console.log(`   Drop ratings: ${word.drop_count}/${word.total_ratings} (${word.drop_percentage.toFixed(1)}%)`);
      
      if (word.drop_percentage >= dropThreshold) {
        console.log(`   RECOMMENDATION: Remove this word (exceeds ${dropThreshold}% threshold)`);
        console.log(`   Run: node scripts/remove-word.js "${word.word}"`);
        wordsToRemove++;
      } else {
        console.log(`   RECOMMENDATION: Keep monitoring (below ${dropThreshold}% threshold)`);
      }
      
      console.log('------------------------------------------------------');
    });
    
    console.log(`Words recommended for removal: ${wordsToRemove}/${words.length}`);
  } catch (error) {
    console.error('Error fetching words to remove:', error);
  }
}

function displayCommandReference() {
  console.log('\n============================================================');
  console.log('                    COMMAND REFERENCE                       ');
  console.log('============================================================');
  
  console.log('To accept a suggestion:');
  console.log('  node scripts/accept-suggestion.js [suggestion-id] [difficulty]');
  console.log('  Example: node scripts/accept-suggestion.js 5 medium');
  
  console.log('\nTo reject a suggestion:');
  console.log('  node scripts/reject-suggestion.js [suggestion-id]');
  console.log('  Example: node scripts/reject-suggestion.js 3');
  
  console.log('\nTo change a word\'s difficulty:');
  console.log('  node scripts/change-difficulty.js [word] [from-difficulty] [to-difficulty]');
  console.log('  Example: node scripts/change-difficulty.js "Complex Word" medium hard');
  
  console.log('\nTo remove a word:');
  console.log('  node scripts/remove-word.js [word]');
  console.log('  Example: node scripts/remove-word.js "Difficult Word"');
  
  console.log('\nTo auto-process with current thresholds:');
  console.log('  node scripts/auto-process.js');
  
  console.log('\nTo run this dashboard with custom thresholds:');
  console.log('  node scripts/word-dashboard.js --min-ratings=4 --consensus=60 --drop=70');
}

function parseCommandLineArgs() {
  const args = {
    minRatings: null,
    consensusThreshold: null,
    dropThreshold: null
  };
  
  process.argv.slice(2).forEach(arg => {
    if (arg.startsWith('--min-ratings=')) {
      args.minRatings = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--consensus=')) {
      args.consensusThreshold = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--drop=')) {
      args.dropThreshold = parseInt(arg.split('=')[1]);
    }
  });
  
  return args;
}

// Execute the dashboard
displayWordDashboard();
