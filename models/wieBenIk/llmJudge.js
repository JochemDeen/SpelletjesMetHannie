//models/wieBenIk/llmJudge.js
// Gemini-backed judge for "Wie ben ik" guesses: given the player's real
// character and their guess, suggest whether the guess is correct.
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const { callGemini } = require('../gemini');

function loadPrompt() {
  const promptsPath = path.join(__dirname, '../../prompts/wie-ben-ik-judge.json');
  const data = fs.readFileSync(promptsPath, 'utf8');
  return JSON.parse(data).judge_guess.prompt;
}

// Returns 'ja', 'nee', or null when unavailable/unclear. Never throws:
// the game must continue without a suggestion if the LLM fails.
async function judgeGuess(characterName, characterDescription, guessText) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    logger.info('Wie ben ik: GEMINI_API_KEY not configured, skipping LLM suggestion.');
    return null;
  }

  try {
    let prompt = loadPrompt();
    prompt = prompt
      .replaceAll('{character}', characterName)
      .replaceAll('{description}', characterDescription || '')
      .replaceAll('{guess}', guessText);

    logger.info(`Wie ben ik: judging guess "${guessText}" against character "${characterName}"`);

    const answer = await callGemini(prompt, { temperature: 0, maxOutputTokens: 10 });

    if (!answer) return null;
    const normalized = answer.toUpperCase();
    if (normalized.includes('JA')) return 'ja';
    if (normalized.includes('NEE')) return 'nee';
    logger.warn(`Wie ben ik: unexpected judge answer "${answer}"`);
    return null;
  } catch (error) {
    logger.error(`Wie ben ik: LLM judge failed: ${error.message}`);
    return null;
  }
}

module.exports = {
  judgeGuess,
};
