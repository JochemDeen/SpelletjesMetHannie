// models/mastermind/resultsManager.js
// Guesses, per-day results, personal statistics and the monthly scoreboard.
// A "day" is the Dutch game_date of a guess (see dates.js).
const logger = require('../../logger');
const db = require('../db');
const { todayNL, monthNL, addDays, previousMonth } = require('./dates');

const MAX_GUESSES = 6;
const LATE_PENALTY = 1; // points less for a day caught up the day after
const SEPARATOR = '|~|';

function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function isSolved(feedback) {
  return Array.isArray(feedback) && feedback.length > 0 && feedback.every(entry => entry === 'correct');
}

// Points for one day: fewer guesses is more points, nothing when not solved,
// and LATE_PENALTY less for a day that was caught up (finished the day after)
function calculateScore(guesses, success, late = false) {
  if (!success) return 0;
  const count = Array.isArray(guesses) ? guesses.length : guesses;
  const points = { 1: 8, 2: 6, 3: 4, 4: 3, 5: 2, 6: 1 }[count] || 0;
  return Math.max(0, points - (late ? LATE_PENALTY : 0));
}

async function updateUserGuess(user_id, guess, feedback, wordOfTheDay, gameDate = todayNL()) {
  const late = gameDate < todayNL() ? 1 : 0;
  await new Promise((resolve, reject) => {
    db.run(
      'INSERT INTO mastermind_results (user_id, guess, feedback, wordOfTheDay, timestamp, game_date, late) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [user_id, guess, JSON.stringify(feedback), wordOfTheDay, new Date().toISOString(), gameDate, late],
      (err) => (err ? reject(err) : resolve())
    );
  });
  logger.info(`Saved Woordle guess for user ${user_id} (${gameDate}${late ? ', caught up' : ''})`);
}

// A player's game for one day, or null when they haven't guessed yet
async function getUserGameState(user_id, date = todayNL()) {
  const rows = await all(
    'SELECT guess, feedback, late FROM mastermind_results WHERE user_id = ? AND game_date = ? ORDER BY id',
    [user_id, date]
  );
  if (!rows.length) return null;
  const guesses = rows.map(row => row.guess);
  const feedback = rows.map(row => JSON.parse(row.feedback));
  const success = feedback.some(isSolved);
  const finished = success || guesses.length >= MAX_GUESSES;
  const late = rows.some(row => row.late);
  return { guesses, feedback, success, currentRow: rows.length, finished, late };
}

// Yesterday's word can still be played (for LATE_PENALTY points less) by
// anyone who didn't finish it on the day itself. Returns yesterday's date
// while that's possible for this player, otherwise null.
async function getCatchUpDate(user_id) {
  const yesterday = addDays(todayNL(), -1);
  const state = await getUserGameState(user_id, yesterday);
  return state && state.finished ? null : yesterday;
}

// Whether the player played Woordle at all in the week before yesterday. Only
// then does the home screen remind them of a missed day, so people who don't
// play Woordle aren't asked about it every day.
async function playedWeekBefore(user_id) {
  const yesterday = addDays(todayNL(), -1);
  const rows = await all(
    'SELECT 1 FROM mastermind_results WHERE user_id = ? AND game_date >= ? AND game_date < ? LIMIT 1',
    [user_id, addDays(yesterday, -7), yesterday]
  );
  return rows.length > 0;
}

// One entry per player per day: { user_id, username, date, guesses, feedback,
// success, finished, late, solveTime, score }. where/params filter the rows.
async function getDailyResults(where = '1 = 1', params = []) {
  const rows = await all(`
    SELECT r.user_id, u.username, r.game_date AS date, MAX(r.late) AS late,
           GROUP_CONCAT(r.guess, '${SEPARATOR}') AS guesses,
           GROUP_CONCAT(r.feedback, '${SEPARATOR}') AS feedbacks,
           GROUP_CONCAT(r.timestamp, '${SEPARATOR}') AS timestamps
    FROM (SELECT * FROM mastermind_results ORDER BY id) AS r
    JOIN users AS u ON r.user_id = u.id
    WHERE ${where}
    GROUP BY r.user_id, r.game_date
    ORDER BY r.game_date
  `, params);

  return rows.map(row => {
    const guesses = row.guesses.split(SEPARATOR);
    const feedback = row.feedbacks.split(SEPARATOR).map(text => {
      try {
        return JSON.parse(text);
      } catch (e) {
        logger.error('Failed to parse Woordle feedback:', text);
        return [];
      }
    });
    const timestamps = row.timestamps.split(SEPARATOR);
    const solvedAt = feedback.findIndex(isSolved);
    const success = solvedAt !== -1;
    return {
      user_id: Number(row.user_id),
      username: row.username,
      date: row.date,
      guesses,
      feedback,
      success,
      finished: success || guesses.length >= MAX_GUESSES,
      late: row.late === 1,
      solveTime: success ? timestamps[solvedAt] : null,
      lastTime: timestamps[timestamps.length - 1],
      score: calculateScore(guesses, success, row.late === 1)
    };
  });
}

// Everyone's finished games of one day; only for players who finished it themselves
async function getAllResults(user_id, date = todayNL()) {
  const ownGame = await getUserGameState(user_id, date);
  if (!ownGame || !ownGame.finished) {
    return [];
  }
  const results = await getDailyResults('r.game_date = ?', [date]);
  return results
    .filter(result => result.finished)
    .map(({ username, guesses, feedback, success, late, solveTime, score }) => ({ username, guesses, feedback, success, late, solveTime, score }));
}

// Personal statistics. Today's game only counts once it is finished.
async function getUserStats(user_id) {
  const today = todayNL();
  const days = (await getDailyResults('r.user_id = ?', [user_id]))
    .filter(day => day.finished || day.date !== today);

  const currentMonth = monthNL();
  const wins = days.filter(day => day.success);
  const guessDistribution = Array(MAX_GUESSES + 1).fill(0); // index 1-6, 0 unused
  wins.forEach(day => {
    guessDistribution[Math.min(day.guesses.length, MAX_GUESSES)]++;
  });

  // Streaks: consecutive days won
  let maxStreak = 0;
  let streak = 0;
  let previousWin = null;
  days.forEach(day => {
    if (day.success) {
      streak = previousWin && addDays(previousWin, 1) === day.date ? streak + 1 : 1;
      previousWin = day.date;
      maxStreak = Math.max(maxStreak, streak);
    } else {
      streak = 0;
      previousWin = null;
    }
  });
  // The streak is still alive only if the last win was today or yesterday
  const currentStreak = previousWin && previousWin >= addDays(today, -1) ? streak : 0;

  const winCounts = wins.map(day => day.guesses.length).sort((a, b) => a - b);
  const mid = Math.floor(winCounts.length / 2);
  const medianGuess = winCounts.length === 0
    ? null
    : winCounts.length % 2 ? winCounts[mid] : (winCounts[mid - 1] + winCounts[mid]) / 2;

  const lastDay = days[days.length - 1];
  const totalGames = days.length;

  return {
    totalGames,
    percentCorrect: totalGames ? ((wins.length / totalGames) * 100).toFixed(2) : 0,
    currentStreak,
    maxStreak,
    guessDistribution,
    averageGuess: winCounts.length ? (winCounts.reduce((a, b) => a + b, 0) / winCounts.length).toFixed(1) : null,
    medianGuess,
    latestGuessTime: lastDay ? lastDay.lastTime : null,
    latestGuessIndex: lastDay && lastDay.success ? lastDay.guesses.length : null,
    totalScore: days.reduce((sum, day) => sum + day.score, 0),
    monthlyScore: days.filter(day => day.date.startsWith(currentMonth)).reduce((sum, day) => sum + day.score, 0)
  };
}

// Sum daily scores into { month: [{ username, score }] }
function aggregateMonthlyScores(dailyResults) {
  const totals = new Map(); // `${month}|${username}` -> entry
  dailyResults.forEach(day => {
    const month = day.date.slice(0, 7);
    const key = `${month}|${day.username}`;
    if (!totals.has(key)) totals.set(key, { username: day.username, month, score: 0 });
    totals.get(key).score += day.score;
  });
  const byMonth = {};
  totals.forEach(entry => {
    (byMonth[entry.month] = byMonth[entry.month] || []).push(entry);
  });
  return byMonth;
}

// Winner(s) of a month: everyone tied on the top score. Nobody wins a month
// in which nobody scored a point.
function winnersOf(entries) {
  const best = Math.max(0, ...entries.map(entry => entry.score));
  if (best === 0) return { score: 0, usernames: [] };
  return { score: best, usernames: entries.filter(entry => entry.score === best).map(entry => entry.username) };
}

async function getMonthlyScores(month = monthNL()) {
  const results = await getDailyResults("r.game_date LIKE ? || '-%'", [month]);
  const scores = aggregateMonthlyScores(results)[month] || [];
  logger.info(`Retrieved monthly scores for ${scores.length} users for month ${month}.`);
  return scores;
}

// How many finished months each player won (ties count for everyone tied)
async function getHighestScorerCounts() {
  const byMonth = aggregateMonthlyScores(await getDailyResults());
  const currentMonth = monthNL();
  const counts = {};
  Object.entries(byMonth).forEach(([month, entries]) => {
    if (month >= currentMonth) return; // the current month isn't decided yet
    winnersOf(entries).usernames.forEach(username => {
      counts[username] = (counts[username] || 0) + 1;
    });
  });
  const users = await all('SELECT username FROM users');
  return users.map(({ username }) => ({ username, highestCount: counts[username] || 0 }));
}

async function getPreviousMonthWinner() {
  const month = previousMonth(monthNL());
  const scores = await getMonthlyScores(month);
  const { score, usernames } = winnersOf(scores);
  return { month, score, winners: usernames };
}

// The N highest monthly totals ever (across all players and months)
async function getTopMonthlyScores(limit = 3) {
  const byMonth = aggregateMonthlyScores(await getDailyResults());
  return Object.values(byMonth)
    .flat()
    .filter(entry => entry.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

async function getEarliestDate() {
  const rows = await all('SELECT MIN(game_date) AS earliestDate FROM mastermind_results');
  return rows[0]?.earliestDate || null;
}

module.exports = {
  MAX_GUESSES,
  LATE_PENALTY,
  updateUserGuess,
  getUserGameState,
  getCatchUpDate,
  playedWeekBefore,
  getDailyResults,
  getAllResults,
  getUserStats,
  aggregateMonthlyScores,
  getMonthlyScores,
  getHighestScorerCounts,
  getPreviousMonthWinner,
  getTopMonthlyScores,
  calculateScore,
  getEarliestDate
};
