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
    
    if (!stats) {
      console.log('Unable to retrieve statistics.');
      return;
    }
    
    // Use default values of 0 for any undefined stats
    const {
      totalWords = 0,
      easyWords = 0,
      mediumWords = 0,
      hardWords = 0,
      pendingSuggestions = 0,
      uniqueRaters = 0,
      totalRatings = 0,
      easyRatings = 0,
      mediumRatings = 0,
      hardRatings = 0,
      dropRatings = 0,
      averageRatingsPerWord = 0,
      unratedWords = 0,
      mostRatedWord = { word: 'None', count: 0 }
    } = stats;
    
    console.log(`Total words in database: ${totalWords || 0}`);
    console.log(`  - Easy: ${easyWords || 0}`);
    console.log(`  - Medium: ${mediumWords || 0}`);
    console.log(`  - Hard: ${hardWords || 0}`);
    console.log(`\nPending suggestions: ${pendingSuggestions || 0}`);
    console.log(`Total users who have rated: ${uniqueRaters || 0}`);
    console.log(`Total ratings submitted: ${totalRatings || 0}`);
    console.log(`Average ratings per word: ${(averageRatingsPerWord || 0).toFixed(1)}`);
    console.log(`Words with no ratings: ${unratedWords || 0}`);
    
    const wordStr = mostRatedWord && mostRatedWord.word ? mostRatedWord.word : 'None';
    const countStr = mostRatedWord && mostRatedWord.count ? mostRatedWord.count : 0;
    console.log(`Most rated word: "${wordStr}" (${countStr} ratings)`);
    
    // Calculate distribution (avoid division by zero)
    console.log('\nRating distribution:');
    const total = totalRatings || 1; // Avoid division by zero
    console.log(`  - Easy ratings: ${easyRatings || 0} (${((easyRatings || 0) / total * 100).toFixed(1)}%)`);
    console.log(`  - Medium ratings: ${mediumRatings || 0} (${((mediumRatings || 0) / total * 100).toFixed(1)}%)`);
    console.log(`  - Hard ratings: ${hardRatings || 0} (${((hardRatings || 0) / total * 100).toFixed(1)}%)`);
    console.log(`  - Drop ratings: ${dropRatings || 0} (${((dropRatings || 0) / total * 100).toFixed(1)}%)`);
    
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
    
    if (!suggestions || suggestions.length === 0) {
      console.log('No suggestions with enough ratings to review.');
      return;
    }
    
    console.log(`Found ${suggestions.length} suggestions to review:`);
    console.log('------------------------------------------------------');
    
    suggestions.forEach((suggestion, index) => {
      const ratingCount = suggestion.rating_count || 0;
      const dropPercentage = ratingCount > 0 
        ? ((suggestion.drop_count || 0) / ratingCount * 100).toFixed(1)
        : '0.0';
      
      console.log(`${index + 1}. "${suggestion.word}" (Suggested as: ${suggestion.suggested_difficulty})`);
      console.log(`   ID: ${suggestion.id}`);
      console.log(`   Ratings: ${ratingCount} total`);
      
      // Calculate percentages safely (avoid division by zero)
      const easyPercent = ratingCount > 0 
        ? ((suggestion.easy_count || 0) / ratingCount * 100).toFixed(1) 
        : '0.0';
      const mediumPercent = ratingCount > 0 
        ? ((suggestion.medium_count || 0) / ratingCount * 100).toFixed(1) 
        : '0.0';
      const hardPercent = ratingCount > 0 
        ? ((suggestion.hard_count || 0) / ratingCount * 100).toFixed(1) 
        : '0.0';
      
      console.log(`   Easy: ${suggestion.easy_count || 0} (${easyPercent}%)`);
      console.log(`   Medium: ${suggestion.medium_count || 0} (${mediumPercent}%)`);
      console.log(`   Hard: ${suggestion.hard_count || 0} (${hardPercent}%)`);
      console.log(`   Drop: ${suggestion.drop_count || 0} (${dropPercentage}%)`);
      console.log(`   Times shown: ${suggestion.used_count || 0}`);
      
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
          { difficulty: 'easy', count: suggestion.easy_count || 0 },
          { difficulty: 'medium', count: suggestion.medium_count || 0 },
          { difficulty: 'hard', count: suggestion.hard_count || 0 }
        ];
        
        ratings.sort((a, b) => b.count - a.count);
        recommendedDifficulty = ratings[0].difficulty;
        
        const topPercentage = ratingCount > 0 
          ? (ratings[0].count / ratingCount * 100).toFixed(1)
          : '0.0';
        
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
    
    if (!words || words.length === 0) {
      console.log('No words with enough ratings to consider changing difficulty.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need difficulty changes:`);
    console.log('------------------------------------------------------');
    
    words.forEach((word, index) => {
      console.log(`${index + 1}. "${word.word}" (Currently: ${word.current_difficulty})`);
      console.log(`   Ratings: ${word.total_ratings || 0} total`);
      
      // Safely access percentage values
      const easyPercent = word.easy_percentage ? word.easy_percentage.toFixed(1) : '0.0';
      const mediumPercent = word.medium_percentage ? word.medium_percentage.toFixed(1) : '0.0';
      const hardPercent = word.hard_percentage ? word.hard_percentage.toFixed(1) : '0.0';
      
      console.log(`   Easy: ${word.easy_count || 0} (${easyPercent}%)`);
      console.log(`   Medium: ${word.medium_count || 0} (${mediumPercent}%)`);
      console.log(`   Hard: ${word.hard_count || 0} (${hardPercent}%)`);
      console.log(`   RECOMMENDATION: Change to ${word.recommended_difficulty}`);
      console.log(`   Reason: ${word.change_reason || "High consensus for different difficulty"}`);
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
    
    if (!words || words.length === 0) {
      console.log('No words with enough drop ratings to consider removing.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need removal:`);
    console.log('------------------------------------------------------');
    
    let wordsToRemove = 0;
    
    words.forEach((word, index) => {
      console.log(`${index + 1}. "${word.word}"`);
      console.log(`   Current difficulty: ${word.difficulty || "Unknown"}`);
      
      const dropPercent = word.drop_percentage ? word.drop_percentage.toFixed(1) : '0.0';
      console.log(`   Drop ratings: ${word.drop_count || 0}/${word.total_ratings || 0} (${dropPercent}%)`);
      
      const dropPercentValue = parseFloat(dropPercent);
      if (dropPercentValue >= dropThreshold) {
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