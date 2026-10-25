//models/mastermind/dates.js
// Woordle days follow Dutch time: the new word starts at midnight in
// Amsterdam, not at midnight UTC. Dates are 'YYYY-MM-DD' strings.

const TIME_ZONE = 'Europe/Amsterdam';
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });

// 'YYYY-MM-DD' of the given moment in Dutch time
function dateNL(date = new Date()) {
  return formatter.format(date);
}

function todayNL() {
  return dateNL(new Date());
}

// 'YYYY-MM' of the current Dutch month
function monthNL(date = new Date()) {
  return dateNL(date).slice(0, 7);
}

// Shift a 'YYYY-MM-DD' string by whole days (calendar arithmetic, no time zones involved)
function addDays(dateString, days) {
  const d = new Date(`${dateString}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 'YYYY-MM' of the month before the given 'YYYY-MM'
function previousMonth(month) {
  const [year, m] = month.split('-').map(Number);
  return m === 1 ? `${year - 1}-12` : `${year}-${String(m - 1).padStart(2, '0')}`;
}

function isDateString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isMonthString(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}$/.test(value);
}

module.exports = {
  dateNL,
  todayNL,
  monthNL,
  addDays,
  previousMonth,
  isDateString,
  isMonthString
};
