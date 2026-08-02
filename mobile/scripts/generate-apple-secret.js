#!/usr/bin/env node
// Génère le JWT "Secret Key (for OAuth)" attendu par Supabase pour Sign in
// with Apple (Authentication → Providers → Apple). Ce script s'exécute en
// LOCAL : la clé privée .p8 ne quitte jamais ta machine.
//
// Usage :
//   npm install jsonwebtoken --no-save   (une fois, dans mobile/)
//   node scripts/generate-apple-secret.js \
//     --team-id TEAMID1234 \
//     --key-id KEYID56789 \
//     --service-id com.walkedia.signin \
//     --key-file /chemin/vers/AuthKey_KEYID56789.p8
//
// Copie la sortie dans Supabase → Authentication → Providers → Apple →
// "Secret Key (for OAuth)". À régénérer avant expiration (max 6 mois).

const fs = require('fs');
const jwt = require('jsonwebtoken');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : null;
}

const teamId = arg('team-id');
const keyId = arg('key-id');
const serviceId = arg('service-id');
const keyFile = arg('key-file');

if (!teamId || !keyId || !serviceId || !keyFile) {
  console.error(
    'Usage: node generate-apple-secret.js --team-id <TEAM_ID> --key-id <KEY_ID> --service-id <SERVICE_ID> --key-file <chemin .p8>'
  );
  process.exit(1);
}

const privateKey = fs.readFileSync(keyFile, 'utf8');
const now = Math.floor(Date.now() / 1000);
const SIX_MONTHS = 15777000; // max autorisé par Apple

const token = jwt.sign(
  {
    iss: teamId,
    iat: now,
    exp: now + SIX_MONTHS,
    aud: 'https://appleid.apple.com',
    sub: serviceId,
  },
  privateKey,
  { algorithm: 'ES256', keyid: keyId }
);

console.log(token);
