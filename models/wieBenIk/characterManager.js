//models/wieBenIk/characterManager.js
const fs = require('fs');
const path = require('path');
const logger = require('../../logger');

const DATA_PATH = path.join(__dirname, '../../data/wie_ben_ik_personages.json');
const ALL_THEMES_ID = 'alle';
const ALL_THEMES_NAME = 'Alle categorieën';

let cachedData = null;

function loadData() {
  if (!cachedData) {
    const raw = fs.readFileSync(DATA_PATH, 'utf8');
    cachedData = JSON.parse(raw);
    logger.info(`Wie ben ik: loaded ${cachedData.themas.length} themes from ${DATA_PATH}`);
  }
  return cachedData;
}

// Returns all themes plus the "all categories" option, for the theme vote UI.
function getThemes() {
  const data = loadData();
  const themes = data.themas.map(t => ({
    id: t.id,
    naam: t.naam,
    aantal: t.figuren.length
  }));
  themes.push({
    id: ALL_THEMES_ID,
    naam: ALL_THEMES_NAME,
    aantal: data.themas.reduce((sum, t) => sum + t.figuren.length, 0)
  });
  return themes;
}

function isValidThemeId(themeId) {
  return getThemes().some(t => t.id === themeId);
}

function getThemeName(themeId) {
  const theme = getThemes().find(t => t.id === themeId);
  return theme ? theme.naam : null;
}

function getFiguresForTheme(themeId) {
  const data = loadData();
  if (themeId === ALL_THEMES_ID) {
    return data.themas.flatMap(t => t.figuren);
  }
  const theme = data.themas.find(t => t.id === themeId);
  return theme ? theme.figuren : [];
}

// Picks `count` distinct random figures from the theme.
function pickRandomFigures(themeId, count) {
  const figures = [...getFiguresForTheme(themeId)];
  if (figures.length < count) {
    throw new Error(`Not enough figures in theme '${themeId}' for ${count} players`);
  }
  // Fisher-Yates shuffle
  for (let i = figures.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [figures[i], figures[j]] = [figures[j], figures[i]];
  }
  return figures.slice(0, count);
}

module.exports = {
  ALL_THEMES_ID,
  ALL_THEMES_NAME,
  getThemes,
  isValidThemeId,
  getThemeName,
  getFiguresForTheme,
  pickRandomFigures
};
