# 變更紀錄

## 0.4.0

- 新增 ecosystem detector registry，正式支援 Node.js、Python、Go、Rust、Java Maven、Java Gradle 與 .NET 專案。
- Inventory 新增向下相容的 `ecosystems` 欄位，記錄 manifest、root、commands、evidence、confidence 與 path scope。
- 支援同一 repository 同時偵測多個語言與多個子專案。
- 自動產生 ecosystem-aware repository rules 與 deterministic checks。
- Command check 新增受限制的 repository-relative `cwd`，禁止解析至 repository 外部。
- Node.js 支援 npm、pnpm、Yarn 與 Bun，優先採用 `packageManager` 或 lockfile 證據。
- Python 只有在 pytest、tox、nox、Ruff 或 mypy 有明確設定／dependency 證據時才產生命令。
- Maven／Gradle 優先使用 repository wrapper；Go、Rust 與 .NET 產生標準 toolchain checks。
- Monorepo checks 只在對應 ecosystem path 發生變更時執行。
- 保留既有 `package` inventory 與 Node.js check IDs，避免破壞舊 repository。
- 將開發交接文件改為工具中立的 `docs/PROJECT_HANDOFF.md`，不指定由特定 agent 接手。

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
