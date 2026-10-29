//models/push.js
// Push notifications (Web Push): the devices that turned them on in Settings,
// and sending a message to a list of users. Without VAPID keys in .env
// nothing is sent and the Settings page says notifications are unavailable.
const webpush = require('web-push');
const db = require('./db');
const logger = require('../logger');

const PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@example.com';
const configured = !!(PUBLIC_KEY && PRIVATE_KEY);

if (configured) {
  webpush.setVapidDetails(SUBJECT, PUBLIC_KEY, PRIVATE_KEY);
} else {
  logger.warn('VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY are not set in .env: push notifications are off.');
}

// One kind per toggle in Settings; a missing setting means on.
const KINDS = {
  pictionary: 'notifyPictionary',
  wieBenIk: 'notifyWieBenIk',
  woordle: 'notifyWoordle',
  results: 'notifyResults'
};

// The server POSTs to the endpoint a browser hands over, so only accept the
// push services of the browsers themselves (Chrome, Firefox, Safari, Edge).
const PUSH_HOSTS = ['fcm.googleapis.com', 'push.services.mozilla.com', 'push.apple.com', 'notify.windows.com'];

db.run(`
  CREATE TABLE IF NOT EXISTS push_subscriptions (
    endpoint TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    p256dh TEXT NOT NULL,
    auth TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  )
`, (err) => {
  if (err) logger.error('Failed to create push_subscriptions table:', err.message);
});

function run(sql, params) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) { err ? reject(err) : resolve(this); });
  });
}

function all(sql, params) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

// Checks a PushSubscription (as JSON from the browser); returns
// { endpoint, p256dh, auth } or null when it doesn't look right.
function parseSubscription(subscription) {
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return null;
  if (typeof p256dh !== 'string' || p256dh.length > 200 || typeof auth !== 'string' || auth.length > 100) return null;
  let url;
  try {
    url = new URL(endpoint);
  } catch (error) {
    return null;
  }
  const knownHost = PUSH_HOSTS.some(host => url.hostname === host || url.hostname.endsWith(`.${host}`));
  if (url.protocol !== 'https:' || !knownHost) return null;
  return { endpoint, p256dh, auth };
}

// Stores (or moves to this user) the subscription of one device.
async function saveSubscription(userId, subscription) {
  await run(`
    INSERT INTO push_subscriptions (endpoint, user_id, p256dh, auth) VALUES (?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth
  `, [subscription.endpoint, userId, subscription.p256dh, subscription.auth]);
  logger.info(`Push: subscription saved for user ${userId}`);
}

async function removeSubscription(userId, endpoint) {
  await run('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, userId]);
  logger.info(`Push: subscription removed for user ${userId}`);
}

async function sendToSubscription(row, message) {
  try {
    await webpush.sendNotification(
      { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth } },
      JSON.stringify(message),
      { TTL: 12 * 60 * 60 }
    );
    return true;
  } catch (error) {
    // 404/410: the browser dropped this subscription (e.g. permission revoked)
    if (error.statusCode === 404 || error.statusCode === 410) {
      await run('DELETE FROM push_subscriptions WHERE endpoint = ?', [row.endpoint]);
      logger.info(`Push: removed expired subscription of user ${row.user_id}`);
    } else {
      logger.error(`Push: sending to user ${row.user_id} failed:`, error.statusCode || '', error.body || error.message);
    }
    return false;
  }
}

// Sends { title, body, url, tag } to every device of the given users that
// have this kind of notification on. Never throws, so a game action never
// fails because of a notification; callers don't need to await it.
async function notify(userIds, kind, message) {
  if (!configured || !userIds || userIds.length === 0) return;
  try {
    const ids = [...new Set(userIds)];
    const placeholders = ids.map(() => '?').join(',');
    const rows = await all(`
      SELECT s.* FROM push_subscriptions s
      LEFT JOIN user_settings us ON us.user_id = s.user_id AND us.setting_key = ?
      WHERE s.user_id IN (${placeholders}) AND COALESCE(us.setting_value, '1') = '1'
    `, [KINDS[kind], ...ids]);
    if (rows.length === 0) return;
    logger.info(`Push (${kind}) "${message.title}" to users ${JSON.stringify([...new Set(rows.map(r => r.user_id))])}`);
    await Promise.all(rows.map(row => sendToSubscription(row, message)));
  } catch (error) {
    logger.error(`Push (${kind}) failed:`, error);
  }
}

// A test message to all devices of one user, whatever the toggles say.
// Returns how many devices it reached.
async function sendTest(userId) {
  if (!configured) return 0;
  const rows = await all('SELECT * FROM push_subscriptions WHERE user_id = ?', [userId]);
  const results = await Promise.all(rows.map(row => sendToSubscription(row, {
    title: 'Spelletjes met Hannie',
    body: 'Zo ziet een melding eruit. 🎉',
    url: '/settings',
    tag: 'test'
  })));
  return results.filter(Boolean).length;
}

module.exports = {
  KINDS,
  isConfigured: () => configured,
  publicKey: () => PUBLIC_KEY || null,
  parseSubscription,
  saveSubscription,
  removeSubscription,
  notify,
  sendTest
};
