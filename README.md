# agent-policy-kit

為不同 AI coding agent 產生、分發並驗證同一套 repository 規範。

> 目前狀態：可使用的 MVP。支援 OpenCode、Pi、Gemini CLI、Codex 與
> Claude Code。系統會明確區分「adapter 已正確設定」和「實際模型已讀取規範」，
> 不會把檔案存在誤當成 AI 已遵循規範。

## 為什麼需要這個工具

不同 AI coding tool 不一定會讀取相同的規範檔案。如果為每個工具各自維護一份
Markdown，很容易出現內容不一致或規範漂移。

agent-policy-kit 使用兩份 canonical Markdown 作為唯一規範來源，再產生各工具需要的
薄型 adapter：

```text
.ai/ORG_AGENTS.md       組織層級規範（釘選版本）
.ai/REPO_AGENTS.md      repository 專屬規範
          │
          ▼
      AGENTS.md         自動產生的有效規範
       /      \
CLAUDE.md      .gemini/settings.json
```

- OpenCode、Pi、Codex 直接讀取根目錄的 `AGENTS.md`。
- Gemini 透過 `.gemini/settings.json` 將 context filename 設為 `AGENTS.md`。
- Claude 透過自動產生的 `CLAUDE.md` 匯入 `AGENTS.md`。

Markdown 只能引導模型行為，不是安全邊界。Secrets、破壞性命令、受保護路徑及合併
限制仍應由權限、sandbox、hooks、靜態檢查與 CI 強制執行。

## 環境需求

- Node.js 18 以上，建議使用 Node.js 20
- 一般使用情境需要在 Git repository 根目錄執行
- 只有在使用 AI 產生草稿或 live verification 時，才需要安裝對應的 agent CLI

CLI 沒有 npm runtime dependency。

## 開發版本安裝

在本 repository 執行：

```bash
npm install
npm link
agent-policy-kit help
```

也可以不執行 `npm link`，直接呼叫：

```bash
node ./bin/agent-policy-kit.js help
```

## 完整使用流程

### 1. 初始化新的 repository

進入目標 repository 根目錄：

```bash
agent-policy-kit init
```

此命令會：

1. 確認目前位置是 Git repository 根目錄。
2. 建立 `.ai/`、釘選的組織規範、專案資訊及 repository inventory。
3. 依可觀察到的 repository 資訊建立 `.ai/REPO_AGENTS.proposed.md`。
4. 將專案標記為 `NEEDS_REVIEW`，等待 repository owner 審查。

預設提案由確定性掃描產生，不需要 AI 工具。如果要讓已安裝的 agent 根據 inventory
協助改寫草稿，必須明確指定：

```bash
agent-policy-kit init --agent gemini
```

可使用的值為 `opencode`、`pi`、`gemini`、`codex`、`claude`。

外部 agent 執行採 best effort。若 agent 未安裝、未登入或輸出格式不符，工具會保留
原本的確定性草稿並記錄失敗，不會自動接受 AI 產生的內容。

如果公司已有組織規範，可以在初始化時指定：

```bash
agent-policy-kit init --org-policy /path/to/ORG_AGENTS.md
```

### 2. 審查並接受 repository 規範

人工審查：

```text
.ai/REPO_AGENTS.proposed.md
.ai/evals/cases.json
.ai/evals/expected.json
.ai/checks.json
```

每條規範應具備：

- 唯一且穩定的 rule ID
- 可觀察的要求
- 明確的適用範圍
- repository 內的證據來源
- 驗證方式
- 違反後的修復方式
- Check command、severity 與適用範圍是否正確
- Evaluation 情境與 expected answer 是否符合規範

移除無法確認的推測，或清楚標記需要 owner 確認。完成後執行：

```bash
agent-policy-kit accept
```

此命令會建立 `.ai/REPO_AGENTS.md`，並產生有效的根目錄 `AGENTS.md`。若 canonical
規範已存在，預設不會覆寫；只有在人工確認後才能使用 `--force`。

### 3. 產生或修復工具 adapter

設定單一工具：

```bash
agent-policy-kit setup --tool gemini
```

一次設定所有支援工具：

```bash
agent-policy-kit setup --tool all
```

`setup` 會先執行等同 `sync` 的規範同步，再處理工具 adapter：

| 工具 | Adapter 行為 |
|---|---|
| OpenCode | 驗證根目錄 `AGENTS.md`，直接由工具載入 |
| Pi | 驗證根目錄 `AGENTS.md`，直接由工具載入 |
| Codex | 驗證根目錄 `AGENTS.md`，直接由工具載入 |
| Gemini | 將 `context.fileName: "AGENTS.md"` 合併至 `.gemini/settings.json` |
| Claude | 在 `CLAUDE.md` managed block 中加入 `@AGENTS.md` |

Gemini 設定中的其他欄位會被保留。如果已有其他 context filename，工具會停止並要求
人工確認，避免在不知情的情況下載入相互衝突的規範。

若 generated `AGENTS.md` 曾被手動修改，`setup` 和 `sync` 都會停止。請先檢查差異；
只有確認可以捨棄人工修改時才使用：

```bash
agent-policy-kit sync --force
```

### 4. 靜態驗證規範傳遞路徑

```bash
agent-policy-kit verify --tool all
```

靜態驗證會檢查：

- canonical 與 generated 檔案是否存在
- `AGENTS.md` hash 是否符合 manifest
- policy fingerprint 是否一致
- 工具設定是否指向正確檔案
- 是否存在額外的 context 或 instruction file

成功狀態為：

```text
ADAPTER_READY
```

`ADAPTER_READY` 只代表規範傳遞路徑正確，不能證明實際模型已經讀取規範。

### 5. 驗證實際模型是否讀取規範

執行 live challenge：

```bash
agent-policy-kit verify --tool gemini --live
```

驗證問題會要求 agent 回傳：

- 一次性 nonce
- policy fingerprint
- 抽樣的 organization rule ID
- 抽樣的 repository rule ID

結果會寫入：

```text
.ai/results/<tool>-loading.json
```

可能狀態如下：

| 狀態 | 意義 |
|---|---|
| `CHALLENGE_CONFIRMED` | 回覆精確符合 nonce、fingerprint 與抽樣 rule ID |
| `ADAPTER_READY` | 靜態傳遞路徑正確，但未要求 live challenge |
| `LOAD_UNVERIFIED` | 工具有回應，但不足以證明規範已載入 |
| `LOAD_FAILED` | Adapter 或外部工具執行失敗 |
| `UNAVAILABLE` | 對應的 agent CLI 尚未安裝 |

Live challenge 證明的是該次 session 收到規範，不代表之後所有操作都會遵循規範。
實際程式碼仍須由測試、linter、架構檢查與人工 review 驗證。

### 6. 驗證模型是否讀懂規範

`verify --live` 只確認模型能識別 policy fingerprint 與 rule IDs。若要確認模型能否把規範
正確套用到實際情境，執行：

```bash
agent-policy-kit evaluate --tool gemini
```

未加 `--live` 時只驗證 evaluation schema、case IDs、expected answers 及引用的 rule IDs，
成功狀態為 `EVAL_READY`。

執行實際 comprehension evaluation：

```bash
agent-policy-kit evaluate --tool gemini --live
```

流程如下：

1. 先執行 delivery challenge。
2. Delivery 成功後，才把 `.ai/evals/cases.json` 中的情境交給 agent。
3. Agent 必須選擇決策並列出依據的 rule IDs。
4. Evaluator 使用未放入 prompt 的 `.ai/evals/expected.json` 評分。
5. 總分至少 90%，且 critical case 不得答錯，才算通過。

Evaluation 會區分以下狀態：

| 狀態 | 診斷 | 意義 |
|---|---|---|
| `COMPREHENSION_CONFIRMED` | 通過 | Delivery 成功且情境判斷達標 |
| `DELIVERY_FAILED` | `delivery_failure` | Adapter、fingerprint 或載入證據失敗，尚不能判斷理解能力 |
| `INTERPRETATION_FAILED` | `interpretation_failure` | 已收到規範，但情境決策或 rule ID 判斷錯誤 |
| `EVAL_UNVERIFIED` | `verification_gap` | 回覆格式或 nonce 無法建立可靠證據 |
| `EVAL_FAILED` | 執行失敗 | 外部 agent 執行錯誤或逾時 |

結果保存於：

```text
.ai/results/<tool>-comprehension.json
```

`cases.json` 與 `expected.json` 會在 `init` 時產生草稿，並在 `accept` 時一同標記為
`ACTIVE`。Repository owner 應確認情境確實符合目前規範；規範變更後也必須同步更新 eval。

若 repository 是由舊版 agent-policy-kit 初始化、尚未包含 `.ai/evals/`，可以單獨建立：

```bash
agent-policy-kit evaluate --init

# 人工審查 .ai/evals/cases.json 與 expected.json

agent-policy-kit evaluate --accept
agent-policy-kit evaluate --tool all
```

### 7. 驗證實際產物是否遵循規範

Delivery 與 comprehension 通過後，仍需檢查實際 diff。`init` 會根據有效 rules 與
repository scripts 產生：

```text
.ai/checks.json
```

新 repository 在執行主要 `accept` 時會一併核准 checks。若是舊版已初始化的
repository，可以單獨建立：

```bash
agent-policy-kit check --init

# 人工審查 .ai/checks.json

agent-policy-kit check --accept
```

執行 diff-aware checks：

```bash
agent-policy-kit check --diff HEAD~1
```

`--diff` 接受可解析為 commit 的 Git ref。檢查範圍包含該 commit 到目前 working tree 的
tracked diff，也包含未被 `.gitignore` 排除的 untracked files。

若要在不執行 repository command 的情況下先查看執行計畫：

```bash
agent-policy-kit check --diff HEAD~1 --dry-run
```

目前支援的 checks：

| 類型 | 行為 |
|---|---|
| `policy-integrity` | 驗證 generated `AGENTS.md` 與 manifest hash |
| `secret-diff` | 掃描新增內容中的 private key、AWS access key 與 GitHub token 高信心格式 |
| `command` | 依 argv array 執行 test、lint、typecheck 或 build，不透過 shell |

`checks.json` 的每個 check 都包含 rule mapping、severity、`when` glob、執行方式與 timeout。
修改命令、嚴重度或其他 check 內容後，必須重新執行 `check --accept`。Policy fingerprint
改變後也必須重新確認 checks 仍然適用。

結果狀態：

| 狀態 | 行為 |
|---|---|
| `PASSED` | 所有適用 checks 通過 |
| `WARNINGS` | Warning check 失敗，但不阻擋；CLI exit code 維持 0 |
| `BLOCKED` | 至少一個 blocker 失敗；CLI exit code 為 2 |
| `PLANNED` | 使用 `--dry-run`，repository commands 尚未執行 |

若指定工具：

```bash
agent-policy-kit check --diff HEAD~1 --tool gemini
```

只有該工具針對相同 policy fingerprint 已得到 `COMPREHENSION_CONFIRMED`，而 blocker
仍失敗時，診斷才會是 `execution_failure`。沒有理解證據時只會標記
`artifact_nonconformance`，不會武斷宣稱是 AI 執行失敗。

結果保存於：

```text
.ai/results/latest-check.json
```

報告會保存 command、exit code、duration 與輸出 hash，不保存完整 stdout/stderr 或偵測到
的 secret 值。內建 secret regex 只是 MVP 的高信心檢查，正式環境仍應搭配 gitleaks、
GitHub secret scanning 或公司既有掃描器。

### 8. 查看目前狀態

```bash
agent-policy-kit status
```

輸出包含：

- canonical 與 generated 檔案狀態
- 目前 policy fingerprint
- effective rule IDs
- 每個工具的 adapter 狀態
- 每個工具最近一次 verification 結果
- 每個工具最近一次 comprehension evaluation 結果
- 最近一次 policy check 狀態與診斷

主要命令都支援 `--json`，方便後續串接 CI 或其他自動化：

```bash
agent-policy-kit status --json
```

## 最短使用範例

```bash
cd /path/to/target-repo

agent-policy-kit init

# 人工審查 .ai/REPO_AGENTS.proposed.md

agent-policy-kit accept
agent-policy-kit setup --tool all
agent-policy-kit verify --tool all
agent-policy-kit verify --tool codex --live
agent-policy-kit evaluate --tool codex --live
agent-policy-kit check --diff HEAD~1 --tool codex
agent-policy-kit status
```

完成 setup 後，直接從 repository 根目錄啟動原本的 AI 工具即可：

```bash
codex
# 或 gemini、opencode、pi、claude
```

agent-policy-kit 目前負責產生、傳遞與驗證規範，不會包住整個 AI 工作 session。

## 指令參考

```text
agent-policy-kit init [--agent <tool>] [--org-policy <file>] [--force] [--json]
agent-policy-kit accept [--force] [--json]
agent-policy-kit sync [--force] [--json]
agent-policy-kit setup --tool <tool|all> [--force] [--json]
agent-policy-kit verify --tool <tool|all> [--live] [--json]
agent-policy-kit evaluate --init [--force] [--json]
agent-policy-kit evaluate --accept [--json]
agent-policy-kit evaluate --tool <tool|all> [--live] [--json]
agent-policy-kit check --init [--force] [--json]
agent-policy-kit check --accept [--json]
agent-policy-kit check --diff <git-ref> [--tool <tool>] [--dry-run] [--json]
agent-policy-kit status [--json]
```

也可以使用較短的 binary alias：`apk-policy`。

## 產生的 repository 結構

```text
.ai/
├── ORG_AGENTS.md
├── REPO_AGENTS.proposed.md
├── REPO_AGENTS.md
├── inventory.json
├── project.json
├── policy-lock.json
├── generated-manifest.json
├── checks.json
├── evals/
│   ├── cases.json
│   └── expected.json
└── results/
AGENTS.md
CLAUDE.md
.gemini/settings.json
```

`.ai/ORG_AGENTS.md` 和 `.ai/REPO_AGENTS.md` 是 canonical 規範來源。
`AGENTS.md` 是完全自動產生的檔案，不應手動修改。`CLAUDE.md` 和 Gemini settings
只管理特定區塊或欄位，其他既有設定會盡量保留。

## Rule 格式

MVP 使用一般 Markdown，讓所有支援的 agent 能讀取相同內容。Rule heading 需要穩定 ID：

```markdown
### [REPO-TEST-001] 執行 repository 測試

- Severity: MUST
- Applies to: 原始碼變更
- Requirement: 宣告工作完成前，必須執行 `npm test`。
- Evidence: `package.json` 定義了 test script。
- Verification: `npm test` 必須以狀態碼 0 結束。
- Recovery: 修復失敗，或明確記錄經核准的例外。
```

- 組織規範使用 `ORG-*` ID。
- Repository 規範使用 `REPO-*` ID。
- ID 重複時 `sync` 會失敗。
- 組織規範優先，repository 不得重新定義或弱化組織規範。

欄位名稱保留英文是為了讓未來的 parser、CI 與不同語言的規範內容共用同一契約；欄位值與
規範本文可以使用繁體中文。

## 開發與測試

```bash
npm test
npm run lint
```

整合測試會建立暫時性的 Git repository，涵蓋：

- 初始化與規範接受流程
- 五種工具 adapter
- generated manifest integrity
- 靜態 verification
- Evaluation schema、scoring 與 critical case
- Delivery failure 與 interpretation failure 的分類
- Diff-aware blocker／warning checks 與 CLI exit code
- Tracked 與 untracked secret detection
- Matching comprehension evidence 下的 execution failure 分類
- Checks 或 policy 變更後要求重新核准
- `AGENTS.md` 人工修改後的 drift protection
- Gemini context 衝突
- Claude managed block 保留既有內容
- 重複 rule ID

Live agent 測試需要帳號、認證且結果不具確定性，因此未放入預設 test suite。

可參考 [`examples/sample-repo`](./examples/sample-repo/README.md) 查看簡化範例。

## MVP 尚未涵蓋的範圍

- 組織規範目前以複製和 digest 釘選管理，尚未自動建立中央 policy bundle 更新 PR。
- Live challenge parser 採保守判定；即使人工看起來正確，也可能標記為
  `LOAD_UNVERIFIED`。
- 自然語言規範衝突仍需人工 review；目前只確定性阻擋重複 rule ID。
- 目前已涵蓋 policy delivery、情境式理解測試與第一版 diff-aware enforcement。
  Waiver、OpenSpec gate、PR attestation、第三方 checker plugin 與中央 policy update PR
  屬於下一階段。

## 參考資料

- [AGENTS.md](https://agents.md/)
- [OpenCode rules](https://opencode.ai/docs/rules/)
- [Pi context files](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent#context-files)
- [Gemini CLI context files](https://geminicli.com/docs/cli/gemini-md/)
- [Codex AGENTS.md](https://developers.openai.com/codex/guides/agents-md/)
- [Claude Code memory](https://docs.anthropic.com/en/docs/claude-code/memory)
