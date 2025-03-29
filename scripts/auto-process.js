// scripts/auto-process.js
const wordAdmin = require('../utils/wordAdmin');

// Default threshold constants
const DEFAULT_MIN_RATINGS = 4;
const DEFAULT_CONSENSUS_THRESHOLD = 70;
const DEFAULT_DROP_THRESHOLD = 60;

async function autoProcessWords() {
  // Parse command line arguments for thresholds
  const args = parseCommandLineArgs();
  
  // Set thresholds based on arguments or defaults
  const minRatings = args.minRatings || DEFAULT_MIN_RATINGS;
  const consensusThreshold = args.consensusThreshold || DEFAULT_CONSENSUS_THRESHOLD;
  const dropThreshold = args.dropThreshold || DEFAULT_DROP_THRESHOLD;
  
  try {
    console.log('===== AUTO-PROCESSING WORDS =====');
    console.log('Processing words with high consensus automatically...');
    console.log('Minimum ratings required: ' + minRatings);
    console.log('Consensus threshold: ' + consensusThreshold + '%');
    console.log('Drop threshold: ' + dropThreshold + '%');
    console.log('==================================');
    
    // 1. Auto-process suggestions
    await autoProcessSuggestions(minRatings, consensusThreshold, dropThreshold);
    
    // 2. Auto-process words to change difficulty
    await autoProcessDifficultyChanges(minRatings, consensusThreshold);
    
    // 3. Auto-process words to remove
    await autoProcessWordsToRemove(minRatings, dropThreshold);
    
    console.log('Auto-processing complete!');
    
  } catch (error) {
    console.error('Error in auto-processing:', error);
  } finally {
    process.exit();
  }
}

async function autoProcessSuggestions(minRatings, consensusThreshold, dropThreshold) {
  console.log('\n== Processing Suggestions ==');
  
  try {
    // Get all suggestions with enough ratings
    const suggestions = await wordAdmin.getSuggestionsForReview(minRatings);
    
    if (suggestions.length === 0) {
      console.log('No suggestions with enough ratings to process.');
      return;
    }
    
    console.log(`Found ${suggestions.length} suggestions to review.`);
    let processedCount = 0;
    
    for (const suggestion of suggestions) {
      const dropPercentage = (suggestion.drop_count / suggestion.rating_count * 100);
      
      // If high drop percentage, auto-reject
      if (dropPercentage >= dropThreshold) {
        console.log(`Auto-rejecting "${suggestion.word}" (${dropPercentage.toFixed(1)}% drop ratings)`);
        await wordAdmin.rejectSuggestion(suggestion.id);
        processedCount++;
        continue;
      }
      
      // Find highest-rated difficulty
      const ratings = [
        { difficulty: 'easy', count: suggestion.easy_count },
        { difficulty: 'medium', count: suggestion.medium_count },
        { difficulty: 'hard', count: suggestion.hard_count }
      ];
      
      ratings.sort((a, b) => b.count - a.count);
      const topDifficulty = ratings[0].difficulty;
      const topPercentage = (ratings[0].count / suggestion.rating_count * 100);
      
      // If there's strong consensus, auto-accept
      if (topPercentage >= consensusThreshold) {
        console.log(`Auto-accepting "${suggestion.word}" as ${topDifficulty} (${topPercentage.toFixed(1)}% consensus)`);
        await wordAdmin.acceptSuggestion(suggestion.id, topDifficulty);
        processedCount++;
      } else {
        console.log(`Skipping "${suggestion.word}" (insufficient consensus: ${topPercentage.toFixed(1)}%)`);
      }
    }
    
    console.log(`Processed ${processedCount} out of ${suggestions.length} suggestions.`);
    
  } catch (error) {
    console.error('Error processing suggestions:', error);
  }
}

async function autoProcessDifficultyChanges(minRatings, consensusThreshold) {
  console.log('\n== Processing Difficulty Changes ==');
  
  try {
    // Get words that might need difficulty changes
    const words = await wordAdmin.getWordsToChangeDifficulty(minRatings, consensusThreshold);
    
    if (words.length === 0) {
      console.log('No words with enough ratings to change difficulty.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need difficulty changes.`);
    let processedCount = 0;
    
    for (const word of words) {
      console.log(`Auto-changing "${word.word}" from ${word.current_difficulty} to ${word.recommended_difficulty}`);
      
      const success = await wordAdmin.changeWordDifficulty(
        word.word, 
        word.current_difficulty, 
        word.recommended_difficulty
      );
      
      if (success) {
        processedCount++;
      } else {
        console.log(`  -> Failed to change difficulty for "${word.word}"`);
      }
    }
    
    console.log(`Changed difficulty for ${processedCount} out of ${words.length} words.`);
    
  } catch (error) {
    console.error('Error processing difficulty changes:', error);
  }
}

async function autoProcessWordsToRemove(minRatings, dropThreshold) {
  console.log('\n== Processing Words to Remove ==');
  
  try {
    // Get words that might need to be removed (high drop ratings)
    const words = await wordAdmin.getWordsToRemove(minRatings);
    
    if (words.length === 0) {
      console.log('No words with enough drop ratings to remove.');
      return;
    }
    
    console.log(`Found ${words.length} words that might need removal.`);
    let processedCount = 0;
    
    for (const word of words) {
      // Only auto-remove if drop percentage is above threshold
      if (word.drop_percentage >= dropThreshold) {
        console.log(`Auto-removing "${word.word}" (${word.drop_percentage.toFixed(1)}% drop ratings)`);
        const removed = await wordAdmin.removeWord(word.word);
        
        if (removed) {
          processedCount++;
        } else {
          console.log(`  -> Failed to remove "${word.word}"`);
        }
      } else {
        console.log(`Skipping "${word.word}" (insufficient drop consensus: ${word.drop_percentage.toFixed(1)}%)`);
      }
    }
    
    console.log(`Removed ${processedCount} out of ${words.length} words.`);
    
  } catch (error) {
    console.error('Error processing words to remove:', error);
  }
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

autoProcessWords();