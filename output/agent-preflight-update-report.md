# Agent 赛前更新报告

生成时间：2026-06-23T05:25:29.684Z

## 执行步骤

| 命令 | 秒数 |
| --- | ---: |
| node scripts/update-realtime-prematch-data.mjs --now 2026-06-23T05:25:09.721Z --refreshStrength false --rerunPredictions false | 9.38 |
| node scripts/update-team-strength-sources.mjs --updatedAt 2026-06-23 | 1.28 |
| node scripts/build-squad-tactical-profiles.mjs --updatedAt 2026-06-23 | 0.43 |
| node scripts/batch-predict-2026.mjs | 8.07 |
| node scripts/simulate-2026.mjs | 0.69 |
| node scripts/generate-report-2026.mjs | 0.1 |

## 数据新鲜度提示

- 赛前状态文件：data/manual/pre-match-update-status.csv
- 缺失赔率 API 标记数量：72
- 状态 CSV 中通用 updated 标记数量：28
- 所有 `needs_verification`、`source_partial` 或 `source_conflict` 行只能作为上下文。
- 除非明确做实时预测，否则不要使用开赛后或比赛中的数据。
