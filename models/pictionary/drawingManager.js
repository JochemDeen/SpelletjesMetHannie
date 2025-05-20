//models/pictionary/drawingManager.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../../logger');
const db = require('../db'); 


const DRAWING_TIMER_SECONDS = 60; // Duration in seconds

// Start the drawing phase by setting the drawing timer.
// The game's "drawing_completed_at" field is set to the time when drawing should end.
async function startDrawing(game_id) {
    if (!game_id) {
      throw new Error('Game ID is required.');
    }
    
    return new Promise((resolve, reject) => {
        const fetchCountdownSql = `SELECT countdown_seconds FROM games WHERE game_id = ?`;
        db.get(fetchCountdownSql, [game_id], (err, row) => {
            if (err) {
                logger.error('Failed to fetch countdown time:', err.message);
                return reject(new Error('Failed to fetch countdown time.'));
            }
            
            const DRAWING_TIMER_SECONDS = row ? row.countdown_seconds : 60; // Default to 60 if not found
            const startTime = new Date();
            const endTime = new Date(startTime.getTime() + DRAWING_TIMER_SECONDS * 1000);
            
            logger.info(`Drawing phase started for game ${game_id}. Drawing started at ${startTime}`);
            logger.info(`Drawing phase started for game ${game_id}. Drawing ends at ${endTime}`);
            
            const updateSql = `
                UPDATE games
                SET state = 'drawing', drawing_completed_at = ?
                WHERE game_id = ?
            `;
            
            db.run(updateSql, [endTime.toISOString(), game_id], function (updateErr) {
                if (updateErr) {
                    logger.error('Failed to update game state to drawing:', updateErr.message);
                    return reject(new Error('Failed to start drawing.'));
                }
                resolve(DRAWING_TIMER_SECONDS);
            });
        });
    });
}  

// Helper: Save base64 drawing data as a PNG file.
// Returns the file path (relative to your public folder) if successful.
function saveDrawingToFile(drawingData, gameId, existingPath = null) {
    return new Promise((resolve, reject) => {
        try {
            // Create drawings directory if it doesn't exist
            const drawingsDir = path.join(__dirname, '../../public/images/drawings');
            if (!fs.existsSync(drawingsDir)) {
                fs.mkdirSync(drawingsDir, { recursive: true });
            }

            let filename;
            if (existingPath) {
                // If we have an existing path, use that filename
                filename = path.basename(existingPath);
            } else {
                // For new drawings, use the original naming convention
                const timestamp = new Date().getTime();
                filename = `game_${gameId}_${timestamp}.png`;
            }
            
            const filePath = path.join(drawingsDir, filename);

            // Remove the data URL prefix to get just the base64 data
            const base64Data = drawingData.replace(/^data:image\/png;base64,/, '');

            // Write the file
            fs.writeFile(filePath, base64Data, 'base64', (err) => {
                if (err) {
                    logger.error('Error saving drawing to file:', err);
                    return reject(err);
                }
                logger.info(`Drawing saved to ${filePath}`);
                resolve(`/images/drawings/${filename}`);
            });
        } catch (error) {
            logger.error('Error in saveDrawingToFile:', error);
            reject(error);
        }
    });
}

// Save the submitted drawing after checking that the submission time is within limits.
async function saveDrawing(game_id, base64Data) {
    if (!game_id || !base64Data) {
      throw new Error('Game ID and drawing data are required.');
    }
  
    // First, check if we're still within the allowed submission time.
    return new Promise((resolve, reject) => {
      const sql = `SELECT drawing_completed_at FROM games WHERE game_id = ?`;
      db.get(sql, [game_id], async (err, row) => {
        if (err) {
          logger.error('Failed to fetch game completion time:', err.message);
          return reject(new Error('Failed to fetch game data.'));
        }
        if (!row) {
          return reject(new Error('Game not found.'));
        }
        logger.info(`Game ${game_id} completed at ${row.drawing_completed_at}`);
        logger.info(`Current time is ${new Date()}`);
  
        const endTime = new Date(row.drawing_completed_at);
        const gracePeriod = 5 * 1000; // 5 seconds grace period
        const currentTime = new Date();
        if (currentTime > new Date(endTime.getTime() + gracePeriod)) {
          return reject(new Error('Drawing submission time expired.'));
        }
  
        // Save the drawing to a file
        try {
          const filePath = await saveDrawingToFile(base64Data, game_id);
          logger.info(`Drawing file saved at ${filePath} for game ${game_id}`);
          // Update the game record with the file path and change state to guessing.
          const updateSql = `
            UPDATE games
            SET image_path = ?, state = 'guessing'
            WHERE game_id = ?
          `;
          db.run(updateSql, [filePath, game_id], function (updateErr) {
            if (updateErr) {
              logger.error('Failed to update game with drawing file:', updateErr.message);
              return reject(new Error('Failed to save drawing.'));
            }
            resolve(filePath);
          });
        } catch (fileError) {
          return reject(fileError);
        }
      });
    });
}

async function saveModifiedDrawing(gameId, drawingData) {
    return new Promise((resolve, reject) => {
        try {
            // Get the current game state
            db.get('SELECT * FROM games WHERE game_id = ?', [gameId], async (err, game) => {
                if (err) {
                    logger.error('Error getting game state:', err);
                    return reject(err);
                }

                if (!game) {
                    return reject(new Error('Game not found'));
                }

                // Create backup of current drawing with round number
                const currentPath = path.join(__dirname, '../../public', game.image_path);
                const backupPath = currentPath.replace('.png', `_round${game.current_round}.png`);
                
                try {
                    // Use fs.promises.copyFile for proper async/await support
                    const fsPromises = require('fs').promises;
                    await fsPromises.copyFile(currentPath, backupPath);
                    logger.info(`Created backup at ${backupPath}`);
                } catch (copyErr) {
                    logger.error('Error creating backup:', copyErr);
                }

                // Save the new drawing with the same filename
                const imagePath = await saveDrawingToFile(drawingData, gameId, game.image_path);

                // Record the modification action
                db.run(
                    'INSERT INTO actions (game_id, user_id, action, round_number, content) VALUES (?, ?, ?, ?, ?)',
                    [gameId, game.drawer_user_id, 'modify_drawing', game.current_round, 'Drawing modified'],
                    (err) => {
                        if (err) {
                            logger.error('Error recording modification:', err);
                            return reject(err);
                        }

                        // Update the game record with new image path
                        db.run(
                            'UPDATE games SET image_path = ? WHERE game_id = ?',
                            [imagePath, gameId],
                            (err) => {
                                if (err) {
                                    logger.error('Error updating game record:', err);
                                    return reject(err);
                                }
                                resolve(imagePath);
                            }
                        );
                    }
                );
            });
        } catch (error) {
            logger.error('Error saving modified drawing:', error);
            reject(error);
        }
    });
}

async function hasModifiedDrawing(gameId, roundNumber) {
    return new Promise((resolve, reject) => {
        const sql = `
          SELECT COUNT(*) AS cnt
          FROM actions
          WHERE game_id     = ?
            AND round_number = ?
            AND action       = 'modify_drawing'
        `;
        db.get(sql, [gameId, roundNumber], (err, row) => {
          if (err) {
            logger.error('Error checking if drawing was modified:', err);
            return reject(err);
          }
    
          // If no row, count is zero
          const count = row && Number(row.cnt) ? Number(row.cnt) : 0;
          logger.info(`modify_drawing count: ${count} for game ${gameId}, round ${roundNumber}`);
          resolve(count > 0);
        });
      });
}

module.exports = {
    startDrawing,
    saveDrawing,
    saveModifiedDrawing,
    hasModifiedDrawing,
    saveDrawingToFile
};