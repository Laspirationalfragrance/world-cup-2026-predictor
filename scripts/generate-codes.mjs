#!/usr/bin/env node
// Generate and manage activation codes for the FIFA prediction web app.
// Each user gets a unique code; the SHA-256 hash is embedded in the HTML.
// The owner can trace which code leaked if one gets shared publicly.

import fs from "node:fs";
import crypto from "node:crypto";
import path from "node:path";

const AUTH_PATH = path.resolve("config/auth.json");

function sha256(text) {
  return crypto.createHash("sha256").update(text).digest("hex");
}

function loadAuth() {
  if (!fs.existsSync(AUTH_PATH)) {
    return { passwordHash: "", activationCodes: {} };
  }
  return JSON.parse(fs.readFileSync(AUTH_PATH, "utf-8"));
}

function saveAuth(auth) {
  fs.writeFileSync(AUTH_PATH, JSON.stringify(auth, null, 2) + "\n");
  console.log(`✅ Saved to ${AUTH_PATH}`);
}

function generateCode() {
  // 16-char alphanumeric code, easy to type
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no confusing chars (0/O, 1/I/l)
  let code = "";
  const bytes = crypto.randomBytes(16);
  for (let i = 0; i < 16; i++) {
    code += chars[bytes[i] % chars.length];
  }
  // Format: XXXX-XXXX-XXXX-XXXX for readability
  return code.slice(0, 4) + "-" + code.slice(4, 8) + "-" + code.slice(8, 12) + "-" + code.slice(12, 16);
}

function printHelp() {
  console.log(`
🔐 FIFA 2026 Prediction — Activation Code Manager

Usage:
  node scripts/generate-codes.mjs --add <name>     Generate a code for a new user
  node scripts/generate-codes.mjs --revoke <name>  Revoke a user's code
  node scripts/generate-codes.mjs --list           List all active users
  node scripts/generate-codes.mjs --set-password   Set or change the access password
  node scripts/generate-codes.mjs --help           Show this help

Examples:
  node scripts/generate-codes.mjs --add 张三
  node scripts/generate-codes.mjs --revoke 李四
  node scripts/generate-codes.mjs --set-password
`);
}

function parseArgs(argv) {
  const args = { cmd: "", arg: "" };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === "--add") { args.cmd = "add"; args.arg = argv[i + 1] || ""; i++; }
    else if (argv[i] === "--revoke") { args.cmd = "revoke"; args.arg = argv[i + 1] || ""; i++; }
    else if (argv[i] === "--list") { args.cmd = "list"; }
    else if (argv[i] === "--set-password") { args.cmd = "set-password"; }
    else if (argv[i] === "--help" || argv[i] === "-h") { args.cmd = "help"; }
  }
  return args;
}

// ── Main ──
const { cmd, arg } = parseArgs(process.argv);

if (!cmd || cmd === "help") {
  printHelp();
  process.exit(0);
}

const auth = loadAuth();

if (cmd === "add") {
  if (!arg) {
    console.error("❌ Please provide a user name: --add <name>");
    process.exit(1);
  }
  if (auth.activationCodes[arg]) {
    console.error(`❌ User "${arg}" already has an activation code. Use --revoke first to replace.`);
    process.exit(1);
  }
  const code = generateCode();
  const hash = sha256(code);
  auth.activationCodes[arg] = hash;
  saveAuth(auth);
  console.log(`\n👤 User: ${arg}`);
  console.log(`🔑 Activation code: ${code}`);
  console.log(`📋 Hash: ${hash}`);
  console.log(`\n⚠️  Give this code to ${arg}. They will need BOTH the password AND this code to access the app.`);
  console.log(`⚠️  Remind them: DO NOT share this code. It is linked to their identity.\n`);

} else if (cmd === "revoke") {
  if (!arg) {
    console.error("❌ Please provide a user name: --revoke <name>");
    process.exit(1);
  }
  if (!auth.activationCodes[arg]) {
    console.error(`❌ User "${arg}" not found.`);
    process.exit(1);
  }
  delete auth.activationCodes[arg];
  saveAuth(auth);
  console.log(`\n🗑️  Revoked activation code for: ${arg}`);
  console.log(`⚠️  Remember to rebuild the web app (npm run build or node scripts/build-web-html.mjs) to apply changes.\n`);

} else if (cmd === "list") {
  const users = Object.keys(auth.activationCodes);
  console.log(`\n👥 Authorized users (${users.length}):`);
  if (users.length === 0) {
    console.log("   (none)");
  } else {
    users.forEach((name, i) => {
      console.log(`   ${i + 1}. ${name}`);
    });
  }
  console.log(`\n🔒 Password: ${auth.passwordHash ? "SET" : "NOT SET"}`);
  console.log();

} else if (cmd === "set-password") {
  // Read password from stdin securely
  console.log("Enter new access password:");
  // Use stdin directly for password input
  const buf = Buffer.alloc(128);
  const n = fs.readSync(0, buf, 0, 128);
  // Remove trailing newline
  let password = buf.toString("utf-8", 0, n).replace(/\r?\n$/, "");
  if (!password) {
    console.error("❌ Password cannot be empty.");
    process.exit(1);
  }
  auth.passwordHash = sha256(password);
  saveAuth(auth);
  console.log(`\n🔒 Password updated! Hash: ${auth.passwordHash}`);
  console.log(`⚠️  Remember to rebuild the web app to apply changes.\n`);
}
