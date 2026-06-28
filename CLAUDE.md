# FIFA World Cup 2026 Prediction — Project Guide

## What This Project Is

A FIFA World Cup 2026 match prediction system: statistical models (Elo, FIFA points, market odds, squad ratings) → 72 group match predictions → Monte Carlo tournament simulation → knockout bracket predictions → static web app deployed via GitHub Pages.

**Owner**: You (the user). This is your personal project.
**Deployment**: `docs/index.html` → GitHub Pages (static HTML, no backend server).

## Directory Map

```
FIFASkill/
├── SKILL.md                          # Main skill definition (entry point for agents)
├── CLAUDE.md                         # This file — project guide for Claude
├── web/                              # Web app source
│   ├── index.html                    # Main app (auth gate + predictions UI)
│   └── data.js                       # Static data (flags, team names, etc.)
├── docs/                             # Built output → deployed to GitHub Pages
│   ├── index.html                    # Built copy of web/index.html
│   └── data.js                       # Copy of web/data.js
├── scripts/                          # All Node.js (.mjs) scripts
│   ├── predict-match.mjs             # Single-match prediction
│   ├── batch-predict-2026.mjs        # Predict all 72 group matches
│   ├── simulate-2026.mjs             # 20,000-run Monte Carlo tournament sim
│   ├── predict-all-knockout.mjs      # Predict every knockout match
│   ├── predict-knockout.mjs          # Single knockout match predictor
│   ├── generate-report-2026.mjs      # Generate markdown report
│   ├── build-web-data.mjs            # Bundle predictions → output/web-data.json
│   ├── build-web-html.mjs            # Inject data+auth → web/index.html + docs/index.html
│   ├── generate-codes.mjs            # Auth: manage activation codes
│   ├── update-after-matchday.mjs     # Post-matchday: update standings + re-predict KO
│   ├── agent-preflight-update.mjs    # Pre-prediction data freshness check
│   ├── update-realtime-prematch-data.mjs  # Refresh odds/weather/lineups/injuries
│   ├── update-team-strength-sources.mjs   # Refresh squad values from Transfermarkt
│   ├── build-squad-tactical-profiles.mjs  # Build tactical profiles from squad data
│   ├── merge-external-candidates.mjs      # Merge external AI candidate data
│   ├── validate-external-candidates.mjs   # Validate external AI data before merge
│   ├── build-elo-form.mjs            # Build Elo + recent-form features
│   ├── build-rolling-tendency-features.mjs # Rolling tendency features
│   ├── build-team-tendencies.mjs     # Team tendency profiles
│   ├── merge-fifa-features.mjs       # Merge FIFA ranking features
│   ├── merge-team-strength-data.mjs  # Merge team strength data
│   ├── fit-elo-form.mjs              # Fit Elo+form model
│   ├── fit-elo-fifa-form.mjs         # Fit Elo+FIFA+form model
│   ├── fit-elo-fifa-tendency.mjs     # Fit Elo+FIFA+tendency model
│   ├── tune-robust-candidate.mjs     # Tune robust candidate weights
│   ├── weight-search.mjs             # Weight parameter search
│   ├── clean-odds.mjs                # Clean/process odds data
│   └── import-wc26-package-data.mjs  # Import WC26 package data
├── config/
│   ├── calibrated-model.json         # Model weights (versioned)
│   └── auth.json                     # 🔒 SECRET — auth hashes (NEVER commit)
├── data/
│   ├── manual/                       # Human-maintained CSVs
│   │   ├── wc26-official-group-stage.csv  # 72 group matches schedule
│   │   ├── wc26-teams.csv            # Team info, rankings, coaches
│   │   ├── match-results.csv         # ✏️ Actual results (you edit this post-match)
│   │   ├── match-odds.csv            # Betting odds snapshot
│   │   ├── match-weather.csv         # Weather forecasts
│   │   ├── match-lineups.csv         # Confirmed lineups
│   │   ├── match-injuries.csv        # Injury/suspension data
│   │   ├── team-strength.csv         # FIFA rank/points, squad rating, market value
│   │   ├── team-tactical-profiles.csv # Tactical profiles
│   │   ├── squad-rating-import.csv   # Verified squad ratings
│   │   ├── wc26-injuries.csv         # WC26 injury snapshots
│   │   └── wc26-tournament-winner-odds.csv  # Winner odds
│   ├── processed/                    # Built feature CSVs
│   ├── sample/                       # Sample data for testing
│   ├── fifa_ranking.csv              # Historical FIFA rankings
│   └── results.csv                   # Historical match results
├── output/                           # All generated output
│   ├── match-predictions-2026.csv    # 72 group match predictions
│   ├── match-predictions-2026.json
│   ├── tournament-simulation-2026.json  # 20k-run simulation results
│   ├── tournament-simulation-2026.backup.json  # Pre-update backup
│   ├── group-qualification-2026.csv  # Group qualification probabilities
│   ├── knockout-predictions-full.json # Full knockout bracket predictions
│   ├── web-data.json                 # Bundled data for web app
│   ├── world-cup-2026-report.md      # Full prediction report
│   └── agent-preflight-update-report.md
├── references/                       # Documentation
│   ├── schema.md                     # Data structures
│   ├── data-sources.md               # Data source guide
│   ├── model-calibration.md          # Calibration methodology
│   └── wc26-knockout-bracket-rules.md # Bracket rules
└── 世界杯预测Skill公开详细说明书.md    # Public documentation (Chinese)
```

## Key Workflows

### 1. Generate predictions (full pipeline)

```bash
node scripts/batch-predict-2026.mjs      # Predict 72 group matches
node scripts/simulate-2026.mjs           # 20k Monte Carlo tournament sim
node scripts/predict-all-knockout.mjs    # Predict knockout bracket
node scripts/generate-report-2026.mjs    # Generate markdown report
```

### 2. Build web app

```bash
node scripts/build-web-data.mjs          # Bundle predictions → output/web-data.json
node scripts/build-web-html.mjs          # Inject data+auth → web/index.html + docs/index.html
```

The build script reads `config/auth.json` and injects auth hashes into the HTML. If `config/auth.json` is missing, auth is disabled.

### 3. Pre-prediction data refresh

```bash
node scripts/agent-preflight-update.mjs  # Unified preflight check
```

This refreshes all real-time data, re-runs predictions, simulates, and generates the report all in one command. Always run this before generating new predictions.

### 4. Post-matchday update (DURING World Cup)

After each group match day, you edit `data/manual/match-results.csv` to mark matches as `completed` with actual scores, then:

```bash
node scripts/update-after-matchday.mjs
```

This recalculates group standings (blending actual + predicted results), updates the simulation JSON, re-predicts the knockout bracket, and rebuilds the web app.

### 5. Auth management

```bash
node scripts/generate-codes.mjs --add <name>       # Generate activation code
node scripts/generate-codes.mjs --revoke <name>    # Revoke someone's access
node scripts/generate-codes.mjs --list              # List authorized users
node scripts/generate-codes.mjs --set-password      # Change password
```

Then rebuild: `node scripts/build-web-html.mjs`

See the Security Model section below for details.

## Security Model (Authentication)

Two-layer offline auth for a static HTML app:

| Layer | What | Hash stored in |
|-------|------|---------------|
| Password | `wc2026` (change with `--set-password`) | `config/auth.json` → injected into HTML |
| Activation Code | Unique per person (format: `XXXX-XXXX-XXXX-XXXX`) | `config/auth.json` → injected into HTML |

**Key properties:**
- Passwords alone are NOT sufficient — step 2 requires a valid activation code
- Each person gets a UNIQUE code — if leaked, you know WHO leaked it
- Codes are generated by you via CLI (`generate-codes.mjs`)
- Hashes are embedded at build time (HTML contains no plaintext secrets)
- Device persistence via localStorage (`_fifa2026_auth` token)
- `config/auth.json` is in `.gitignore` — NEVER commit it

## Important Conventions

### File paths in scripts
Most scripts use relative paths from the project root (`D:\claude\FIFASkill`). Run scripts with `cwd` set to the project root.

### ES modules throughout
All scripts use `.mjs` extension — ES module syntax (`import`/`export`). Use `node` (not `ts-node`).

### Static HTML deployment
The web app is a SINGLE HTML file with embedded CSS/JS + one `data.js` helper. No frameworks, no build tools, no npm. The "build" is string replacement in `build-web-html.mjs`.

### Data freshness
- Pre-match predictions: only use data available BEFORE kickoff
- Post-match: `update-after-matchday.mjs` handles blending actuals with predictions
- The `match-results.csv` is YOUR responsibility to update with actual scores

### Team name consistency
Team names in code (e.g., `"Korea Republic"`, `"Czechia"`) follow the internal model convention. Display names (e.g., `"South Korea"`, `"Czech Republic"`) are for UI. Check `data/manual/wc26-official-group-stage.csv` for mappings.

### .gitignore rules
```
node_modules/
.claude/
output/web-data.json
config/auth.json
```

- `output/web-data.json` is gitignored (it's built), but `output/` prediction files ARE committed
- `config/auth.json` MUST NOT be committed (contains password hashes)

## When the User Asks For...

| Request | What to do |
|---------|-----------|
| "预测比赛" / "predict a match" | Run `predict-match.mjs` or the full batch pipeline |
| "更新预测" / "update predictions" | Run `agent-preflight-update.mjs` |
| "添加用户" / "add a user" | `generate-codes.mjs --add <name>` then rebuild |
| "build the site" | `build-web-data.mjs` then `build-web-html.mjs` |
| "赛后更新" / "post-match update" | Edit `match-results.csv` then run `update-after-matchday.mjs` |
| "提交到GitHub" / "commit to github" | Remember: NEVER commit `config/auth.json` |

## Quick Test

To verify everything works after changes:
```bash
node scripts/batch-predict-2026.mjs && node scripts/simulate-2026.mjs && node scripts/predict-all-knockout.mjs && node scripts/build-web-data.mjs && node scripts/build-web-html.mjs
```
