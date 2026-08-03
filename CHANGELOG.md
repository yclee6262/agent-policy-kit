# 變更紀錄

## 0.2.0

- 新增 `evaluate --tool <tool> --live`，驗證 agent 是否能把規範套用到具體情境。
- 新增 `.ai/evals/cases.json` 與 `.ai/evals/expected.json`，將題目和評分答案分開管理。
- 新增 `evaluate --init` 與 `evaluate --accept`，讓舊版已初始化的 repository 補上 eval suite。
- 區分 `delivery_failure`、`interpretation_failure` 與 `verification_gap`。
- Comprehension 通過門檻為 90%，且 critical case 不得答錯。
- `status` 新增各工具最近一次 comprehension 狀態。

## 0.1.0

- 建立 `init → accept → sync → setup → verify → status` 基礎流程。
- 支援 OpenCode、Pi、Gemini CLI、Codex 與 Claude Code adapters。
- 新增 policy fingerprint、generated manifest、drift protection 與 live delivery challenge。
