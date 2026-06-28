#!/usr/bin/env node
// Extract match predictions as JSON for the web app
// Includes both group stage (CSV) and knockout predictions (JSON)
import fs from "node:fs";

// ── Parse group stage CSV ──
const csv = fs.readFileSync("output/match-predictions-2026.csv", "utf-8");
const lines = csv.trim().split("\n");
const headers = lines[0].split(",").map(h => h.trim());

const groupMatches = [];
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

  groupMatches.push({
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
console.log(`Group stage: ${groupMatches.length} matches from CSV`);

// ── Parse knockout predictions ──
let knockoutMatches = [];
const koPath = "output/knockout-predictions-full.json";
if (fs.existsSync(koPath)) {
  const koData = JSON.parse(fs.readFileSync(koPath, "utf-8"));
  knockoutMatches = koData.map(m => ({
    id: m.matchId,
    num: m.matchNumber,
    date: m.date,
    group: m.round,           // "R32", "R16", "QF", "SF", "3rd", "Final"
    round: m.round,
    home: m.homeTeam,
    away: m.awayTeam,
    homeOfficial: m.homeTeam,
    awayOfficial: m.awayTeam,
    stadium: m.stadium,
    city: m.city,
    country: "United States",
    neutral: true,
    homeWin: m.homeWin,
    draw: m.draw,
    awayWin: m.awayWin,
    score: m.totalScore || m.predictedScore,
    // 90-min regular time (explicit)
    homeWin90: m.homeWin90 || m.homeWin,
    draw90: m.draw90 || m.draw,
    awayWin90: m.awayWin90 || m.awayWin,
    score90: m.score90 || m.predictedScore,
    // Penalty shootout
    homePenalty: m.homePenalty,
    awayPenalty: m.awayPenalty,
    penaltyScore: m.penaltyScore || "",
    totalScore: m.totalScore || m.predictedScore || "",
    isDraw: m.isDraw || false,
    confidence: m.confidence,
    upsetRisk: m.upsetRisk || "low",
    favoriteProb: Math.max(m.homeWin, m.awayWin),
    homeAdvance: m.homeAdvance,
    awayAdvance: m.awayAdvance,
    predictedWinner: m.predictedWinner,
    likelyPath: m.likelyPath || "",
    notes: m.bracketNote || "",
    missingFeatures: m.missingFeatures || "",
    oddsUsed: false,
  }));
  console.log(`Knockout: ${knockoutMatches.length} matches from JSON`);
} else {
  console.log("No knockout predictions found, group stage only.");
}

// ── Merge (group first, then knockout) ──
const allMatches = [...groupMatches, ...knockoutMatches];

// ── Team data from simulation ──
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

const output = {
  generatedAt: new Date().toISOString(),
  totalMatches: allMatches.length,
  matches: allMatches,
  teams,
};

fs.writeFileSync("output/web-data.json", JSON.stringify(output, null, 2));
console.log(`\n✅ Wrote ${allMatches.length} matches (${groupMatches.length} GS + ${knockoutMatches.length} KO) and ${teams.length} teams to output/web-data.json`);
