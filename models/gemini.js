//models/gemini.js
// One place for the Gemini text calls used by the Mastermind hints, the
// Wie ben ik guess judge and the Pictionary grade suggester.
const logger = require('../logger');

const MODEL_ID = 'gemini-3.1-flash-lite';

function isGeminiAvailable() {
  return !!process.env.GEMINI_API_KEY;
}

// Sends one prompt and returns the trimmed text answer, or null when the
// response has no text. Throws on a missing key, an API error or a timeout;
// callers decide whether that is fatal.
async function callGemini(prompt, { temperature = 0, maxOutputTokens = 200, timeout = 15000 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY not configured');
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL_ID}:generateContent?key=${apiKey}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { temperature, maxOutputTokens }
    }),
    signal: AbortSignal.timeout(timeout)
  });

  const response = await res.json();
  if (response.error) {
    logger.error('Gemini API error:', response.error.message);
    throw new Error(response.error.message || 'Gemini API error');
  }
  const text = response.candidates?.[0]?.content?.parts?.[0]?.text;
  return text ? text.trim() : null;
}

module.exports = {
  callGemini,
  isGeminiAvailable
};
