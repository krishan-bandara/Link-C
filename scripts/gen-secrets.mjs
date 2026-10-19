// Prints fresh secrets. Run: node scripts/gen-secrets.mjs
import { randomBytes } from 'node:crypto';

const b64 = () => randomBytes(32).toString('base64');
console.log(`MASTER_KEY=${b64()}`);
console.log(`SIGNING_KEY=${b64()}`);
console.log('');
console.log('Paste both lines into your .env file.');
console.log('IMPORTANT: store a copy OFFLINE in a password manager now.');
console.log('If MASTER_KEY is lost, every stored photo/video becomes permanently unreadable.');
console.log('Do not run this again later: new keys would not open old data.');
