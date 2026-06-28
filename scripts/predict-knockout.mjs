#!/usr/bin/env node
// Predict knockout matches based on group stage simulation results
import fs from "node:fs";

// ── Load data ──
const teams = JSON.parse(fs.readFileSync("data/processed/team-current.json", "utf-8"));
const sim = JSON.parse(fs.readFileSync("output/tournament-simulation-2026.json", "utf-8"));
const model = JSON.parse(fs.readFileSync("config/calibrated-model.json", "utf-8"));

// ── Elo lookup ──
function getElo(teamName) {
  const t = teams.find(t => t.team === teamName);
  return t ? t.elo : 1500;
}

// ── Elo-based win probability (simplified, neutral venue) ──
function eloPredict(homeElo, awayElo) {
  const diff = homeElo - awayElo;
  const eloCoef = model.params.eloCoef || 0.315;
  const homeCoef = model.params.homeCoef || 0.341;
  const drawBias = model.params.drawBias || -0.15;
  const drawEloPenalty = model.params.drawEloPenalty || 0.045;

  // Home win logit
  const homeLogit = eloCoef * (diff / 400) + homeCoef + drawBias;
  const drawLogit = drawEloPenalty * Math.abs(diff / 400) + drawBias + 0.1;
  const awayLogit = -eloCoef * (diff / 400) + drawBias;

  const expHome = Math.exp(homeLogit);
  const expDraw = Math.exp(drawLogit);
  const expAway = Math.exp(awayLogit);
  const sum = expHome + expDraw + expAway;

  const homeWin = expHome / sum;
  const draw = expDraw / sum;
  const awayWin = expAway / sum;

  return { homeWin, draw, awayWin };
}

function predictScore(homeElo, awayElo, homeWinProb, awayWinProb) {
  const total = homeElo + awayElo;
  const expectedTotal = 2.5;
  const diffFactor = Math.abs(homeElo - awayElo) / 400;
  const homeGoals = Math.round(expectedTotal * (homeWinProb + 0.5 * (1 - diffFactor)));
  const awayGoals = Math.round(expectedTotal * (awayWinProb + 0.5 * (1 - diffFactor)));
  return `${Math.max(0, homeGoals)}-${Math.max(0, awayGoals)}`;
}

// ── Determine group standings by avgPoints ──
function getGroupStandings() {
  const groups = {};
  sim.teams.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });
  // Sort each group by avgPoints descending
  const standings = {};
  for (const [g, members] of Object.entries(groups)) {
    members.sort((a, b) => b.avgPoints - a.avgPoints);
    standings[g] = {
      first: members[0],
      second: members[1],
      third: members[2],
      fourth: members[3],
      all: members
    };
  }
  return standings;
}

// ── Pick top 8 3rd-place teams ──
function getBestThirds(standings) {
  const thirds = [];
  for (const [g, s] of Object.entries(standings)) {
    thirds.push({ group: g, team: s.third });
  }
  thirds.sort((a, b) => b.team.avgPoints - a.team.avgPoints);
  return thirds.slice(0, 8).map(t => t.group).sort();
}

// ── 3rd-place allocation ──
// Each group winner can only face specific 3rd-place groups (from bracket rules)
const WINNER_POSSIBLE_THIRDS = {
  A: ["C","E","F","H","I"],
  B: ["E","F","G","I","J"],
  D: ["B","E","F","I","J"],
  E: ["A","B","C","D","F"],
  G: ["A","E","H","I","J"],
  I: ["C","D","F","G","H"],
  K: ["D","E","I","J","L"],
  L: ["E","H","I","J","K"],
};

function allocateThirds(bestThirds, standings) {
  const winners = Object.keys(WINNER_POSSIBLE_THIRDS);
  const used = new Set();
  const result = {};

  // Greedy assignment: for each winner, pick the highest-ranked available 3rd-placer
  for (const winner of winners) {
    const possible = WINNER_POSSIBLE_THIRDS[winner].filter(g =>
      bestThirds.includes(g) && !used.has(g) && g !== winner
    );
    if (possible.length > 0) {
      // Pick the first available (by ranking order in bestThirds)
      const chosen = bestThirds.find(g => possible.includes(g));
      result[winner] = chosen;
      used.add(chosen);
    }
  }

  // If any winner not assigned, assign remaining bestThirds
  const remaining = bestThirds.filter(g => !used.has(g));
  for (const winner of winners) {
    if (!result[winner] && remaining.length > 0) {
      result[winner] = remaining.shift();
    }
  }

  return result;
}

// ── Build R32 matches ──
function buildR32(standings, allocation) {
  const s = standings; // shorthand
  const a = allocation;

  const matches = [
    { matchNum: 73, round: "R32", home: s.A.second.team, away: s.B.second.team, venue: "洛杉矶体育场", city: "洛杉矶", date: "2026-06-28", note: "A2 vs B2" },
    { matchNum: 74, round: "R32", home: s.E.first.team,  away: s[a.E].third.team,  venue: "波士顿体育场", city: "波士顿", date: "2026-06-28", note: `E1 vs ${a.E}3` },
    { matchNum: 75, round: "R32", home: s.F.first.team,  away: s.C.second.team, venue: "蒙特雷体育场", city: "蒙特雷", date: "2026-06-29", note: "F1 vs C2" },
    { matchNum: 76, round: "R32", home: s.C.first.team,  away: s.F.second.team, venue: "休斯敦体育场", city: "休斯敦", date: "2026-06-29", note: "C1 vs F2" },
    { matchNum: 77, round: "R32", home: s.I.first.team,  away: s[a.I].third.team,  venue: "纽约新泽西体育场", city: "纽约", date: "2026-06-30", note: `I1 vs ${a.I}3` },
    { matchNum: 78, round: "R32", home: s.E.second.team, away: s.I.second.team, venue: "达拉斯体育场", city: "达拉斯", date: "2026-06-30", note: "E2 vs I2" },
    { matchNum: 79, round: "R32", home: s.A.first.team,  away: s[a.A].third.team,  venue: "墨西哥城体育场", city: "墨西哥城", date: "2026-07-01", note: `A1 vs ${a.A}3` },
    { matchNum: 80, round: "R32", home: s.L.first.team,  away: s[a.L].third.team,  venue: "亚特兰大体育场", city: "亚特兰大", date: "2026-07-01", note: `L1 vs ${a.L}3` },
    { matchNum: 81, round: "R32", home: s.D.first.team,  away: s[a.D].third.team,  venue: "旧金山湾区体育场", city: "旧金山", date: "2026-07-02", note: `D1 vs ${a.D}3` },
    { matchNum: 82, round: "R32", home: s.G.first.team,  away: s[a.G].third.team,  venue: "西雅图体育场", city: "西雅图", date: "2026-07-02", note: `G1 vs ${a.G}3` },
    { matchNum: 83, round: "R32", home: s.K.second.team, away: s.L.second.team, venue: "多伦多体育场", city: "多伦多", date: "2026-07-03", note: "K2 vs L2" },
    { matchNum: 84, round: "R32", home: s.H.first.team,  away: s.J.second.team, venue: "洛杉矶体育场", city: "洛杉矶", date: "2026-07-03", note: "H1 vs J2" },
    { matchNum: 85, round: "R32", home: s.B.first.team,  away: s[a.B].third.team,  venue: "温哥华体育场", city: "温哥华", date: "2026-07-01", note: `B1 vs ${a.B}3` },
    { matchNum: 86, round: "R32", home: s.J.first.team,  away: s.H.second.team, venue: "迈阿密体育场", city: "迈阿密", date: "2026-07-02", note: "J1 vs H2" },
    { matchNum: 87, round: "R32", home: s.K.first.team,  away: s[a.K].third.team,  venue: "堪萨斯城体育场", city: "堪萨斯城", date: "2026-07-03", note: `K1 vs ${a.K}3` },
    { matchNum: 88, round: "R32", home: s.D.second.team, away: s.G.second.team, venue: "达拉斯体育场", city: "达拉斯", date: "2026-07-03", note: "D2 vs G2" },
  ];

  return matches;
}

// ── Predict a match ──
function predictMatch(homeTeam, awayTeam, venue, neutral) {
  const homeElo = getElo(homeTeam);
  const awayElo = getElo(awayTeam);
  const probs = eloPredict(homeElo, awayElo);
  const score = predictScore(homeElo, awayElo, probs.homeWin, probs.awayWin);
  const favoriteProb = Math.max(probs.homeWin, probs.awayWin);
  const confidence = favoriteProb > 0.65 ? "high" : favoriteProb > 0.5 ? "medium" : "low";
  const upsetRisk = favoriteProb < 0.45 ? "high" : favoriteProb < 0.55 ? "medium" : "low";

  return {
    homeWin: probs.homeWin,
    draw: probs.draw,
    awayWin: probs.awayWin,
    predictedScore: score,
    confidence,
    upsetRisk,
    favoriteProbability: favoriteProb,
    homeElo,
    awayElo,
  };
}

// ── MAIN ──
console.log("=== 2026 World Cup Knockout Predictions ===\n");

const standings = getGroupStandings();

// Show group results
console.log("📊 Group Outcomes (by avgPoints from 20,000 simulations):\n");
for (const [g, s] of Object.entries(standings).sort()) {
  console.log(`Group ${g}: 1st=${s.first.team}(${s.first.avgPoints.toFixed(1)}pts) 2nd=${s.second.team}(${s.second.avgPoints.toFixed(1)}pts) 3rd=${s.third.team}(${s.third.avgPoints.toFixed(1)}pts)`);
}

const bestThirds = getBestThirds(standings);
console.log(`\n🏅 Best 8 Third-Place Teams: ${bestThirds.join(", ")}`);

const allocation = allocateThirds(bestThirds, standings);
console.log(`\n📋 Third-Place Allocation:`);
for (const [winner, third] of Object.entries(allocation)) {
  console.log(`  Group ${winner} winner vs Group ${third} 3rd (${standings[third].third.team})`);
}

const r32 = buildR32(standings, allocation);

console.log(`\n🏆 R32 Match Predictions:\n`);
const predictions = [];

r32.forEach(m => {
  const pred = predictMatch(m.home, m.away, m.venue, true);
  const fav = pred.homeWin >= pred.awayWin ? m.home : m.away;
  const favProb = (pred.homeWin >= pred.awayWin ? pred.homeWin : pred.awayWin) * 100;

  console.log(`Match ${m.matchNum} | ${m.date} | ${m.round}`);
  console.log(`  ${m.home} vs ${m.away}`);
  console.log(`  Venue: ${m.venue}, ${m.city}`);
  console.log(`  Prob: ${(pred.homeWin*100).toFixed(1)}% / ${(pred.draw*100).toFixed(1)}% / ${(pred.awayWin*100).toFixed(1)}%`);
  console.log(`  Score: ${pred.predictedScore} | ⭐ ${fav} ${favProb.toFixed(1)}% | Confidence: ${pred.confidence} | Upset: ${pred.upsetRisk}`);
  console.log(`  Bracket: ${m.note}`);
  console.log();

  predictions.push({
    matchId: `2026-WC-KO-${String(m.matchNum).padStart(3,'0')}`,
    matchNumber: m.matchNum,
    date: m.date,
    round: m.round,
    homeTeam: m.home,
    awayTeam: m.away,
    stadium: m.venue,
    city: m.city,
    neutral: true,
    homeWin: pred.homeWin,
    draw: pred.draw,
    awayWin: pred.awayWin,
    predictedScore: pred.predictedScore,
    confidence: pred.confidence,
    upsetRisk: pred.upsetRisk,
    favoriteProbability: pred.favoriteProbability,
    bracketNote: m.note,
    modelVersion: "elo-simplified-knockout",
    oddsUsed: false,
    missingFeatures: "odds|marketValue|squadRating",
    matchupNotes: "",
  });
});

// Write JSON output
const outputPath = "output/knockout-predictions.json";
fs.writeFileSync(outputPath, JSON.stringify(predictions, null, 2));
console.log(`✅ Wrote ${predictions.length} knockout predictions to ${outputPath}`);

// Also write a readable report
let report = `# 🏆 2026 世界杯淘汰赛预测报告\n\n`;
report += `生成时间: ${new Date().toISOString()}\n`;
report += `模型: Elo-based simplified knockout prediction\n`;
report += `小组结果来源: 20,000次蒙特卡洛模拟 (avgPoints)\n\n---\n\n`;

report += `## 📊 小组出线结果\n\n`;
for (const [g, s] of Object.entries(standings).sort()) {
  report += `| ${g} 组 | 🥇 ${s.first.team} | 🥈 ${s.second.team} | 🥉 ${s.third.team} |\n`;
}

report += `\n## 🏅 最佳8个小组第三\n\n${bestThirds.join(", ")}\n\n`;
report += `---\n\n## 🏆 R32 淘汰赛预测\n\n`;

predictions.forEach(p => {
  report += `### Match ${p.matchNumber}: ${p.homeTeam} vs ${p.awayTeam}\n\n`;
  report += `| 项目 | 详情 |\n|---|---|\n`;
  report += `| 日期 | ${p.date} |\n`;
  report += `| 轮次 | ${p.round} |\n`;
  report += `| 场地 | ${p.stadium}, ${p.city} |\n`;
  report += `| 对阵说明 | ${p.bracketNote} |\n\n`;
  report += `| 主胜 | 平局 | 客胜 |\n|:---:|:---:|:---:|\n`;
  report += `| ${(p.homeWin*100).toFixed(1)}% | ${(p.draw*100).toFixed(1)}% | ${(p.awayWin*100).toFixed(1)}% |\n\n`;
  report += `| 预测比分 | 置信度 | 爆冷风险 |\n|:---:|:---:|:---:|\n`;
  report += `| ${p.predictedScore} | ${p.confidence === 'high' ? '🟢高' : p.confidence === 'medium' ? '🟡中' : '🔴低'} | ${p.upsetRisk === 'high' ? '🔴高' : p.upsetRisk === 'medium' ? '🟡中' : '🟢低'} |\n\n`;
});

fs.writeFileSync("output/knockout-predictions.md", report);
console.log(`✅ Report written to output/knockout-predictions.md`);
