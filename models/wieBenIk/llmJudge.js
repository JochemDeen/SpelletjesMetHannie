//models/wieBenIk/llmJudge.js
// Gemini-backed judge for "Wie ben ik": given the player's real character,
// suggest to the voters whether a guess is correct, or how to answer a
// regular question.
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');
const { callGemini } = require('../gemini');

function loadPrompt(key) {
  const promptsPath = path.join(__dirname, '../../prompts/wie-ben-ik-judge.json');
  const data = fs.readFileSync(promptsPath, 'utf8');
  return JSON.parse(data)[key].prompt;
}

// Sends the filled-in prompt and returns the raw answer, or null when
// unavailable. Never throws: the game must continue without a suggestion
// if the LLM fails.
async function askJudge(key, characterName, characterDescription, replacements) {
  if (!process.env.GEMINI_API_KEY) {
    logger.info('Wie ben ik: GEMINI_API_KEY not configured, skipping LLM suggestion.');
    return null;
  }

  try {
    let prompt = loadPrompt(key)
      .replaceAll('{character}', characterName)
      .replaceAll('{description}', characterDescription || '');
    for (const [placeholder, value] of Object.entries(replacements)) {
      prompt = prompt.replaceAll(placeholder, value);
    }
    return await callGemini(prompt, { temperature: 0, maxOutputTokens: 10 });
  } catch (error) {
    logger.error(`Wie ben ik: LLM judge failed: ${error.message}`);
    return null;
  }
}

// Returns 'ja', 'nee', or null when unavailable/unclear.
async function judgeGuess(characterName, characterDescription, guessText) {
  logger.info(`Wie ben ik: judging guess "${guessText}" against character "${characterName}"`);
  const answer = await askJudge('judge_guess', characterName, characterDescription, { '{guess}': guessText });

  if (!answer) return null;
  const normalized = answer.toUpperCase();
  if (normalized.includes('JA')) return 'ja';
  if (normalized.includes('NEE')) return 'nee';
  logger.warn(`Wie ben ik: unexpected judge answer "${answer}"`);
  return null;
}

// Returns 'ja', 'nee', '??' (the LLM doesn't know either), or null when
// unavailable/unclear.
async function answerQuestion(characterName, characterDescription, questionText) {
  logger.info(`Wie ben ik: answering question "${questionText}" for character "${characterName}"`);
  const answer = await askJudge('answer_question', characterName, characterDescription, { '{question}': questionText });

  if (!answer) return null;
  const normalized = answer.toUpperCase();
  if (normalized.includes('WEET')) return '??';
  if (normalized.includes('JA')) return 'ja';
  if (normalized.includes('NEE')) return 'nee';
  logger.warn(`Wie ben ik: unexpected question answer "${answer}"`);
  return null;
}

module.exports = {
  judgeGuess,
  answerQuestion,
};
