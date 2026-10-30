//models/wieBenIk/notifications.js
// Push messages for the moments a Wie ben ik player has to do something, and
// the winner at the end. The player whose request caused the change (actorId)
// is looking at the game already and is left out. One tag per game, so a new
// message replaces the previous one instead of piling up.
const push = require('../push');

const TITLE = 'Wie ben ik?';

function send(players, actorId, kind, body, { title = TITLE, url = '/wie-ben-ik', gameId } = {}) {
  const userIds = players.map(p => p.user_id).filter(id => id !== actorId);
  push.notify(userIds, kind, { title, body, url, tag: `wie-ben-ik-${gameId}` });
}

function notifyThemeVote(gameId, players, actorId) {
  send(players, actorId, 'wieBenIk', 'Er is een nieuw spel. Stem op een thema!', { gameId });
}

function notifyAskQuestion(gameId, round, themeName, players, actorId) {
  const body = round > 1
    ? `Ronde ${round}: stel je volgende vraag.`
    : `Het thema is ${themeName}. Stel je eerste vraag!`;
  send(players, actorId, 'wieBenIk', body, { gameId });
}

function notifyVote(gameId, round, players, actorId) {
  send(players, actorId, 'wieBenIk', `Ronde ${round}: beantwoord de vragen van de anderen.`, { gameId });
}

function notifyWinners(gameId, winnerIds, players, actorId) {
  const winners = players.filter(p => winnerIds.includes(p.user_id));
  const body = winners.map(p => `${p.username} was ${p.character_name}`).join(', ') + '!';
  const names = winners.map(p => p.username).join(' en ');
  send(players, actorId, 'results', body,
    { title: `${TITLE} ${names} ${winners.length > 1 ? 'hebben' : 'heeft'} gewonnen`, url: '/wie-ben-ik/scoreboard', gameId });
}

module.exports = {
  notifyThemeVote,
  notifyAskQuestion,
  notifyVote,
  notifyWinners
};
