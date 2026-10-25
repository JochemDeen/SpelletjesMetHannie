//models/pictionary/gradeSuggester.js
// Gemini-backed grade suggester for Pictionary: given the drawn word and the
// guesses of a round, suggest a score (1-5) per guess for the drawer to review.
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const { callGemini } = require('../gemini');

function loadPrompt() {
  const promptsPath = path.join(__dirname, '../../prompts/pictionary-grade-judge.json');
  const data = fs.readFileSync(promptsPath, 'utf8');
  return JSON.parse(data).grade_guesses.prompt;
}

// Cache suggestions per action_id so page reloads or the modify round-trip
// don't trigger a new Gemini call for the same guesses.
const suggestionCache = new Map();

function pruneCache() {
  if (suggestionCache.size > 200) {
    suggestionCache.clear();
  }
}

// guesses: array of { action_id, text }.
// Returns a Map of action_id -> suggested grade (1-5). Entries without a
// usable suggestion are simply absent. Never throws: grading must keep
// working without suggestions if the LLM fails.
async function suggestGrades(word, guesses) {
  const suggestions = new Map();
  if (!guesses || guesses.length === 0) return suggestions;

  const cached = guesses.every((guess) => suggestionCache.has(guess.action_id));
  if (cached) {
    guesses.forEach((guess) => suggestions.set(guess.action_id, suggestionCache.get(guess.action_id)));
    return suggestions;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.info('Pictionary: GEMINI_API_KEY not configured, skipping grade suggestions.');
    return suggestions;
  }

  try {
    const guessList = guesses.map((guess, index) => `${index + 1}. "${guess.text}"`).join('\n');
    const prompt = loadPrompt()
      .replaceAll('{word}', word)
      .replaceAll('{guesses}', guessList);

    logger.info(`Pictionary: suggesting grades for ${guesses.length} guesses against word "${word}"`);

    const answer = await callGemini(prompt, { temperature: 0, maxOutputTokens: 200 });

    if (!answer) return suggestions;

    // The model should answer with a bare JSON array, but tolerate markdown
    // fences or surrounding text by extracting the first [...] block.
    const match = answer.match(/\[[^\]]*\]/);
    if (!match) {
      logger.warn(`Pictionary: unexpected grade suggestion answer "${answer}"`);
      return suggestions;
    }
    const grades = JSON.parse(match[0]);
    if (!Array.isArray(grades)) return suggestions;

    guesses.forEach((guess, index) => {
      const grade = grades[index];
      if (Number.isInteger(grade) && grade >= 1 && grade <= 5) {
        suggestions.set(guess.action_id, grade);
        suggestionCache.set(guess.action_id, grade);
      }
    });
    pruneCache();
    logger.info(`Pictionary: grade suggestions: ${JSON.stringify([...suggestions])}`);
    return suggestions;
  } catch (error) {
    logger.error(`Pictionary: grade suggester failed: ${error.message}`);
    return suggestions;
  }
}

module.exports = {
  suggestGrades
};
