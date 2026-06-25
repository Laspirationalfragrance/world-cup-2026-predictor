#!/usr/bin/env node
// Update knockout predictions after group match days.
// Reads actual results from data/manual/match-results.csv,
// recalculates group standings, then re-runs the full knockout
// prediction pipeline with actual group outcomes.

import fs from "node:fs";
import { execFileSync } from "node:child_process";

// ── Config ──
const RESULTS_PATH = "data/manual/match-results.csv";
const PREDICTIONS_PATH = "output/match-predictions-2026.csv";
const SIM_PATH = "output/tournament-simulation-2026.json";
const SIM_BACKUP_PATH = "output/tournament-simulation-2026.backup.json";
const UPDATED_CSV_PATH = "output/match-predictions-2026-updated.csv";

// ── Parse CSV line (handles quoted fields) ──
function parseCSVLine(line) {
  const cells = [];
  let current = "";
  let quoted = false;
  for (let j = 0; j < line.length; j++) {
    const ch = line[j];
    if (ch === '"') {
      if (quoted && line[j + 1] === '"') { current += '"'; j++; }
      else { quoted = !quoted; }
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else { current += ch; }
  }
  cells.push(current.trim());
  return cells;
}

// ── Read actual results ──
function readActualResults() {
  if (!fs.existsSync(RESULTS_PATH)) {
    console.log("⚠️  No match-results.csv found — all matches use predictions.");
    return {};
  }
  const csv = fs.readFileSync(RESULTS_PATH, "utf-8");
  const lines = csv.trim().split("\n");
  const results = {};
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const matchId = cells[0];
    const homeScore = parseInt(cells[1]) || 0;
    const awayScore = parseInt(cells[2]) || 0;
    const status = (cells[3] || "").trim().toLowerCase();
    if (status === "completed" && matchId) {
      results[matchId] = { homeScore, awayScore };
    }
  }
  return results;
}

// ── Read predicted match data ──
function readPredictions() {
  const csv = fs.readFileSync(PREDICTIONS_PATH, "utf-8");
  const lines = csv.trim().split("\n");
  const headers = parseCSVLine(lines[0]);
  const matches = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = parseCSVLine(lines[i]);
    const m = {};
    headers.forEach((h, idx) => { m[h] = cells[idx] || ""; });
    matches.push(m);
  }
  return matches;
}

// ── Compute group standings from actual + predicted results ──
function computeStandings(matches, actualResults) {
  const groups = {};

  // Initialize teams per group
  for (const m of matches) {
    const g = m.group;
    if (!groups[g]) groups[g] = {};
    const homeTeam = m.homeTeam;
    const awayTeam = m.awayTeam;
    if (!groups[g][homeTeam]) groups[g][homeTeam] = { team: homeTeam, pts: 0, gf: 0, ga: 0, gd: 0, played: 0 };
    if (!groups[g][awayTeam]) groups[g][awayTeam] = { team: awayTeam, pts: 0, gf: 0, ga: 0, gd: 0, played: 0 };
  }

  // Process each match
  for (const m of matches) {
    const g = m.group;
    const homeTeam = m.homeTeam;
    const awayTeam = m.awayTeam;
    const actual = actualResults[m.matchId];

    let hG, aG;
    if (actual) {
      // Use actual result
      hG = actual.homeScore;
      aG = actual.awayScore;
    } else {
      // Use predicted score for expected contribution
      const score = (m.predictedScore || "0-0").split("-");
      hG = parseInt(score[0]) || 0;
      aG = parseInt(score[1]) || 0;
    }

    // Update stats
    groups[g][homeTeam].gf += hG;
    groups[g][homeTeam].ga += aG;
    groups[g][homeTeam].played++;
    groups[g][awayTeam].gf += aG;
    groups[g][awayTeam].ga += hG;
    groups[g][awayTeam].played++;

    if (hG > aG) {
      groups[g][homeTeam].pts += 3;
    } else if (hG < aG) {
      groups[g][awayTeam].pts += 3;
    } else {
      groups[g][homeTeam].pts += 1;
      groups[g][awayTeam].pts += 1;
    }
  }

  // Calculate GD and return sorted
  const standings = {};
  for (const [g, teams] of Object.entries(groups)) {
    const arr = Object.values(teams);
    for (const t of arr) {
      t.gd = t.gf - t.ga;
    }
    // Sort: points desc → GD desc → GF desc
    arr.sort((a, b) => {
      if (b.pts !== a.pts) return b.pts - a.pts;
      if (b.gd !== a.gd) return b.gd - a.gd;
      return b.gf - a.gf;
    });
    standings[g] = arr;
  }

  return standings;
}

// ── Main ──
console.log("🔄 Updating knockout predictions based on actual group results…\n");

// 1. Read actual results
const actualResults = readActualResults();
const completedCount = Object.keys(actualResults).length;
console.log(`📋 Actual results loaded: ${completedCount} completed matches`);

// 2. Read predictions
const predictedMatches = readPredictions();
console.log(`📊 Predictions loaded: ${predictedMatches.length} group matches`);

// 3. Compute standings
const standings = computeStandings(predictedMatches, actualResults);

// Print standings
console.log("\n🏆 Current Group Standings:");
for (const [g, teams] of Object.entries(standings).sort()) {
  const labels = teams.map((t, i) => {
    const pos = ["1st", "2nd", "3rd", "4th"][i];
    return `  ${pos} ${t.team.padEnd(20)} ${t.pts}pts  GD:${t.gd >= 0 ? "+" : ""}${t.gd}  GF:${t.gf}`;
  });
  console.log(`\nGroup ${g}:`);
  labels.forEach(l => console.log(l));
}

// 4. Update tournament simulation JSON with actual standings
if (!fs.existsSync(SIM_BACKUP_PATH)) {
  fs.copyFileSync(SIM_PATH, SIM_BACKUP_PATH);
  console.log(`\n💾 Backed up original simulation to ${SIM_BACKUP_PATH}`);
}

const sim = JSON.parse(fs.readFileSync(SIM_PATH, "utf-8"));

// Update avgPoints to reflect actual standings
// Encode as: actualPoints * 100 + gd (ensures correct sorting by points then GD)
for (const [g, teams] of Object.entries(standings)) {
  for (let i = 0; i < teams.length; i++) {
    const t = teams[i];
    const simTeam = sim.teams.find(st => st.team === t.team);
    if (simTeam) {
      // Encode pts + gd into avgPoints for sorting
      // Base: pts * 10 + gd/10, plus bonus for higher position
      const posBonus = (4 - i) * 0.01; // tiny bonus for position within group
      simTeam.avgPoints = t.pts * 10 + t.gd + posBonus;
      simTeam.actualPts = t.pts;
      simTeam.actualGD = t.gd;
      simTeam.actualGF = t.gf;
      simTeam.actualPosition = i + 1;
    }
  }
}

fs.writeFileSync(SIM_PATH, JSON.stringify(sim, null, 2));
console.log("✅ Updated simulation JSON with actual standings");

// 5. Re-run knockout predictions
console.log("\n⚽ Running knockout predictions…");
execFileSync("node", ["scripts/predict-all-knockout.mjs"], { stdio: "inherit", cwd: process.cwd() });

// 6. Rebuild web data
console.log("\n📦 Building web data…");
execFileSync("node", ["scripts/build-web-data.mjs"], { stdio: "inherit", cwd: process.cwd() });

// 7. Rebuild HTML
console.log("\n🌐 Building web HTML…");
execFileSync("node", ["scripts/build-web-html.mjs"], { stdio: "inherit", cwd: process.cwd() });

// 8. Summary
const koData = JSON.parse(fs.readFileSync("output/knockout-predictions-full.json", "utf-8"));
console.log(`\n✅ Update complete!`);
console.log(`   ${completedCount} actual results applied`);
console.log(`   ${koData.length} knockout matches predicted`);
console.log(`   Web app rebuilt with updated predictions`);

// Print champion prediction
const finalMatch = koData.find(m => m.round === "Final");
if (finalMatch) {
  console.log(`\n🏆 Predicted Champion: ${finalMatch.predictedWinner}`);
  console.log(`   Final: ${finalMatch.homeTeam} ${finalMatch.totalScore || finalMatch.predictedScore} ${finalMatch.awayTeam}`);
}
