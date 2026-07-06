//models/pictionary/gradeSuggester.js
// Gemini-backed grade suggester for Pictionary: given the drawn word and the
// guesses of a round, suggest a score (1-5) per guess for the drawer to review.
// Follows the same Gemini call pattern as models/wieBenIk/llmJudge.js.
const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../../logger');

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

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 200
      }
    };

    const answer = await new Promise((resolve, reject) => {
      const modelId = 'gemini-3.1-flash-lite';
      const url = new URL(`https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`);
      const options = {
        hostname: url.hostname,
        path: url.pathname + url.search,
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => { data += chunk; });
        res.on('end', () => {
          try {
            const response = JSON.parse(data);
            if (response.error) {
              return reject(new Error(response.error.message || 'Gemini API error'));
            }
            const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
            resolve(text ? text.trim() : null);
          } catch (err) {
            reject(err);
          }
        });
      });
      req.on('timeout', () => {
        req.destroy(new Error('Gemini request timed out'));
      });
      req.on('error', reject);
      req.write(JSON.stringify(requestBody));
      req.end();
    });

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
