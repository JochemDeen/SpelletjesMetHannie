//models/wieBenIk/llmJudge.js
// Gemini-backed judge for "Wie ben ik" guesses: given the player's real
// character and their guess, suggest whether the guess is correct.
// Follows the same Gemini call pattern as models/hintsService.js.
const fs = require('fs');
const path = require('path');
const https = require('https');
const logger = require('../../logger');

function loadPrompt() {
  const promptsPath = path.join(__dirname, '../../prompts/wie-ben-ik-judge.json');
  const data = fs.readFileSync(promptsPath, 'utf8');
  return JSON.parse(data).judge_guess.prompt;
}

function isJudgeAvailable() {
  return !!process.env.GEMINI_API_KEY;
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

    const requestBody = {
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0,
        maxOutputTokens: 10
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
  isJudgeAvailable
};
