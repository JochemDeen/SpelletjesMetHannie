// scripts/updateScores.js
const db = require('../models/db');                   // however you get your DB handle
const { updateScoring } = require('../models/pictionary/scoringManager');

async function main() {
  // 1) find all completed games with no scores yet
  const games = await new Promise((res, rej) => {
    db.all(
      `SELECT id FROM games
       WHERE status = 'completed'
         AND id NOT IN (SELECT DISTINCT game_id FROM scores);`,
      (err, rows) => err ? rej(err) : res(rows)
    );
  });

  if (!games.length) {
    console.log('✅ No un-scored completed games found.');
    return process.exit(0);
  }

  // 2) run updateScoring for each
  for (const { id } of games) {
    try {
      await updateScoring(id);
      console.log(`→ Scored game ${id}`);
    } catch (err) {
      console.error(`‼️ Failed scoring game ${id}:`, err);
    }
  }

  console.log('✅ All done.');
  process.exit(0);
}

main();