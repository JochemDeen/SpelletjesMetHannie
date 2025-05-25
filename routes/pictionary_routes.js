// routes/pictionary_routes.js
const express = require('express');
const router = express.Router();
const path = require('path');
const { requireLogin } = require('../middleware/authMiddleware');
const logger = require('../logger');
const Users = require('../models/user');

const wordsService = require('../models/wordsService');
const Pictionary = require('../models/pictionary');
const { log } = require('console');
const { stat } = require('fs');


// Pictionary Game Page
router.get('/pictionary', requireLogin, (req, res) => {
    logger.info(`GET /pictionary for user: ${req.session.userId}`);
    res.sendFile('pictionary.html', { root: path.join(__dirname, '../public/pictionary') });
  });

// Scoreboard Page
router.get('/pictionary/scoreboard', requireLogin, (req, res) => {
    logger.info(`GET /pictionary/scoreboard for user: ${req.session.userId}`);
    res.sendFile('pictionary-scoreboard.html', { root: path.join(__dirname, '../public/pictionary') });
  });

// past games Page
router.get('/pictionary/past-games', requireLogin, (req, res) => {
    logger.info(`GET /pictionary/past-games for user: ${req.session.userId}`);
    res.sendFile('pictionary-past-games.html', { root: path.join(__dirname, '../public/pictionary') });
  });

// ----------------------
// Last game page
// ----------------------
router.get('/api/pictionary/get-game', requireLogin, async (req, res) => {
  const { game_id } = req.query;
  if (!game_id) return res.status(400).json({ error: "Missing game_id parameter" });
  logger.info(`GET /api/pictionary/get-game for user: ${req.session.userId} with game_id: ${game_id}`);

  try {
      const gameData = await Pictionary.getGameById(game_id);
      if (!gameData) return res.status(404).json({ error: "Game not found" });

      const drawer = await Users.getUsernameById(gameData.drawer_user_id);
      let guesses = await Pictionary.getGuesses(game_id);

      // Add navigation logic
      const prevGame = await Pictionary.getPreviousGameId(game_id);
      const nextGame = await Pictionary.getNextGameId(game_id);

      guesses = await Promise.all(guesses.map(async guess => {
        logger.info(`Fetching username for user ${guess.user_id}`);
        const username = await Users.getUsernameById(guess.user_id);
        return { ...guess, username };
      }));
  
      logger.info(`Game data fetched for game ${game_id}`);
      res.json({
          game_id,
          date: gameData.created_at,
          word: gameData.word,
          difficulty: gameData.difficulty,
          drawer,
          imageSrc: gameData.image_path,
          guesses,
          prev_game_id: prevGame,
          next_game_id: nextGame
      });
  } catch (error) {
      console.error("Error fetching past game:", error);
      res.status(500).json({ error: "Failed to fetch past game" });
  }
});

// ----------------------
// Scores page
// ----------------------

// Get last game score
router.get('/api/pictionary/last-game-score', async (req, res) => {
  logger.info(`GET /api/pictionary/last-game-score for user: ${req.session.userId}`);
  try {
      const lastGameId = await Pictionary.getLatestGameId();
      logger.info(`Last game ID: ${lastGameId}`);
      //if lastGameId not null run 
      if (!lastGameId) {
          return res.json({ success: false, message: 'Geen score beschikbaar' });
      }

      const gameState = await Pictionary.getGameById(lastGameId);
      drawer_user_id = gameState.drawer_user_id;
      const drawer_username = await Users.getUsernameById(drawer_user_id);
      const word = gameState.word;
      const lastGameScore = await Pictionary.getGameScore(lastGameId);
      logger.info(`Last game score: ${JSON.stringify(lastGameScore)}`);
      if (lastGameScore) {
          res.json({ success: true, score: lastGameScore, word: word, drawer: drawer_username, game_id: lastGameId });
      } else {
          res.json({ success: false, message: 'Geen score beschikbaar' });
      }
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});

// Get monthly scores
router.get('/api/pictionary/monthly-scores', async (req, res) => {
  logger.info(`GET /api/pictionary/monthly-scores for user: ${req.session.userId}`);
  const currentMonth = new Date().toISOString().slice(0, 7);
  try {
      const scores = await Pictionary.getMonthlyScores(currentMonth);
      res.json({ success: true, scores });
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});

// Get last month's winner
router.get('/api/pictionary/previous-month-winner', async (req, res) => {
  logger.info(`GET /api/pictionary/previous-month-winner for user: ${req.session.userId}`);
  try {
      const winner = await Pictionary.getPreviousMonthWinner();
      if (winner) {
          res.json({ success: true, winner: winner.username, score: winner.score });
      } else {
          res.json({ success: false, message: 'Geen winnaar' });
      }
  } catch (error) {
      res.status(500).json({ success: false, error: error.message });
  }
});


// ----------------------
// Load Game State
// ----------------------
router.get('/api/pictionary/state', requireLogin, async (req, res) => {
  logger.info(`GET /api/pictionary/state for user: ${req.session.userId}`);
  try {
    let gameState = await Pictionary.getActiveGame();
    logger.info(`Active game found: ${JSON.stringify(gameState)}`);
    if (!gameState || gameState.state === 'scoring') {
      logger.info('No active game found.');
      if (gameState?.state === 'scoring') {
        logger.info('Last game was less than 24 hours ago. Returning "scoring" state.');
        return res.json({ game_id: gameState.game_id, state: 'scoring', status: 'completed' });
      }
      logger.info('Creating new game.');
      const activeUsers = await Users.getActivePictionaryUserIds();
      logger.info(`Active users: ${JSON.stringify(activeUsers)}`);
      if (!activeUsers || activeUsers.length === 0) {
        return res.status(400).json({ error: 'No active users found to create a game.' });
      }
      const newGameId = await Pictionary.createNewGame(activeUsers);
      logger.info(`New game created with id ${newGameId}. Fetching new game state.`);
      gameState = await Pictionary.getGameById(newGameId);
      if (!gameState) {
        logger.error(`Failed to fetch game state for new game ${newGameId}`);
        return res.status(500).json({ error: 'Failed to fetch game state after creation.' });
      }
    }
    const gameId = gameState.game_id;
    const currentUserId = req.session.userId;

    // Define "player users" as either being the drawer or one of the guessers.
    const isPlayer = (gameState.drawer_user_id === currentUserId) ||
      (gameState.guessers && gameState.guessers.includes(currentUserId));

    // If the user is not a participant in the game, return idle.
    if (!isPlayer) {
      logger.info(`User ${currentUserId} is not a participant. Returning idle state.`);
      return res.json({
        game_id: gameState.game_id,
        state: 'Off',
        status: gameState.status,
        difficulty: gameState.difficulty,
      });
    }


    //if game state is choose and current user is not the drawer, change state to "idle"
    if (gameState.state === 'choose' && gameState.drawer_user_id !== req.session.userId) {
      gameState.state = 'idle';
    }
    //if game state is "drawing" and current user is NOT the drawer, change state to "idle"
    if (gameState.state === 'drawing' && gameState.drawer_user_id !== req.session.userId) {
      gameState.state = 'idle';
    }
    
    //check End of Round
    if (gameState.state === 'guessing') {
      end_of_round = await Pictionary.checkForEndOfGuessing(gameId);
      logger.info(`End of Round: ${end_of_round}`);
    }

    // If game state is "guessing" and current user is NOT in the guessers list, change state to "guessing-watching"
    if (gameState.state === 'guessing' && !gameState.guessers.includes(req.session.userId)) {
      gameState.state = 'guessing-watching';
    }
    // If game state is "feedback" and current user is NOT the drawer, change state to "guessing-watching"
    if (gameState.state === 'feedback' && gameState.drawer_user_id !== req.session.userId) {
      gameState.state = 'guessing-watching';
    }
    const game_round = gameState.current_round;
    const last_round_for_user = await Pictionary.getRoundNumber(gameId, req.session.userId);

    // If game state is guessing and game_round==last_round_for_user, change state to "guessing-watching"
    if (gameState.state === 'guessing' && game_round === last_round_for_user) {
      gameState.state = 'guessing-watching';
    }
    const safeGameState = {
      game_id: gameState.game_id,
      state: gameState.state,
      status: gameState.status,
      difficulty: gameState.difficulty,
    };
    res.json(safeGameState);

  } catch (error) {
    logger.error('Error fetching game state:', error.stack || error);
    res.status(500).json({ error: 'Failed to fetch game state' });
  }
});

// ----------------------
// Get Max Score
// ----------------------

// Fetch max points for all difficulties
router.get('/api/pictionary/max-scores', requireLogin, async (req, res) => {
  try {
      logger.info('GET /api/pictionary/max-scores');
      const maxScores = {
          easy: await Pictionary.getMaxScore("easy"),
          medium: await Pictionary.getMaxScore("medium"),
          hard: await Pictionary.getMaxScore("hard")
      };
      logger.info(`Max scores fetched: ${JSON.stringify(maxScores)}`);
      res.json(maxScores);
  } catch (error) {
      logger.error("Error fetching max scores:", error.message);
      res.status(500).json({ error: "Failed to fetch max scores" });
  }
});

// ----------------------
// Set Difficulty
// ----------------------
router.post('/api/pictionary/set-difficulty', requireLogin, async (req, res) => {
  const { difficulty } = req.body;
  logger.info(`POST /api/pictionary/set-difficulty with difficulty: ${difficulty}`);

  try {
      let gameState = await Pictionary.getActiveGame();
      if (!gameState) {
          const activeUsers = await Users.getAllUserIds();
          logger.info(`Active users: ${JSON.stringify(activeUsers)}`);
          const newGameId = await Pictionary.createNewGame(activeUsers);
          gameState = await Pictionary.getGameById(newGameId);
      }
      const gameId = gameState.game_id;

      // Fetch max points for difficulty
      const maxPoints = await Pictionary.getMaxScore(difficulty);

      // Generate and assign the word
      const word = wordsService.getRandomPictionaryWord(difficulty);
      logger.info(`Assigned word for game ${gameId}: ${word} (difficulty: ${difficulty})`);

      // Store the chosen word, difficulty and update game state to 'drawing'
      await Pictionary.setChosenWord(gameId, word);
      await Pictionary.setDifficulty(gameId, difficulty);
      await Pictionary.setGameState(gameId, 'drawing');
      //await Pictionary.updateGameState(gameId, 'drawing');

      res.json({
          word,
          game_id: gameId,
          state: 'drawing',
          maxPoints
      });

  } catch (error) {
      logger.error('Error setting difficulty:', error.message);
      res.status(500).json({ error: 'Failed to set difficulty' });
  }
});

// ----------------------
// Get Image (Drawing)
// ----------------------
router.get('/api/pictionary/get-image', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/pictionary/get-image for user: ${userId}`);
  try {
    // Retrieve the active game
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      return res.status(400).json({ error: 'No active game found.' });
    }
    // Only allow this if the game state is in guessing, feedback, or modify
    if (gameState.state !== 'guessing' && gameState.state !== 'feedback' && gameState.state !== 'modify') {
      return res.status(400).json({ error: 'Game is not in a state for viewing the image.' });
    }
    // Retrieve the drawer's username using the Users function
    const { getUsernameById } = require('../models/user');
    const drawerName = await getUsernameById(gameState.drawer_user_id);
    
    // image_path should contain the relative path to the saved drawing
    const imageSrc = gameState.image_path;

    //If current user is the drawer, also return the word
    if (gameState.drawer_user_id === userId) {
      logger.info(`Returning image and word for drawer ${userId}`);
      return res.json({ drawerName, imageSrc, word: gameState.word, difficulty: gameState.difficulty});
    }
    
    res.json({ drawerName, imageSrc, difficulty: gameState.difficulty });
  } catch (error) {
    logger.error('Error fetching image:', error.message);
    res.status(500).json({ error: 'Failed to fetch image.' });
  }
});

// ----------------------
// Get Guesses
// ----------------------
router.get('/api/pictionary/get-guesses', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/pictionary/get-guesses for user: ${userId}`);
  try {
    // Retrieve the active game
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      return res.status(400).json({ error: 'No active game found.' });
    }
    const gameId = gameState.game_id;
    
    // Get all guesses for the game from the actions table.
    let guesses = await Pictionary.getGuesses(gameId);
    
    // Determine if the current user is the drawer.
    const isDrawer = (gameState.drawer_user_id === userId);

    
    // Determine current round number and last user round number
    const game_round = gameState.current_round;
    const last_round_for_user = await Pictionary.getRoundNumber(gameId, userId);
    
    // Censor guess if the user is not drawer and has not guessed yet
    if (!isDrawer && last_round_for_user < game_round) {
      logger.info(`Censoring guesses for user ${userId}`);
      guesses = guesses.map(guess => {
      if (guess.round_number === game_round) {
        return { ...guess, text: '***' };
      }
      return guess;
      });
    }
    logger.info(`Guesses fetched for game ${gameId}: ${guesses.length}`);

    //add user name to the guesses based on guess.user_id and function Users.getUsernameById
    guesses = await Promise.all(guesses.map(async guess => {
      const username = await Users.getUsernameById(guess.user_id);
      return { ...guess, username };
    }));
    
    res.json({ guesses });
  } catch (error) {
    logger.error('Error fetching guesses:', error.message);
    res.status(500).json({ error: 'Failed to fetch guesses.' });
  }
});

// ----------------------
// Submit a Guess
// ----------------------
router.post('/api/pictionary/submit-guess', requireLogin, async (req, res) => {
  logger.info(`POST /api/pictionary/submit-guess by user: ${req.session.userId}`);
  const { guess } = req.body;

  // Retrieve the active game
  const gameState = await Pictionary.getActiveGame();
  if (!gameState) {
    return res.status(400).json({ error: 'No active game found.' });
  }
  //Check if user is in guessers of gamestate
  if (!gameState.guessers.includes(req.session.userId)) {
    return res.status(400).json({ error: 'User is not in the list of guessers.' });
  }
  const gameId = gameState.game_id;
  const game_round = gameState.current_round;

  const last_round_for_user = await Pictionary.getRoundNumber(gameId, req.session.userId);
  const current_round_for_user = last_round_for_user + 1;
  if (current_round_for_user > game_round) {
    return res.status(400).json({ error: 'Game round is over.' });
  }
  try {
    await Pictionary.submitGuess(gameId,req.session.userId, current_round_for_user, guess);
    res.json({ status: 'success', message: 'Guess submitted successfully' });
  } catch (error) {
    logger.error('Error submitting guess:', error);
    res.status(400).json({ error: error.message });
  }
});

// Fetch Guess Status
router.get('/api/pictionary/get-guess-status', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/pictionary/get-guess-status for user: ${userId}`);
  
  try {
      const userList = await Pictionary.getActiveUsers(); // Get the list of active users
      const gameId = await Pictionary.getCurrentGame(userList); // Fetch the current game ID
      
      // Fetch guess submission status for all guessers in the game
      const guessStatus = await Pictionary.getGuessStatus(gameId);
      res.json({ guessStatus });
  } catch (error) {
      logger.error('Error fetching guess status:', error);
      res.status(500).json({ error: 'Failed to fetch guess status' });
  }
});

// Fetch Guesses Table
router.get('/api/pictionary/get-guesses', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/pictionary/get-guesses for user: ${userId}`);
  
  try {
      const userList = await Pictionary.getActiveUsers(); // Get the list of active users
      const gameId = await Pictionary.getCurrentGame(userList); // Fetch the current game ID
      
      // Fetch all guesses made in the game
      const guesses = await Pictionary.getGuesses(gameId);
      res.json({ guesses });
  } catch (error) {
      logger.error('Error fetching guesses:', error);
      res.status(500).json({ error: 'Failed to fetch guesses' });
  }
});  

// ----------------------
// Fetch Guesses to Grade
// --------------------
router.get('/api/pictionary/get-guesses-to-grade', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`GET /api/pictionary/get-guesses-to-grade for user: ${userId}`);
  
  try {
        // Retrieve the active game
        const gameState = await Pictionary.getActiveGame();
        if (!gameState) {
          return res.status(400).json({ error: 'No active game found.' });
        }
        //check if state is feedback
        if (gameState.state !== 'feedback') {
          return res.status(400).json({ error: 'Game is not in a state for feedback.' });
        }
        // Determine if the current user is the drawer.
        if (gameState.drawer_user_id !== userId){
          return res.status(403).json({ error: 'Not authorized: Only the drawer can grade guesses.' });
        }
        const gameId = gameState.game_id;     
        const round_number = gameState.current_round;
        // Fetch guesses that require grading
        const guessesToGrade = await Pictionary.getGuessesToGrade(gameId, round_number);
        
        // Check if modification has been used for this round
        const hasModified = await Pictionary.hasModifiedDrawing(gameId, round_number);
        
        res.json({ 
          guesses: guessesToGrade,
          canModify: !hasModified,
          word: gameState.word
        });
  } catch (error) {
      logger.error('Error fetching guesses to grade:', error);
      res.status(500).json({ error: 'Failed to fetch guesses to grade' });
  }
});

// ----------------------
// Submit Grades
// ----------------------
router.post('/api/pictionary/submit-grades', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { feedback } = req.body;// feedback is an array of {action_id, feedback_value}

  logger.info(`POST /api/pictionary/submit-grades by user: ${userId}`);
  logger.info(`feedback: ${JSON.stringify(feedback)}`);
  try {
      // Retrieve the active game
      const gameState = await Pictionary.getActiveGame();
      if (!gameState) {
        logger.error(`Submit-grades: No active game found for user ${userId}.`);
        return res.status(400).json({ error: 'No active game found.' });
      }
      //check if state is feedback
      if (gameState.state !== 'feedback') {
        logger.warn(`Submit-grades called for game ${gameState.game_id} by user ${userId}, but game state is '${gameState.state}', not 'feedback'. Possible duplicate or late call.`);
        return res.status(400).json({ error: 'Game is not in a state for feedback.' });
      }
      // Determine if the current user is the drawer.
      if (gameState.drawer_user_id !== userId){
        logger.warn(`Submit-grades: User ${userId} is not the drawer for game ${gameState.game_id}. Drawer is ${gameState.drawer_user_id}.`);
        return res.status(403).json({ error: 'Not authorized: Only the drawer can grade guesses.' });
      }
      const gameId = gameState.game_id;

      //loop over grades and submit feedback
      if (feedback && feedback.length > 0) {
        for (const grade of feedback) {
          await Pictionary.submitFeedback(grade.action_id, grade.feedback);
        }
        logger.debug(`Grades applied for game ${gameId}, round ${gameState.current_round} by user: ${userId}`);
      } else {
          logger.debug(`No feedback items provided in request for game ${gameId}, round ${gameState.current_round}, user: ${userId}. Proceeding to check end of feedback phase.`);
      }

      //end_of_round = await Pictionary.checkForEndOfFeedback(gameId);
      const feedbackResult = await Pictionary.checkForEndOfFeedback(gameId);
      // feedbackResult = { roundEnded: boolean, gameCompleted: boolean }
      let finalStateForClient = gameState.state; // Start with current
      if (feedbackResult.roundEnded) {
        if (feedbackResult.gameCompleted) {
            // Pictionary.CompleteGame should have set state to 'scoring' or 'completed'.
            // If updateScoring is separate and needed:
            // await Pictionary.updateScoring(gameId);
            logger.info(`Game ${gameId} is now completed.`);
            finalStateForClient = 'scoring'; // Or 'completed', client will redirect to scoreboard
        } else {
            // Round ended, not game over, move to next round's guessing phase
            await Pictionary.setGameState(gameId, 'guessing');
            logger.info(`Game ${gameId} advanced to 'guessing' state for the next round.`);
            finalStateForClient = 'guessing';
        }
      } else {
          // Round not ended (e.g., feedback still pending for actual guesses)
          // Game remains in 'feedback' state.
          logger.info(`Game ${gameId} remains in 'feedback' state after grade processing. Feedback result: ${JSON.stringify(feedbackResult)}`);
          finalStateForClient = 'feedback';
      }
      
      // Fetch the most up-to-date game state to send back, especially if it changed.
      const updatedGameState = await Pictionary.getGameById(gameId);
      finalStateForClient = updatedGameState.state; // Use the truly latest state from DB

      res.json({ status: 'success', message: 'Grades processed.', newState: finalStateForClient });

  } catch (error) {
      logger.error(`Error in /api/pictionary/submit-grades for user ${userId}: ${error.stack}`);
      res.status(500).json({ error: 'Failed to submit grades due to an internal error.' });
  }

});  


// ----------------------
// Start Drawing (Initialize Timer)
// ----------------------
router.post('/api/pictionary/start-drawing', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`POST /api/pictionary/start-drawing initiated by user: ${userId}`);

  try {
    // Retrieve the current active game (global game)
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      return res.status(400).json({ error: 'No active game found.' });
    }
    logger.info(`Active game found: ${JSON.stringify(gameState)}`);
    // Check if the current user is the drawer
    if (gameState.drawer_user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized: Only the drawer can start the drawing session.' });
    }

    // Check if the drawing session has already been started.
    if (gameState.drawing_completed_at) {
      // Calculate remaining time
      const endTime = new Date(gameState.drawing_completed_at);
      const now = new Date();
      const remainingTime = Math.max(0, Math.round((endTime - now) / 1000));
      logger.info(`Drawing session already started. Remaining time: ${remainingTime} seconds.`);
      return res.json({ status: 'success', message: 'Drawing session already started', countdown: remainingTime, word: gameState.word });
    }
    
    
    // Start the drawing session without needing to pass game_id from the client
    const countdownDuration = await Pictionary.startDrawing(gameState.game_id);
    logger.info(`Drawing started for game ${gameState.game_id} by user: ${userId}, countdown: ${countdownDuration} seconds`);
    res.json({ status: 'success', message: 'Drawing timer started', countdown: countdownDuration,'word': gameState.word });
  } catch (error) {
    logger.error('Error starting drawing timer:', error.message);
    res.status(500).json({ error: 'Failed to start drawing timer' });
  }
});
// ----------------------
// Submit Drawing
// ----------------------
router.post('/api/pictionary/submit-drawing', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { drawing } = req.body;  // The base64 data from the canvas
  logger.info(`POST /api/pictionary/submit-drawing by user: ${userId}`);

    // Basic check for empty drawing data
  if (!drawing || drawing.trim() === '' || 
    (drawing.startsWith('data:image/png;base64,') && drawing.split(',')[1].trim() === '')) {
    logger.info('No drawing provided. Ending round as a loss.');
    // Here you can call a function to update the game state to "abandoned" or to give 0 points for everyone.
    await Pictionary.handleEmptyDrawing(req.session.gameId); // Implement this function as needed.
    return res.json({ status: 'success', message: 'No drawing provided. Round ended with 0 scores.' });
  }


  try {
    // Retrieve the active game (global game)
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      return res.status(400).json({ error: 'No active game found.' });
    }
    // Ensure the current user is the drawer
    if (gameState.drawer_user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized: Only the drawer can submit a drawing.' });
    }
    logger.info(`Saving drawing for game ${gameState.game_id} by user: ${userId}`); 
    const filePath = await Pictionary.saveDrawing(gameState.game_id, drawing);
    logger.info(`Drawing submitted for game ${gameState.game_id} by user: ${userId}`);
    res.json({ status: 'success', message: 'Drawing submitted successfully', filePath });
  } catch (error) {
    logger.error('Error submitting drawing:', error.message);
    res.status(500).json({ error: 'Failed to submit drawing' });
  }
});

// ----------------------
// Enter Modify State
// ----------------------
router.post('/api/pictionary/enter-modify-state', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  logger.info(`POST /api/pictionary/enter-modify-state by user: ${userId}`);

  try {
    // Retrieve the active game
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      logger.error('No active game found');
      return res.status(400).json({ error: 'No active game found.' });
    }

    // Log the current game state
    logger.info(`Current game state: ${gameState.state}`);
    logger.info(`Game state details: ${JSON.stringify(gameState)}`);

    // Check if game is in feedback state
    if (gameState.state !== 'feedback' && gameState.state !== 'modify') {
      logger.error(`Game is not in feedback or modify state. Current state: ${gameState.state}`);
      return res.status(400).json({ error: 'Game is not in feedback or modify state.' });
    }

    // Verify user is the drawer
    if (gameState.drawer_user_id !== userId) {
      logger.error(`User ${userId} is not the drawer (drawer is ${gameState.drawer_user_id})`);
      return res.status(403).json({ error: 'Not authorized: Only the drawer can modify the drawing.' });
    }

    // Check if modification has been used for this round
    const hasModified = await Pictionary.hasModifiedDrawing(gameState.game_id, gameState.current_round);
    if (hasModified) {
      logger.error(`Drawing has already been modified for game ${gameState.game_id}, round ${gameState.current_round}`);
      return res.status(400).json({ error: 'Drawing has already been modified for this round.' });
    }

    // Set game state to modify and start modification timer
    await Pictionary.setGameState(gameState.game_id, 'modify');
    const countdownDuration = await Pictionary.startModificationTimer(gameState.game_id);

    logger.info(`Successfully entered modify state for game ${gameState.game_id} with countdown ${countdownDuration}`);
    res.json({ 
      status: 'success', 
      message: 'Entered modify state', 
      countdown_duration: countdownDuration,
      word: gameState.word,
      image_src: gameState.image_path
    });
  } catch (error) {
    logger.error('Error entering modify state:', error);
    res.status(500).json({ error: 'Failed to enter modify state' });
  }
});

// ----------------------
// Submit Modified Drawing
// ----------------------
router.post('/api/pictionary/submit-modified-drawing', requireLogin, async (req, res) => {
  const userId = req.session.userId;
  const { drawing } = req.body;
  logger.info(`POST /api/pictionary/submit-modified-drawing by user: ${userId}`);

  try {
    // Retrieve the active game
    const gameState = await Pictionary.getActiveGame();
    if (!gameState) {
      return res.status(400).json({ error: 'No active game found.' });
    }

    // Verify game is in modify state
    if (gameState.state !== 'modify') {
      return res.status(400).json({ error: 'Game is not in modify state.' });
    }

    // Verify user is the drawer
    if (gameState.drawer_user_id !== userId) {
      return res.status(403).json({ error: 'Not authorized: Only the drawer can submit modified drawing.' });
    }

    // Save the modified drawing
    const filePath = await Pictionary.saveModifiedDrawing(gameState.game_id, drawing);

    // Return to feedback state
    await Pictionary.setGameState(gameState.game_id, 'feedback');

    res.json({ 
      status: 'success', 
      message: 'Modified drawing submitted successfully', 
      filePath 
    });
  } catch (error) {
    logger.error('Error submitting modified drawing:', error);
    res.status(500).json({ error: 'Failed to submit modified drawing' });
  }
});

module.exports = router;