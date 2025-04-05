//models/pictionary/drawingManager.js
const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const logger = require('../../logger');
const db = require('../db'); 


const DRAWING_TIMER_SECONDS = 60; // Duration in seconds

// Start the drawing phase by setting the drawing timer.
// The game’s "drawing_completed_at" field is set to the time when drawing should end.
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
function saveDrawingToFile(game_id, base64Data) {
    return new Promise((resolve, reject) => {
      // Remove header (data:image/png;base64,) if present
      const base64Image = base64Data.split(';base64,').pop();
      // Generate a filename using the game_id and current timestamp
      const fileName = `game_${game_id}_${Date.now()}.png`;
      const folderPath = path.join(__dirname, '../../public/images/drawings');
      const filePath = path.join(folderPath, fileName);
  
      // Ensure the drawings directory exists
      fs.mkdir(folderPath, { recursive: true }, (err) => {
        if (err) {
          logger.error('Failed to create drawings directory:', err.message);
          return reject(err);
        }
        // Write the file
        fs.writeFile(filePath, base64Image, { encoding: 'base64' }, (err) => {
          if (err) {
            logger.error('Failed to save drawing file:', err.message);
            return reject(err);
          }
          // Return the file path relative to public so that it can be served
          const relativePath = `/images/drawings/${fileName}`;
          resolve(relativePath);
        });
      });
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
          const filePath = await saveDrawingToFile(game_id, base64Data);
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
    module.exports = {
    startDrawing,
    saveDrawing
  };