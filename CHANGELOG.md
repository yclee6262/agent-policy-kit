# 變更紀錄

## 0.3.0

- 新增 `check --diff <git-ref>`，依 Git diff 執行已核准的 deterministic checks。
- 新增 `.ai/checks.json` 與 `check --init`、`check --accept` 審查流程。
- 內建 generated policy integrity 與高信心 secret diff 檢查，並納入 untracked files。
- 支援以 argv array 執行 repository test、lint、typecheck 與 build，不透過 shell。
- Blocker 失敗時 CLI 使用 exit code 2；warning 會回報但不阻擋。
- 只有 matching policy fingerprint 已通過 comprehension，產物違規才標記為 `execution_failure`。
- Check 設定或 policy fingerprint 變更後必須重新核准。
- Check report 只保存命令輸出 hash，不保存可能包含敏感資訊的完整 stdout/stderr。

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
