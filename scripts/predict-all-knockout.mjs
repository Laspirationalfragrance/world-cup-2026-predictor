#!/usr/bin/env node
// Full knockout bracket prediction with penalty shootout modeling
// R32 → R16 → QF → SF → 3rd → Final
import fs from "node:fs";

// ── Load data ──
const teams = JSON.parse(fs.readFileSync("data/processed/team-current.json", "utf-8"));
const sim = JSON.parse(fs.readFileSync("output/tournament-simulation-2026.json", "utf-8"));
const model = JSON.parse(fs.readFileSync("config/calibrated-model.json", "utf-8"));

function getElo(teamName) {
  const t = teams.find(t => t.team === teamName);
  if (!t) throw new Error(`Team not found: ${teamName}`);
  return t.elo;
}

const eloCoef = model.params.eloCoef || 0.315;
const drawBias = model.params.drawBias || -0.15;
const drawEloPenalty = model.params.drawEloPenalty || 0.045;

// ── 90-min 3-way probability (neutral venue) ──
function eloPredict(homeElo, awayElo) {
  const diff = homeElo - awayElo;
  const homeLogit = eloCoef * (diff / 400) + drawBias;
  const drawLogit = drawEloPenalty * Math.abs(diff / 400) + drawBias + 0.1;
  const awayLogit = -eloCoef * (diff / 400) + drawBias;
  const expHome = Math.exp(homeLogit);
  const expDraw = Math.exp(drawLogit);
  const expAway = Math.exp(awayLogit);
  const sum = expHome + expDraw + expAway;
  return { homeWin: expHome / sum, draw: expDraw / sum, awayWin: expAway / sum };
}

// ── Penalty Shootout: FIFA 2026 Rules Simulation ──

// Per-kick conversion rate (professional average ~75%, adjusted by Elo)
function kickConvRate(elo, opponentElo) {
  const diff = elo - opponentElo;
  const base = 0.75;
  const adj = (diff / 400) * 0.10;
  return Math.max(0.60, Math.min(0.90, base + adj));
}

// Generate penalty score with realistic FIFA simulation
function predictPenaltyScore(homeElo, awayElo, homePenProb, awayPenProb, matchNum = 0) {
  const homeConv = kickConvRate(homeElo, awayElo);
  const awayConv = kickConvRate(awayElo, homeElo);
  const eloDiff = homeElo - awayElo;
  const absDiff = Math.abs(eloDiff);

  // Seed variety from match number (deterministic)
  const seed = (matchNum * 7 + matchNum % 3 * 13) % 10;
  const seedFrac = seed / 10; // 0.0 .. 0.9

  // Base predictions
  let homeExp = 5 * homeConv;
  let awayExp = 5 * awayConv;

  // Apply Elo-based tilt + seeded variation
  const tilt = eloDiff / 400; // -inf .. +inf
  homeExp += tilt * 1.2 + (seedFrac - 0.45) * 0.8;
  awayExp -= tilt * 1.2 - (seedFrac - 0.45) * 0.8;

  // Round with fractional part for deterministic tiebreaking
  let homeGoals = Math.round(homeExp);
  let awayGoals = Math.round(awayExp);

  // Clamp per-team to [1, 6]
  homeGoals = Math.max(1, Math.min(6, homeGoals));
  awayGoals = Math.max(1, Math.min(6, awayGoals));

  // ── Determine if sudden death needed ──
  let detail = '';
  if (homeGoals === awayGoals) {
    // Tied after 5 → sudden death
    let sdRounds = 0;
    while (homeGoals === awayGoals && sdRounds < 8) {
      sdRounds++;
      if (homePenProb >= awayPenProb && homeConv > 0.55 + sdRounds * 0.04) homeGoals++;
      else if (awayPenProb > homePenProb && awayConv > 0.55 + sdRounds * 0.04) awayGoals++;
      else {
        // Both or neither score
        if (homeConv > 0.65) homeGoals++;
        if (awayConv > 0.65) awayGoals++;
        if (homeGoals === awayGoals && homeConv > 0.75) homeGoals++;
        if (homeGoals === awayGoals && awayConv > 0.75) awayGoals++;
      }
    }
    // Fallback
    if (homeGoals === awayGoals) {
      if (homePenProb >= awayPenProb) homeGoals++; else awayGoals++;
    }
    detail = '突然死亡';
  }

  // Check for early termination
  const gap = Math.abs(homeGoals - awayGoals);
  const maxScore = Math.max(homeGoals, awayGoals);
  if (gap >= 3 && maxScore <= 4) {
    detail = `第${maxScore + 1}轮结束`;
  } else if (gap >= 2 && maxScore <= 3) {
    detail = `第${maxScore + 2}轮结束`;
  } else if (detail === '') {
    detail = maxScore >= 5 ? '5轮结束' : '5轮结束';
  }

  // Ensure winner has strictly more goals
  if (homePenProb >= awayPenProb && homeGoals <= awayGoals) {
    homeGoals = awayGoals + 1;
  } else if (awayPenProb > homePenProb && awayGoals <= homeGoals) {
    awayGoals = homeGoals + 1;
  }

  return {
    score: `${homeGoals}-${awayGoals}`,
    detail,
    homeGoals,
    awayGoals,
    homeConv,
    awayConv,
  };
}

// Penalty shootout overall win probability (for advance calculation)
function penaltyProb(homeElo, awayElo) {
  const diff = homeElo - awayElo;
  const base = 0.55;
  const adj = (diff / 400) * 0.08;
  const pHomeWin = Math.max(0.48, Math.min(0.65, base + adj));
  return { homeWin: pHomeWin, awayWin: 1 - pHomeWin };
}

// Knockout advance = win90 + draw * penaltyWinChance
function calcAdvance(homeWin90, draw, awayWin90, pHomePen, pAwayPen) {
  return {
    homeAdvance: homeWin90 + draw * pHomePen,
    awayAdvance: awayWin90 + draw * pAwayPen,
  };
}

function predictScore90(homeElo, awayElo, homeWin, awayWin, expectedTotal = 2.5) {
  const diffFactor = Math.abs(homeElo - awayElo) / 400;
  const hg = Math.round(expectedTotal * (homeWin + 0.5 * (1 - diffFactor)));
  const ag = Math.round(expectedTotal * (awayWin + 0.5 * (1 - diffFactor)));
  return `${Math.max(0, hg)}-${Math.max(0, ag)}`;
}

function predictMatch(homeTeam, awayTeam, matchNum = 0) {
  const homeElo = getElo(homeTeam);
  const awayElo = getElo(awayTeam);

  // 90-min prediction
  const probs90 = eloPredict(homeElo, awayElo);
  const score90 = predictScore90(homeElo, awayElo, probs90.homeWin, probs90.awayWin);

  // Penalty prediction (if drawn after 90+ET)
  const penProbs = penaltyProb(homeElo, awayElo);

  // Final advance probability
  const advance = calcAdvance(probs90.homeWin, probs90.draw, probs90.awayWin, penProbs.homeWin, penProbs.awayWin);

  const favProb = Math.max(probs90.homeWin, probs90.awayWin);
  const confidence = favProb > 0.55 ? "high" : favProb > 0.4 ? "medium" : "low";
  const upsetRisk = favProb < 0.35 ? "high" : favProb < 0.45 ? "medium" : "low";

  const winner = advance.homeAdvance >= advance.awayAdvance ? homeTeam : awayTeam;

  // Determine most likely path from probabilities (NOT predicted score)
  // This ensures the path text is always consistent with the actual winner
  const maxProb = Math.max(probs90.homeWin, probs90.draw, probs90.awayWin);
  const isDraw = (maxProb === probs90.draw);
  let likelyPath = isDraw
    ? `平局→点球 ${winner} 胜`
    : `${winner} 常规时间胜`;

  // Penalty score (only relevant for drawn matches)
  const penScoreResult = predictPenaltyScore(homeElo, awayElo, penProbs.homeWin, penProbs.awayWin, matchNum || 0);
  const penaltyScore = penScoreResult.score;
  // Total score: 90-min only for regular wins, with penalty suffix for draws
  const totalScore = isDraw ? `${score90} (${penaltyScore}p)` : score90;

  return {
    homeTeam, awayTeam, homeElo, awayElo,
    // 90-min regular time
    homeWin90: probs90.homeWin,
    draw90: probs90.draw,
    awayWin90: probs90.awayWin,
    score90,
    // Penalty shootout (if drawn)
    homePenalty: penProbs.homeWin,
    awayPenalty: penProbs.awayWin,
    penaltyScore,
    totalScore,
    // Final advance
    homeAdvance: advance.homeAdvance,
    awayAdvance: advance.awayAdvance,
    winner,
    winnerElo: winner === homeTeam ? homeElo : awayElo,
    likelyPath,
    isDraw,
    confidence,
    upsetRisk,
  };
}

// ── Determine group standings by avgPoints ──
function getGroupStandings() {
  const groups = {};
  sim.teams.forEach(t => {
    if (!groups[t.group]) groups[t.group] = [];
    groups[t.group].push(t);
  });
  const standings = {};
  for (const [g, members] of Object.entries(groups)) {
    members.sort((a, b) => b.avgPoints - a.avgPoints);
    standings[g] = { first: members[0], second: members[1], third: members[2], fourth: members[3] };
  }
  return standings;
}

function getBestThirds(standings) {
  const thirds = [];
  for (const [g, s] of Object.entries(standings)) {
    thirds.push({ group: g, team: s.third });
  }
  thirds.sort((a, b) => b.team.avgPoints - a.team.avgPoints);
  return thirds.slice(0, 8).map(t => t.group).sort();
}

const WINNER_POSSIBLE_THIRDS = {
  A: ["C","E","F","H","I"], B: ["E","F","G","I","J"],
  D: ["B","E","F","I","J"], E: ["A","B","C","D","F"],
  G: ["A","E","H","I","J"], I: ["C","D","F","G","H"],
  K: ["D","E","I","J","L"], L: ["E","H","I","J","K"],
};

function allocateThirds(bestThirds) {
  const winners = Object.keys(WINNER_POSSIBLE_THIRDS);
  const used = new Set();
  const result = {};
  for (const winner of winners) {
    const possible = WINNER_POSSIBLE_THIRDS[winner].filter(g =>
      bestThirds.includes(g) && !used.has(g) && g !== winner
    );
    if (possible.length > 0) {
      const chosen = bestThirds.find(g => possible.includes(g));
      result[winner] = chosen;
      used.add(chosen);
    }
  }
  const remaining = bestThirds.filter(g => !used.has(g));
  for (const winner of winners) {
    if (!result[winner] && remaining.length > 0) result[winner] = remaining.shift();
  }
  return result;
}

// ── Build R32 match list ──
function buildR32(standings, allocation) {
  const s = standings; const a = allocation;
  return [
    { matchNum: 73, round: "R32", home: s.A.second.team, away: s.B.second.team, date: "2026-06-28", venue: "洛杉矶体育场", city: "洛杉矶", note: "A2 vs B2" },
    { matchNum: 74, round: "R32", home: s.E.first.team,  away: s[a.E].third.team,  date: "2026-06-28", venue: "波士顿体育场", city: "波士顿", note: `E1 vs ${a.E}3` },
    { matchNum: 75, round: "R32", home: s.F.first.team,  away: s.C.second.team,  date: "2026-06-29", venue: "蒙特雷体育场", city: "蒙特雷", note: "F1 vs C2" },
    { matchNum: 76, round: "R32", home: s.C.first.team,  away: s.F.second.team,  date: "2026-06-29", venue: "休斯敦体育场", city: "休斯敦", note: "C1 vs F2" },
    { matchNum: 77, round: "R32", home: s.I.first.team,  away: s[a.I].third.team,  date: "2026-06-30", venue: "纽约新泽西体育场", city: "纽约", note: `I1 vs ${a.I}3` },
    { matchNum: 78, round: "R32", home: s.E.second.team, away: s.I.second.team, date: "2026-06-30", venue: "达拉斯体育场", city: "达拉斯", note: "E2 vs I2" },
    { matchNum: 79, round: "R32", home: s.A.first.team,  away: s[a.A].third.team,  date: "2026-07-01", venue: "墨西哥城体育场", city: "墨西哥城", note: `A1 vs ${a.A}3` },
    { matchNum: 80, round: "R32", home: s.L.first.team,  away: s[a.L].third.team,  date: "2026-07-01", venue: "亚特兰大体育场", city: "亚特兰大", note: `L1 vs ${a.L}3` },
    { matchNum: 81, round: "R32", home: s.D.first.team,  away: s[a.D].third.team,  date: "2026-07-02", venue: "旧金山湾区体育场", city: "旧金山", note: `D1 vs ${a.D}3` },
    { matchNum: 82, round: "R32", home: s.G.first.team,  away: s[a.G].third.team,  date: "2026-07-02", venue: "西雅图体育场", city: "西雅图", note: `G1 vs ${a.G}3` },
    { matchNum: 83, round: "R32", home: s.K.second.team, away: s.L.second.team, date: "2026-07-03", venue: "多伦多体育场", city: "多伦多", note: "K2 vs L2" },
    { matchNum: 84, round: "R32", home: s.H.first.team,  away: s.J.second.team,  date: "2026-07-03", venue: "洛杉矶体育场", city: "洛杉矶", note: "H1 vs J2" },
    { matchNum: 85, round: "R32", home: s.B.first.team,  away: s[a.B].third.team,  date: "2026-07-01", venue: "温哥华体育场", city: "温哥华", note: `B1 vs ${a.B}3` },
    { matchNum: 86, round: "R32", home: s.J.first.team,  away: s.H.second.team,  date: "2026-07-02", venue: "迈阿密体育场", city: "迈阿密", note: "J1 vs H2" },
    { matchNum: 87, round: "R32", home: s.K.first.team,  away: s[a.K].third.team,  date: "2026-07-03", venue: "堪萨斯城体育场", city: "堪萨斯城", note: `K1 vs ${a.K}3` },
    { matchNum: 88, round: "R32", home: s.D.second.team, away: s.G.second.team, date: "2026-07-03", venue: "达拉斯体育场", city: "达拉斯", note: "D2 vs G2" },
  ];
}

// ── MAIN ──
console.log("╔═══════════════════════════════════════════════════╗");
console.log("║  2026 World Cup — Full Knockout (with penalties) ║");
console.log("╚═══════════════════════════════════════════════════╝\n");

const standings = getGroupStandings();
const bestThirds = getBestThirds(standings);
const allocation = allocateThirds(bestThirds);
const s = standings; const a = allocation;

// Show group results
console.log("📊 Group Outcomes:\n");
for (const [g, st] of Object.entries(standings).sort()) {
  console.log(`Group ${g}: 1st=${st.first.team}(${st.first.avgPoints.toFixed(1)}) 2nd=${st.second.team}(${st.second.avgPoints.toFixed(1)}) 3rd=${st.third.team}(${st.third.avgPoints.toFixed(1)})`);
}
console.log(`\n🏅 Best 8 Thirds: ${bestThirds.join(", ")}`);
console.log("📋 Allocation:", JSON.stringify(allocation));

// ── R32 ──
const r32Matches = buildR32(standings, allocation);
console.log("\n━━━ R32 (Round of 32) ━━━\n");

function predictAndLog(matches) {
  return matches.map(m => {
    const pred = predictMatch(m.home, m.away, m.matchNum);
    console.log(`M${m.matchNum} | ${m.date} | ${m.home} vs ${m.away}`);
    console.log(`  90min: ${(pred.homeWin90*100).toFixed(1)}% / ${(pred.draw90*100).toFixed(1)}% / ${(pred.awayWin90*100).toFixed(1)}% → ${pred.score90}`);
    console.log(`  点球: ${(pred.homePenalty*100).toFixed(1)}% / ${(pred.awayPenalty*100).toFixed(1)}%`);
    console.log(`  晋级: ${pred.homeTeam} ${(pred.homeAdvance*100).toFixed(1)}% vs ${pred.awayTeam} ${(pred.awayAdvance*100).toFixed(1)}% → ${pred.winner}`);
    console.log(`  路径: ${pred.likelyPath} | ${pred.confidence}`);
    console.log();
    return { ...m, ...pred };
  });
}

const r32Results = predictAndLog(r32Matches);

// ── Bracket: [matchNum, date, venue, city, [srcA, srcB]] ──
function predictRound(specs, sourceResults, roundName) {
  console.log(`━━━ ${roundName} ━━━\n`);
  const results = [];
  specs.forEach(([matchNum, date, venue, city, [srcA, srcB]]) => {
    const teamA = sourceResults.find(r => r.matchNum === srcA).winner;
    const teamB = sourceResults.find(r => r.matchNum === srcB).winner;
    const pred = predictMatch(teamA, teamB, matchNum);
    console.log(`M${matchNum} | ${date} | ${teamA} vs ${teamB}`);
    console.log(`  90min: ${(pred.homeWin90*100).toFixed(1)}% / ${(pred.draw90*100).toFixed(1)}% / ${(pred.awayWin90*100).toFixed(1)}% → ${pred.score90}`);
    console.log(`  点球: ${(pred.homePenalty*100).toFixed(1)}% / ${(pred.awayPenalty*100).toFixed(1)}%`);
    console.log(`  晋级: ${pred.homeTeam} ${(pred.homeAdvance*100).toFixed(1)}% vs ${pred.awayTeam} ${(pred.awayAdvance*100).toFixed(1)}% → ${pred.winner}`);
    console.log(`  路径: ${pred.likelyPath} | ${pred.confidence}`);
    console.log();
    results.push({ matchNum, round: roundName, date, venue, city, homeTeam: teamA, awayTeam: teamB, ...pred, sourceMatches: [srcA, srcB] });
  });
  return results;
}

const r16Results = predictRound([
  [89, "2026-07-06", "费城林肯金融体育场", "费城", [73, 74]],
  [90, "2026-07-06", "休斯敦NRG体育场", "休斯敦", [75, 76]],
  [91, "2026-07-07", "迈阿密硬石体育场", "迈阿密", [77, 78]],
  [92, "2026-07-07", "亚特兰大梅赛德斯奔驰体育场", "亚特兰大", [79, 80]],
  [93, "2026-07-08", "达拉斯AT&T体育场", "达拉斯", [81, 82]],
  [94, "2026-07-08", "西雅图流明体育场", "西雅图", [83, 84]],
  [95, "2026-07-09", "东卢瑟福大都会人寿体育场", "纽约", [85, 86]],
  [96, "2026-07-09", "福克斯堡吉列体育场", "波士顿", [87, 88]],
], r32Results, "R16");

const qfResults = predictRound([
  [97, "2026-07-11", "洛杉矶SoFi体育场", "洛杉矶", [89, 90]],
  [98, "2026-07-11", "波士顿吉列体育场", "波士顿", [91, 92]],
  [99, "2026-07-12", "堪萨斯城箭头体育场", "堪萨斯城", [93, 94]],
  [100,"2026-07-12", "迈阿密硬石体育场", "迈阿密", [95, 96]],
], r16Results, "QF");

const sfResults = predictRound([
  [101,"2026-07-14", "达拉斯AT&T体育场", "达拉斯", [97, 98]],
  [102,"2026-07-15", "亚特兰大梅赛德斯奔驰体育场", "亚特兰大", [99, 100]],
], qfResults, "SF");

// ── 3rd Place ──
console.log("━━━ 3rd Place ━━━\n");
const sf1 = sfResults[0]; const sf2 = sfResults[1];
const tpHome = sf1.winner === sf1.homeTeam ? sf1.awayTeam : sf1.homeTeam;
const tpAway = sf2.winner === sf2.homeTeam ? sf2.awayTeam : sf2.homeTeam;
const thirdPred = predictMatch(tpHome, tpAway, 103);
console.log(`M103 | 2026-07-18 | ${tpHome} vs ${tpAway}`);
console.log(`  90min: ${(thirdPred.homeWin90*100).toFixed(1)}% / ${(thirdPred.draw90*100).toFixed(1)}% / ${(thirdPred.awayWin90*100).toFixed(1)}% → ${thirdPred.score90}`);
console.log(`  晋级: → ${thirdPred.winner} wins 3rd`);
console.log();
const thirdResult = { matchNum: 103, round: "3rd", date: "2026-07-18", venue: "迈阿密硬石体育场", city: "迈阿密", homeTeam: tpHome, awayTeam: tpAway, ...thirdPred };

// ── Final ──
console.log("━━━ 🏆 FINAL ━━━\n");
const fHome = sf1.winner; const fAway = sf2.winner;
const finalPred = predictMatch(fHome, fAway, 104);
console.log(`M104 | 2026-07-19 | ${fHome} vs ${fAway}`);
console.log(`  90min: ${(finalPred.homeWin90*100).toFixed(1)}% / ${(finalPred.draw90*100).toFixed(1)}% / ${(finalPred.awayWin90*100).toFixed(1)}% → ${finalPred.score90}`);
console.log(`  点球: ${(finalPred.homePenalty*100).toFixed(1)}% / ${(finalPred.awayPenalty*100).toFixed(1)}%`);
console.log(`  晋级: → 🏆 ${finalPred.winner} CHAMPION!`);
console.log();
const finalResult = { matchNum: 104, round: "Final", date: "2026-07-19", venue: "东卢瑟福大都会人寿体育场", city: "纽约", homeTeam: fHome, awayTeam: fAway, ...finalPred };

// ── Collect all predictions ──
const allPredictions = [];

function toPrediction(m) {
  return {
    matchId: `2026-WC-KO-${String(m.matchNum).padStart(3,'0')}`,
    matchNumber: m.matchNum,
    date: m.date,
    round: m.round,
    homeTeam: m.homeTeam || m.home,
    awayTeam: m.awayTeam || m.away,
    stadium: m.venue,
    city: m.city,
    neutral: true,
    // 90-min regular time
    homeWin90: m.homeWin90,
    draw90: m.draw90,
    awayWin90: m.awayWin90,
    score90: m.score90,
    // Penalty (if needed)
    homePenalty: m.homePenalty,
    awayPenalty: m.awayPenalty,
    penaltyScore: m.penaltyScore || "",
    totalScore: m.totalScore || m.score90,
    // Final advance
    homeAdvance: m.homeAdvance,
    awayAdvance: m.awayAdvance,
    predictedWinner: m.winner,
    likelyPath: m.likelyPath,
    // For backward compat
    homeWin: m.homeWin90,
    draw: m.draw90,
    awayWin: m.awayWin90,
    predictedScore: m.totalScore || m.score90,
    confidence: m.confidence,
    upsetRisk: m.upsetRisk,
    favoriteProb: Math.max(m.homeWin90, m.awayWin90),
    homeElo: m.homeElo,
    awayElo: m.awayElo,
    bracketNote: m.note || `R${m.round} match`,
    modelVersion: "elo-knockout-with-penalties-v3",
    oddsUsed: false,
    missingFeatures: "odds|marketValue|squadRating",
    matchupNotes: "",
  };
}

r32Results.forEach(m => allPredictions.push(toPrediction(m)));
r16Results.forEach(m => allPredictions.push(toPrediction(m)));
qfResults.forEach(m => allPredictions.push(toPrediction(m)));
sfResults.forEach(m => allPredictions.push(toPrediction(m)));
allPredictions.push(toPrediction(thirdResult));
allPredictions.push(toPrediction(finalResult));

// ── Write JSON ──
const outPath = "output/knockout-predictions-full.json";
fs.writeFileSync(outPath, JSON.stringify(allPredictions, null, 2));
console.log(`\n✅ Wrote ${allPredictions.length} knockout predictions to ${outPath}`);

// ── Write MD Report ──
const ZH = {
  "Spain":"西班牙","Argentina":"阿根廷","France":"法国","Brazil":"巴西","England":"英格兰",
  "Portugal":"葡萄牙","Netherlands":"荷兰","Germany":"德国","Belgium":"比利时","Switzerland":"瑞士",
  "Uruguay":"乌拉圭","Colombia":"哥伦比亚","Croatia":"克罗地亚","Mexico":"墨西哥",
  "United States":"美国","Morocco":"摩洛哥","Japan":"日本","South Korea":"韩国","Iran":"伊朗",
  "Senegal":"塞内加尔","Egypt":"埃及","Algeria":"阿尔及利亚","Ivory Coast":"科特迪瓦",
  "Turkey":"土耳其","Norway":"挪威","Austria":"奥地利","Czech Republic":"捷克",
  "Scotland":"苏格兰","Canada":"加拿大","Panama":"巴拿马","Paraguay":"巴拉圭",
  "Ecuador":"厄瓜多尔",
};
function zh(n) { return ZH[n] || n; }

let report = `# 🏆 2026 世界杯完整淘汰赛预测报告 (含点球模型)\n\n`;
report += `> 生成: ${new Date().toISOString().split('T')[0]} | 模型: Elo + 点球大战 | 小组: 20,000次模拟\n\n---\n\n`;

report += `## 📊 小组出线\n\n`;
report += `| 小组 | 🥇 | 🥈 | 🥉(晋级) |\n|:---:|:---|:---|:---|\n`;
for (const [g, st] of Object.entries(standings).sort()) {
  const isBest = bestThirds.includes(g) ? " ✅" : "";
  report += `| ${g} | ${zh(st.first.team)} | ${zh(st.second.team)} | ${zh(st.third.team)}${isBest} |\n`;
}

const roundLabels = { "R32":"32强赛","R16":"16强赛","QF":"1/4决赛","SF":"半决赛","3rd":"三四名决赛","Final":"🏆 决赛" };
for (const [round, label] of Object.entries(roundLabels)) {
  const matches = allPredictions.filter(p => p.round === round);
  if (!matches.length) continue;
  report += `\n## ${label}\n\n`;
  matches.forEach(p => {
    report += `### M${p.matchNumber}: ${zh(p.homeTeam)} vs ${zh(p.awayTeam)}\n\n`;
    report += `| 项目 | 详情 |\n|---|---|\n`;
    report += `| 日期 | ${p.date} |\n| 场地 | ${p.stadium} |\n`;
    if (p.bracketNote) report += `| 对阵 | ${p.bracketNote} |\n`;
    report += `\n**常规时间 (90分钟):**\n\n`;
    report += `| ${zh(p.homeTeam)} | 平局 | ${zh(p.awayTeam)} | 预测比分 |\n|:---:|:---:|:---:|:---:|\n`;
    report += `| ${(p.homeWin90*100).toFixed(1)}% | ${(p.draw90*100).toFixed(1)}% | ${(p.awayWin90*100).toFixed(1)}% | ${p.score90} |\n\n`;
    report += `**点球大战 (如需要):** ${zh(p.homeTeam)} ${(p.homePenalty*100).toFixed(1)}% vs ${zh(p.awayTeam)} ${(p.awayPenalty*100).toFixed(1)}%\n\n`;
    report += `**最终晋级:** ${zh(p.homeTeam)} ${(p.homeAdvance*100).toFixed(1)}% vs ${zh(p.awayTeam)} ${(p.awayAdvance*100).toFixed(1)}% → 🏅 ${zh(p.predictedWinner)}\n\n`;
    report += `**最可能路径:** ${p.likelyPath}\n\n`;
  });
}

fs.writeFileSync("output/knockout-predictions-full.md", report);
console.log(`✅ Report written to output/knockout-predictions-full.md`);
