//models/pictionary/notifications.js
// Push messages for the moments a Pictionary player has to do something, and
// the result at the end. The player whose request caused the change (actorId)
// is looking at the game already and is left out. One tag per game, so a new
// message replaces the previous one instead of piling up.
const push = require('../push');
const Users = require('../user');
const logger = require('../../logger');

function parseGuessers(game) {
  try {
    const guessers = JSON.parse(game.guessers || '[]');
    return Array.isArray(guessers) ? guessers : [];
  } catch (error) {
    return [];
  }
}

function without(userIds, actorId) {
  return userIds.filter(id => id !== actorId);
}

function message(game, body, title = 'Pictionary', url = '/pictionary') {
  return { title, body, url, tag: `pictionary-${game.game_id}` };
}

// New game: the drawer chooses a word
function notifyNewGame(game, actorId) {
  push.notify(without([game.drawer_user_id], actorId), 'pictionary',
    message(game, 'Jij mag tekenen! Kies een moeilijkheid.'));
}

// The drawing is in (round 1) or a new round starts: the guessers guess
function notifyGuessers(game, round, actorId) {
  const name = game.drawer_name || 'De tekenaar';
  const body = round > 1
    ? `Ronde ${round}: raad nog een keer wat ${name} heeft getekend.`
    : `${name} heeft een tekening gemaakt. Wat is het?`;
  push.notify(without(parseGuessers(game), actorId), 'pictionary', message(game, body));
}

// Everyone guessed: the drawer grades
function notifyDrawerToGrade(game, actorId) {
  push.notify(without([game.drawer_user_id], actorId), 'pictionary',
    message(game, 'Iedereen heeft geraden. Geef je cijfers!'));
}

// Game over: who guessed the word
async function notifyResult(game, guesses, actorId) {
  try {
    const correct = guesses.filter(g => g.round_number === game.current_round && g.feedback === 5);
    const names = await Promise.all(correct.map(g => Users.getUsernameById(g.user_id)));
    const who = names.length > 0 ? `${names.join(' en ')} had het goed.` : 'Niemand heeft het geraden.';
    const players = [game.drawer_user_id, ...parseGuessers(game)];
    push.notify(without(players, actorId), 'results',
      message(game, `Het woord was "${game.word}". ${who}`, 'Pictionary is afgelopen', '/pictionary/scoreboard'));
  } catch (error) {
    logger.error(`Pictionary: result notification for game ${game.game_id} failed:`, error);
  }
}

module.exports = {
  notifyNewGame,
  notifyGuessers,
  notifyDrawerToGrade,
  notifyResult
};
