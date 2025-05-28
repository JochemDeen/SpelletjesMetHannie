// scripts/updateScores.js
const db    = require('../models/db');
const { updateScoring } = require('../models/pictionary/scoringManager');

async function main() {
  // 1) find all completed games with no scores yet
  const games = await new Promise((res, rej) => {
    db.all(
      `SELECT game_id
         FROM games
        WHERE status   = 'completed'
          AND game_id NOT IN (
            SELECT DISTINCT game_id
              FROM scores
          );`,
      (err, rows) => err ? rej(err) : res(rows)
    );
  });

  if (!games.length) {
    console.log('✅ No un-scored completed games found.');
    return process.exit(0);
  }

  // 2) run updateScoring for each
  for (const { game_id } of games) {
    try {
      await updateScoring(game_id);
      console.log(`→ Scored game ${game_id}`);
    } catch (err) {
      console.error(`‼️ Failed scoring game ${game_id}:`, err);
    }
  }

  console.log('✅ All done.');
  process.exit(0);
}

main();