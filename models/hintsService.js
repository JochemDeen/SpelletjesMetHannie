// models/hintsService.js
const sqlite3 = require('sqlite3').verbose();
const logger = require('../logger');
const fs = require('fs');
const path = require('path');

const db = new sqlite3.Database('database.sqlite');

const MONTHLY_HINT_LIMIT = 3;

/**
 * Load prompts from JSON file
 */
function loadPrompts() {
    const promptsPath = path.join(__dirname, '../prompts/mastermind-hints.json');
    try {
        const data = fs.readFileSync(promptsPath, 'utf8');
        return JSON.parse(data);
    } catch (err) {
        logger.error('Error loading prompts:', err);
        throw new Error('Failed to load prompts');
    }
}

/**
 * Get the number of hints used by a user this month
 */
async function getMonthlyHintCount(userId) {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT COUNT(*) as count FROM mastermind_hints
             WHERE user_id = ? AND strftime('%Y-%m', used_at) = ?`,
            [userId, currentMonth],
            (err, row) => {
                if (err) {
                    logger.error('Error getting monthly hint count:', err);
                    return reject(err);
                }
                resolve(row?.count || 0);
            }
        );
    });
}

/**
 * Get hint for today if already requested
 */
async function getHintForToday(userId, wordOfTheDay) {
    return new Promise((resolve, reject) => {
        db.get(
            `SELECT hint_response FROM mastermind_hints
             WHERE user_id = ? AND word_of_the_day = ?`,
            [userId, wordOfTheDay],
            (err, row) => {
                if (err) {
                    logger.error('Error getting hint for today:', err);
                    return reject(err);
                }
                resolve(row?.hint_response || null);
            }
        );
    });
}

/**
 * Save a new hint to the database
 */
async function saveHint(userId, wordOfTheDay, hintResponse) {
    return new Promise((resolve, reject) => {
        db.run(
            `INSERT INTO mastermind_hints (user_id, word_of_the_day, hint_response, used_at)
             VALUES (?, ?, ?, ?)`,
            [userId, wordOfTheDay, hintResponse, new Date().toISOString()],
            (err) => {
                if (err) {
                    logger.error('Error saving hint:', err);
                    return reject(err);
                }
                logger.info(`Saved hint for user ${userId}`);
                resolve();
            }
        );
    });
}

/**
 * Analyze game state to extract:
 * - correctPositions: array of booleans for each position that has been correct
 * - correctCount: number of positions correctly guessed
 * - knownLetters: set of letters known to be in the word (correct or misplaced)
 * - misplacedInfo: letters known to be in word but position not yet found
 */
function analyzeGameState(wordOfTheDay, guesses, feedback) {
    const correctPositions = [false, false, false, false, false];
    const knownLetters = new Set();
    const correctLettersAtPosition = {}; // position -> letter (for letters correctly placed)

    if (!guesses || !feedback || guesses.length === 0) {
        return {
            correctPositions,
            correctCount: 0,
            knownLetters,
            knownCount: 0,
            misplacedLetters: []
        };
    }

    // Analyze all guesses
    for (let g = 0; g < guesses.length; g++) {
        const guess = guesses[g].toLowerCase();
        const fb = feedback[g];

        for (let i = 0; i < 5; i++) {
            if (fb[i] === 'correct') {
                correctPositions[i] = true;
                knownLetters.add(guess[i]);
                correctLettersAtPosition[i] = guess[i];
            } else if (fb[i] === 'misplaced') {
                knownLetters.add(guess[i]);
            }
        }
    }

    const correctCount = correctPositions.filter(p => p).length;

    // Find misplaced letters: letters we know are in the word but haven't placed correctly yet
    const misplacedLetters = [];
    for (const letter of knownLetters) {
        // Check if this letter is at its correct position
        const letterInWord = wordOfTheDay.toLowerCase();
        for (let i = 0; i < 5; i++) {
            if (letterInWord[i] === letter && !correctPositions[i]) {
                // This letter belongs at position i, but user hasn't found it yet
                misplacedLetters.push({ letter: letter.toUpperCase(), position: i + 1 });
                break; // Only add once per letter
            }
        }
    }

    return {
        correctPositions,
        correctCount,
        knownLetters,
        knownCount: knownLetters.size,
        misplacedLetters
    };
}

/**
 * Get a random unknown letter from the word (letter user doesn't know yet)
 */
function getRandomUnknownLetter(wordOfTheDay, knownLetters) {
    const word = wordOfTheDay.toLowerCase();
    const unknownLetters = [];

    for (let i = 0; i < 5; i++) {
        if (!knownLetters.has(word[i])) {
            unknownLetters.push({ letter: word[i].toUpperCase(), position: i + 1 });
        }
    }

    if (unknownLetters.length === 0) return null;
    return unknownLetters[Math.floor(Math.random() * unknownLetters.length)];
}

/**
 * Get a random letter at an unknown position
 */
function getRandomUnknownPositionLetter(wordOfTheDay, correctPositions) {
    const word = wordOfTheDay.toLowerCase();
    const candidates = [];

    for (let i = 0; i < 5; i++) {
        if (!correctPositions[i]) {
            candidates.push({ letter: word[i].toUpperCase(), position: i + 1 });
        }
    }

    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
}

/**
 * Determine which tier/prompt to use based on game analysis
 *
 * Tier 1 (word_association): 4+ correct OR 5 guesses → geef woord, vraag associatie
 * Tier 2 (suggest_position): 4-5 letters bekend maar niet allemaal correct, niet laatste beurt → suggereer positie
 * Tier 3 (letter_with_position): midden spel → geef onbekende letter met positie
 * Tier 4 (letter_only): vroeg spel → geef alleen een letter
 */
function determineHintTier(guessCount, analysis) {
    const { correctCount, knownCount, misplacedLetters } = analysis;

    // Tier 1: Almost done or last guess
    if (correctCount >= 4 || guessCount >= 5 || (correctCount >= 3 && misplacedLetters.length > 0)) {
        return 'tier1_word_association';
    }

    // Tier 2: Many letters known but not all in place (and has misplaced letters to hint about)
    if (knownCount >= 4 && correctCount < 4 && guessCount < 5 && misplacedLetters.length > 0) {
        return 'tier2_suggest_position';
    }

    // Tier 3: Mid-game (3-4 guesses)
    if (guessCount >= 3) {
        return 'tier3_letter_with_position';
    }

    // Tier 4: Early game (1-2 guesses)
    return 'tier4_letter_only';
}

/**
 * Format game state for the prompt (human readable)
 */
function formatGameState(guesses, feedback) {
    if (!guesses || guesses.length === 0) {
        return '(geen pogingen)';
    }

    let result = '';
    for (let i = 0; i < guesses.length; i++) {
        const guess = guesses[i].toUpperCase();
        const fb = feedback[i];
        result += `${i + 1}. ${guess} → `;
        const feedbackParts = [];
        for (let j = 0; j < 5; j++) {
            if (fb[j] === 'correct') {
                feedbackParts.push(`${guess[j]}=groen`);
            } else if (fb[j] === 'misplaced') {
                feedbackParts.push(`${guess[j]}=geel`);
            } else {
                feedbackParts.push(`${guess[j]}=grijs`);
            }
        }
        result += feedbackParts.join(', ');
        if (i < guesses.length - 1) result += '\n';
    }
    return result;
}

/**
 * Build the final prompt by filling in placeholders
 */
function buildPrompt(tier, promptTemplate, wordOfTheDay, analysis, guesses, feedback) {
    let prompt = promptTemplate;

    // Always fill in game state
    const gameState = formatGameState(guesses, feedback);
    prompt = prompt.replace('{gameState}', gameState);

    if (tier === 'tier1_word_association') {
        prompt = prompt.replaceAll('{word}', wordOfTheDay.toUpperCase());
    }
    else if (tier === 'tier2_suggest_position') {
        // Pick a random misplaced letter to hint about
        const hint = analysis.misplacedLetters[Math.floor(Math.random() * analysis.misplacedLetters.length)];
        prompt = prompt.replaceAll('{letter}', hint.letter);
        prompt = prompt.replaceAll('{position}', hint.position.toString());
    }
    else if (tier === 'tier3_letter_with_position') {
        // Give a letter at a position user hasn't found yet
        const hint = getRandomUnknownPositionLetter(wordOfTheDay, analysis.correctPositions);
        if (hint) {
            prompt = prompt.replaceAll('{letter}', hint.letter);
            prompt = prompt.replaceAll('{position}', hint.position.toString());
        }
    }
    else if (tier === 'tier4_letter_only') {
        // Give a letter the user doesn't know yet
        const hint = getRandomUnknownLetter(wordOfTheDay, analysis.knownLetters);
        if (hint) {
            prompt = prompt.replaceAll('{letter}', hint.letter);
        }
    }

    return prompt;
}

/**
 * Call Gemini API to get a hint
 */
async function callGeminiAPI(wordOfTheDay, guesses, feedback) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        logger.error('GEMINI_API_KEY not configured');
        throw new Error('Hint service not configured');
    }

    // Analyze game state
    const analysis = analyzeGameState(wordOfTheDay, guesses, feedback);
    const guessCount = guesses ? guesses.length : 0;

    // Determine tier
    const tier = determineHintTier(guessCount, analysis);

    logger.info(`Hint tier: ${tier} (guesses: ${guessCount}, correct: ${analysis.correctCount}, known: ${analysis.knownCount})`);

    // Load prompts and build final prompt
    const prompts = loadPrompts();
    const promptTemplate = prompts[tier].prompt;
    const prompt = buildPrompt(tier, promptTemplate, wordOfTheDay, analysis, guesses, feedback);

    logger.info(`Prompt: ${prompt}`);

    const requestBody = {
        contents: [{
            parts: [{
                text: prompt
            }]
        }],
        generationConfig: {
            temperature: 0.9,
            maxOutputTokens: 200
        }
    };

    const https = require('https');

    return new Promise((resolve, reject) => {
        const modelId = "gemini-2.5-flash-lite";
        const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${apiKey}`;

        const urlObj = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path: urlObj.pathname + urlObj.search,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        };

        const req = https.request(options, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                try {
                    const response = JSON.parse(data);

                    if (response.error) {
                        logger.error('Gemini API error:', response.error);
                        return reject(new Error(response.error.message || 'Gemini API error'));
                    }

                    const hint = response.candidates?.[0]?.content?.parts?.[0]?.text;

                    if (!hint) {
                        logger.error('No hint in Gemini response:', response);
                        return reject(new Error('Failed to generate hint'));
                    }

                    logger.info('Successfully generated hint from Gemini');
                    logger.info(hint);
                    resolve(hint.trim());
                } catch (err) {
                    logger.error('Error parsing Gemini response:', err);
                    reject(new Error('Failed to parse hint response'));
                }
            });
        });

        req.on('error', (err) => {
            logger.error('Gemini API request error:', err);
            reject(new Error('Failed to connect to hint service'));
        });

        req.write(JSON.stringify(requestBody));
        req.end();
    });
}

/**
 * Check if hints feature is available (API key configured)
 */
function isHintServiceAvailable() {
    return !!process.env.GEMINI_API_KEY;
}

module.exports = {
    getMonthlyHintCount,
    getHintForToday,
    saveHint,
    callGeminiAPI,
    isHintServiceAvailable,
    MONTHLY_HINT_LIMIT
};
