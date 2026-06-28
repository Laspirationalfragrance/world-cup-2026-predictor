#!/usr/bin/env node
// Rebuild web/index.html and docs/index.html with fresh embedded data
import fs from "node:fs";

const html = fs.readFileSync("web/index.html", "utf-8");
const data = JSON.parse(fs.readFileSync("output/web-data.json", "utf-8"));

const matchesJson = JSON.stringify(data.matches);
const teamsJson = JSON.stringify(data.teams);

// Replace MATCHES array
const matchesRegex = /(const MATCHES = )\[.*?\];(\s*\n\s*const TEAMS = )\[.*?\];/s;
const replacement = `$1${matchesJson};$2${teamsJson};`;

if (!matchesRegex.test(html)) {
  console.error("ERROR: Could not find MATCHES/TEAMS pattern in HTML. Aborting.");
  process.exit(1);
}

let updated = html.replace(matchesRegex, replacement);

// ── Inject auth data from config/auth.json ──
const authPath = "config/auth.json";
if (fs.existsSync(authPath)) {
  const auth = JSON.parse(fs.readFileSync(authPath, "utf-8"));
  const authEnabled = !!(auth.passwordHash && Object.keys(auth.activationCodes || {}).length > 0);

  // Update AUTH_ENABLED
  updated = updated.replace(
    /const AUTH_ENABLED = (true|false);/,
    `const AUTH_ENABLED = ${authEnabled};`
  );

  // Update AUTH_PASSWORD_HASH
  updated = updated.replace(
    /const AUTH_PASSWORD_HASH = "[^"]*";/,
    `const AUTH_PASSWORD_HASH = "${auth.passwordHash || ''}";`
  );

  // Update AUTH_CODE_HASHES
  const codeHashesJson = JSON.stringify(auth.activationCodes || {});
  updated = updated.replace(
    /const AUTH_CODE_HASHES = \{[^}]*\};/,
    `const AUTH_CODE_HASHES = ${codeHashesJson};`
  );

  console.log(`✅ Auth data injected: ${Object.keys(auth.activationCodes || {}).length} authorized users`);
} else {
  console.log("⚠️  No config/auth.json found — auth disabled");
  updated = updated.replace(/const AUTH_ENABLED = true;/, "const AUTH_ENABLED = false;");
}

fs.writeFileSync("web/index.html", updated);
fs.writeFileSync("docs/index.html", updated);
console.log(`✅ Built web/index.html and docs/index.html with ${data.matches.length} matches (${data.totalMatches || data.matches.length} total)`);
