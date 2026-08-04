# 變更紀錄

## 0.6.0

- `init --agent <tool>` 新增 evidence-based proposal，不再只把 inventory 與確定性草稿交給 agent 改寫。
- 新增安全 evidence collector，只抽樣 Git tracked 的設定、文件、代表性原始碼與測試。
- 排除敏感檔名、憑證副檔名、binary、generated、vendor 與大型檔案，並限制單檔、總字元及檔案數。
- 對 private key、AWS access key、GitHub token 與常見 secret assignment 執行高信心遮罩。
- `.ai/evidence/repository-profile.json` 只保存路徑、分類、hash、大小與遮罩統計，不保存原始碼摘錄。
- Proposal agent 從暫存空 Git repository 啟動，避免 CLI 自然掃描目標 repository；高風險環境仍需外部 sandbox。
- AI 新增的 coding style 或架構規範必須引用實際 evidence、提供 confidence 與正反例，且不得直接標記為 `MUST`。
- Agent 若刪除 deterministic rules、引用不存在檔案或輸出不合契約，系統會保留 deterministic proposal 並標記 `UNVERIFIED_OUTPUT`。
- 依 AI 候選規範的 non-compliant example 產生待 owner 審查的 comprehension cases。
- `.ai/REVIEW.md` 新增 proposal agent 狀態、evidence 選檔、截斷、遮罩與安全警告摘要。

## 0.5.0

- 新增 `.ai/REVIEW.md`，將組織規範、repo 提案、ecosystem 掃描、evaluation 與 checks 整合為單一人類審查頁。
- 新增 `agent-policy-kit review`，可在修正底層來源後重新產生整合審查頁。
- 新增 review manifest，保存每個來源檔與整合頁的 SHA-256，防止接受過期或被直接修改的審查內容。
- `accept` 現在要求整合審查頁為 current，並記錄接受前後的來源 digest。
- `status` 新增 `CURRENT`、`STALE`、`MODIFIED`、`MISSING` 或 `ACCEPTED` review 狀態。
- README 新增目前功能矩陣與情境式操作方式，並新增 `docs/WORKING_LOGIC.md` 說明完整資料流與判定邏輯。

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
