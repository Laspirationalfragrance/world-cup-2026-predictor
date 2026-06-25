#!/usr/bin/env node
// Extract match predictions as JSON for the web app
import fs from "node:fs";

const csv = fs.readFileSync("output/match-predictions-2026.csv", "utf-8");
const lines = csv.trim().split("\n");
const headers = lines[0].split(",").map(h => h.trim());

const matches = [];
for (let i = 1; i < lines.length; i++) {
  const cells = [];
  let current = "";
  let quoted = false;
  const line = lines[i];
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

  const m = {};
  headers.forEach((h, idx) => { m[h] = cells[idx] || ""; });

  matches.push({
    id: m.matchId,
    num: parseInt(m.matchNumber) || 0,
    date: m.date,
    group: m.group,
    home: m.homeTeam,
    away: m.awayTeam,
    homeOfficial: m.officialHomeTeam,
    awayOfficial: m.officialAwayTeam,
    stadium: m.stadium,
    city: m.city,
    country: m.country,
    neutral: m.neutral === "true" || m.neutral === "TRUE",
    homeWin: parseFloat(m.homeWin) || 0,
    draw: parseFloat(m.draw) || 0,
    awayWin: parseFloat(m.awayWin) || 0,
    score: m.predictedScore,
    confidence: m.confidence,
    upsetRisk: m.upsetRisk,
    favoriteProb: parseFloat(m.favoriteProbability) || 0,
    notes: m.matchupNotes,
    missingFeatures: m.missingFeatures,
    oddsUsed: m.oddsUsed === "true",
  });
}

// Also extract team data from the simulation
const sim = JSON.parse(fs.readFileSync("output/tournament-simulation-2026.json", "utf-8"));
const teams = sim.teams.map(t => ({
  name: t.team,
  group: t.group,
  advance: t.advanceR32,
  champion: t.champion,
  avgPoints: t.avgPoints,
  groupFirst: t.groupFirst,
  groupSecond: t.groupSecond,
}));

const output = { generatedAt: new Date().toISOString(), matches, teams };
fs.writeFileSync("output/web-data.json", JSON.stringify(output, null, 2));
console.log(`Wrote ${matches.length} matches and ${teams.length} teams to output/web-data.json`);
