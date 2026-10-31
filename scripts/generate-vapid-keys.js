// scripts/generate-vapid-keys.js
// Prints a new key pair for push notifications, to paste into .env once.
// Changing the keys later makes every device turn notifications on again.
// Usage: node scripts/generate-vapid-keys.js
const webpush = require('web-push');

const { publicKey, privateKey } = webpush.generateVAPIDKeys();
console.log(`VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log('VAPID_SUBJECT=mailto:you@example.com');
