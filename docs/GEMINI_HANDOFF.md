# agent-policy-kit：Gemini 開發交接文件

更新日期：2026-08-03  
目前版本：`0.3.0`  
Repository：`agent-policy-kit`

## 1. 這份文件的用途

這份文件提供給接手開發的 Gemini CLI session。目標是讓新的 session 不需要依賴先前
對話，也能了解：

- 這個工具要解決的問題。
- 目前已完成的架構與功能。
- 已確認的設計決策與安全邊界。
- 如何驗證目前程式碼。
- 下一階段應實作的功能、順序與驗收條件。

開始工作前，Gemini 應完整閱讀本文件、根目錄 `README.md`、`CHANGELOG.md` 及相關
source/tests，不可只根據本文件直接修改程式。

## 2. Repository 目前狀態

建立本文件前確認的狀態：

```text
Branch: main
Working tree: clean
Local main 與 origin/main: 同步
Current commit: 3443d3e feat: add diff-aware policy enforcement
Previous commit: 4d7c93d feat: add policy comprehension evaluations
Version: 0.3.0
Tests: 17 passed, 0 failed
```

重要 commits：

```text
3443d3e feat: add diff-aware policy enforcement
4d7c93d feat: add policy comprehension evaluations
fe7cf76 init commit
5b948ff Initial commit
```

如果實際 checkout 與以上資訊不同，應以 `git status`、`git log` 與目前檔案內容為準，
不要假設這份文件比 repository 新。

## 3. 產品目標

不同 AI coding agent 讀取 repository 規範的方式不同。本工具提供一套平台中立流程：

1. 從 repository 可觀察資訊產生 repo 規範草稿。
2. 由 owner 人工審查並接受 canonical policy。
3. 產生不同 agent 所需的薄型 adapter。
4. 區分「adapter 存在」、「模型確實收到」、「模型理解規範」與「實際產物遵循規範」。
5. 保存可機器判讀、可追溯且不包含完整 prompt/secret 的驗證證據。

核心原則：Markdown 是模型行為引導，不是安全邊界。安全、資料保護與確定性 blocker
必須由權限、sandbox、hooks、secret scanner、測試或 CI 強制執行。

## 4. Canonical policy 與 adapters

目標 repository 初始化後的主要結構：

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
    ├── <tool>-loading.json
    ├── <tool>-comprehension.json
    └── latest-check.json
AGENTS.md
CLAUDE.md
.gemini/settings.json
```

Canonical 人工維護來源：

```text
.ai/ORG_AGENTS.md
.ai/REPO_AGENTS.md
```

根目錄 `AGENTS.md` 是兩者合併後的 generated effective policy，不可直接修改。

工具 adapter：

| 工具 | 載入方式 |
|---|---|
| OpenCode | 根目錄 `AGENTS.md` |
| Pi | 根目錄 `AGENTS.md` |
| Codex | 根目錄 `AGENTS.md` |
| Gemini CLI | `.gemini/settings.json` 的 `context.fileName: "AGENTS.md"` |
| Claude Code | `CLAUDE.md` managed block 中的 `@AGENTS.md` |

雖然公司環境目前只能使用 Gemini，仍應保留其他 adapters 與測試，不可把專案改成
Gemini-only architecture。

## 5. 已完成的 CLI 流程

### 5.1 Policy lifecycle

```bash
agent-policy-kit init
agent-policy-kit accept
agent-policy-kit sync
agent-policy-kit setup --tool gemini
agent-policy-kit status
```

`init` 只產生提案。Owner 必須審查：

```text
.ai/REPO_AGENTS.proposed.md
.ai/evals/cases.json
.ai/evals/expected.json
.ai/checks.json
```

`accept` 才會建立 canonical repo policy、effective `AGENTS.md`，並核准 eval/check suite。

### 5.2 Policy delivery verification

```bash
agent-policy-kit verify --tool gemini
agent-policy-kit verify --tool gemini --live
```

主要狀態：

- `ADAPTER_READY`：靜態傳遞路徑正確，但未證明模型載入。
- `CHALLENGE_CONFIRMED`：模型正確回覆一次性 nonce、policy fingerprint 與抽樣 rule IDs。
- `LOAD_UNVERIFIED`：工具有回應，但證據不足。
- `LOAD_FAILED`／`UNAVAILABLE`：載入或工具執行失敗。

### 5.3 Policy comprehension evaluation

```bash
agent-policy-kit evaluate --tool gemini
agent-policy-kit evaluate --tool gemini --live
```

題目與標準答案分開保存：

```text
.ai/evals/cases.json
.ai/evals/expected.json
```

Live evaluation 會先完成 delivery challenge，才執行情境測試。通過條件：

- 總分至少 90%。
- Critical case 零錯誤。
- Nonce 必須正確。

主要狀態：

- `COMPREHENSION_CONFIRMED`
- `DELIVERY_FAILED`
- `INTERPRETATION_FAILED`
- `EVAL_UNVERIFIED`
- `EVAL_FAILED`

### 5.4 Diff-aware policy checks

```bash
agent-policy-kit check --diff HEAD~1 --dry-run
agent-policy-kit check --diff HEAD~1 --tool gemini
```

`.ai/checks.json` 是經 owner 核准的 deterministic check 設定。目前支援：

- Generated `AGENTS.md` integrity。
- 新增內容中的高信心 private key、AWS access key、GitHub token 格式。
- Repository 的 test、lint、typecheck、build commands。
- Tracked diff 與未被 ignore 的 untracked files。
- `when` glob、severity、timeout 與 rule mapping。

安全措施：

- Command 使用 argv array 執行，不透過 shell。
- Check config 內容改變後必須重新 `check --accept`。
- Policy fingerprint 改變後也必須重新核准 checks。
- 不掃描 symlink 指向的外部內容。
- 不保存完整 command stdout/stderr，只保存 hash、exit code 與 duration。
- 不在 report 中保存偵測到的 secret 值。

Blocker 失敗時 CLI exit code 為 2；warning 失敗不阻擋。

只有指定工具具有相同 policy fingerprint 的 `COMPREHENSION_CONFIRMED` 證據，且實際
blocker 仍失敗時，才分類為 `execution_failure`；否則為
`artifact_nonconformance`。

## 6. 四類失敗診斷

後續功能必須維持以下區分，不得把所有問題都歸因於模型：

| 類型 | 判定 |
|---|---|
| Delivery failure | Adapter、設定、fingerprint 或載入證據失敗 |
| Interpretation failure | 已收到規範，但情境判斷或 rule ID 理解錯誤 |
| Execution failure | 相同 fingerprint 已通過理解測試，但實際 diff 違反 blocker |
| Verification gap | 無法建立可靠或客觀的判定證據 |

## 7. 程式碼導覽

| 檔案 | 責任 |
|---|---|
| `bin/agent-policy-kit.js` | CLI executable 入口與頂層錯誤處理 |
| `src/cli.js` | 參數解析、命令 routing、人類／JSON 輸出與 exit code |
| `src/core.js` | Init、policy sync、adapters、delivery、comprehension、status |
| `src/checks.js` | Checks schema、核准 digest、Git diff、builtins、commands、execution diagnosis |
| `templates/default-org-policy.md` | 預設組織規範範本 |
| `templates/repo-policy-proposal.md` | Repo 規範提案範本 |
| `test/core.test.js` | Policy、adapter、delivery、comprehension tests |
| `test/checks.test.js` | Diff checks、secret、severity、approval、execution diagnosis tests |
| `test/cli.test.js` | CLI JSON contract 與 blocker exit code tests |
| `README.md` | 使用者操作文件與限制 |
| `CHANGELOG.md` | 版本功能紀錄 |

專案採 Node.js ESM，最低 Node.js 18，建議 Node.js 20。目前沒有 npm runtime
dependency。除非必要，不應引入大型 framework。

## 8. 開發環境與驗證

公司電腦取得 repository 後：

```bash
git status
git log --oneline -5
node --version
npm install
npm run lint
npm test
```

預期基準：

```text
Version: 0.3.0
Tests: 17 passed, 0 failed
```

若 Node.js 低於 18，先切換到 Node.js 20，不要為了相容舊 Node 而降低專案要求。

任何修改完成前至少執行：

```bash
npm run lint
npm test
git diff --check
```

Live Gemini tests 需要公司環境已安裝並登入 Gemini CLI。預設 unit/integration tests 不應
依賴網路、真實模型、帳號或 credentials。

## 9. 公司環境只使用 Gemini 時的測試流程

請選擇一個非 production、沒有真實 secret、可以建立 branch 的範例 repository。

```bash
cd /path/to/sample-repo
agent-policy-kit init

# Review proposal、evals、checks

agent-policy-kit accept
agent-policy-kit setup --tool gemini
agent-policy-kit verify --tool gemini
agent-policy-kit verify --tool gemini --live
agent-policy-kit evaluate --tool gemini
agent-policy-kit evaluate --tool gemini --live
agent-policy-kit check --diff HEAD~1 --tool gemini
agent-policy-kit status
```

Gemini adapter 應建立或合併：

```json
{
  "context": {
    "fileName": "AGENTS.md"
  }
}
```

如果原本存在其他 Gemini context filename，工具應停止並要求人工確認，不得默默覆蓋。

建議在 sample repo 準備三個 demo：

1. 正常案例：delivery、comprehension、checks 全部通過。
2. Delivery failure：移除或改錯 Gemini context 設定，確認不會誤判成 interpretation failure。
3. Execution failure：先取得 comprehension evidence，再加入測試用高信心 secret 或讓
   blocker test 失敗，確認診斷為 `execution_failure`。

不得在 demo 中使用真實 credentials。

## 10. 下一階段：PR attestation（建議版本 0.4.0）

下一個垂直切片是把現有三層證據整合成單一、可供 CI／PR review 使用的 attestation。

### 10.1 建議 CLI 契約

```bash
agent-policy-kit attest --tool gemini --diff <git-ref>
agent-policy-kit attest --tool gemini --diff <git-ref> --output .ai-attestation.json
agent-policy-kit attest --tool gemini --diff <git-ref> --json
```

### 10.2 輸入證據

Attestation 只能整合已存在的 artifact，不應自行宣稱模型已遵循：

```text
.ai/generated-manifest.json
.ai/results/gemini-loading.json
.ai/results/gemini-comprehension.json
.ai/results/latest-check.json
Git commit、base ref、changed files 與 working tree 狀態
```

所有 artifact 的 policy fingerprint 必須一致。Check report 的 base、head、tool 與目前
Git 狀態也必須可以關聯。

### 10.3 建議輸出 schema

```json
{
  "schema_version": "1",
  "status": "VERIFIED",
  "tool": "gemini",
  "tool_version": "...",
  "policy_fingerprint": "sha256:...",
  "effective_rule_ids": ["ORG-SAFE-001", "REPO-TEST-001"],
  "git": {
    "base": "origin/main",
    "base_commit": "...",
    "head": "...",
    "dirty": false,
    "changed_files": ["src/example.js"]
  },
  "delivery": {
    "status": "CHALLENGE_CONFIRMED",
    "verified_at": "..."
  },
  "comprehension": {
    "status": "COMPREHENSION_CONFIRMED",
    "score": 1,
    "evaluated_at": "..."
  },
  "checks": {
    "status": "PASSED",
    "blockers_failed": 0,
    "warnings_failed": 0,
    "checked_at": "..."
  },
  "evidence_digests": {
    "loading": "sha256:...",
    "comprehension": "sha256:...",
    "checks": "sha256:..."
  },
  "created_at": "..."
}
```

實際 schema 可以調整，但至少必須包含上述語意。

### 10.4 狀態與阻擋建議

| Attestation 狀態 | 條件 | CLI exit code |
|---|---|---|
| `VERIFIED` | Delivery、comprehension、checks 全部通過且 fingerprint／Git 關聯一致 | 0 |
| `VERIFIED_WITH_WARNINGS` | Blocker 全通過，但有 warning check 失敗 | 0 |
| `UNVERIFIED` | 缺少 delivery/comprehension 證據、工具不可用或證據無法關聯 | 3 |
| `FAILED` | Blocker 失敗、fingerprint 不一致或 artifact 疑似 stale | 2 |

狀態名稱或 exit code 若要改動，必須同步更新 README、tests 與 CHANGELOG。

### 10.5 安全與隱私要求

- 不保存完整 prompt、模型 reasoning、chain-of-thought 或完整對話。
- 不複製原始碼 diff 到 attestation。
- 不保存 command stdout/stderr。
- Evidence artifact 以 digest 關聯。
- 不得因為檔案存在就標記 `VERIFIED`。
- Dirty working tree 若被 check report 納入，必須在 attestation 中明確記錄；如果目前狀態
  已與 check 時不同，attestation 應失敗或標記 stale。
- Tool、policy fingerprint、base ref、head 與 changed file set 必須一致。

### 10.6 建議實作順序

1. 新增 `src/attestation.js`，保持與 `core.js`／`checks.js` 責任分離。
2. 定義 artifact loader 與 schema validation。
3. 重新計算 evidence file digest。
4. 驗證三類 evidence 的 policy fingerprint。
5. 驗證 Git base/head/changed files 與 latest check report 是否仍一致。
6. 產生預設 `.ai-attestation.json`，支援 `--output`。
7. 在 `src/cli.js` 加入 `attest` routing 與 exit codes。
8. 加入 deterministic tests，不呼叫真實 Gemini。
9. 更新 README、CHANGELOG，將版本升為 `0.4.0`。

### 10.7 最低測試案例

- 完整且一致的三層證據產生 `VERIFIED`。
- Warning checks 產生 `VERIFIED_WITH_WARNINGS`，不阻擋。
- 缺 delivery receipt 產生 `UNVERIFIED`。
- Comprehension 不是 confirmed 時不可產生 verified。
- Blocker failure 產生 `FAILED` 與 exit code 2。
- 任一 artifact fingerprint 不一致時失敗。
- Check report 的 base/head/changed files 過期時失敗。
- Evidence file 修改後 digest 會改變。
- Attestation 不包含 secret、command output、prompt 或原始碼內容。
- `--output` 不得無提示覆寫不受管理的既有檔案；需要 drift protection 或明確 `--force`。

### 10.8 驗收條件

- `npm run lint` 通過。
- 所有既有 17 項測試繼續通過。
- 新增 attestation 正反測試。
- `git diff --check` 通過。
- `npm pack --dry-run --json` 包含 `src/attestation.js` 與更新文件。
- `attest --json` 可被 CI 穩定解析。
- 沒有完整模型回覆、prompt、command output 或 secret 被寫入 attestation。

## 11. Attestation 完成後的 backlog

依優先順序建議：

1. 有期限且需 owner 核准的 waiver。
2. OpenSpec risk gate 與 approved spec digest。
3. PR/MR adapter 與 CI job 範本。
4. 中央 organization policy bundle 更新與版本 migration。
5. 第三方 checker/plugin registry，例如 gitleaks、Semgrep、OPA/Conftest。
6. Monorepo/path-scoped policy precedence。
7. 高風險專案的分級 audit retention。

OpenSpec 應管理單次變更的 proposal/spec/design/tasks，不取代長期 organization/repository
policy。

## 12. 已知限制與不可過度宣稱的項目

- 尚未在此開發環境執行真實 Gemini live verification/evaluation。
- 內建 secret scanner 只涵蓋少量高信心格式，不取代專業 secret scanning。
- 自然語言 rule 衝突目前只確定性檢查重複 ID，其餘仍需人工 review。
- Organization policy 目前是 copy + digest pin，尚無中央更新 PR bot。
- Agent-assisted repo proposal 是 best effort，永遠只能產生提案，不能自動成為 canonical。
- `CHALLENGE_CONFIRMED` 只證明特定 session 收到規範。
- `COMPREHENSION_CONFIRMED` 只證明在目前 eval suite 中達標。
- 只有 deterministic checks 能判定實際 artifact conformance。

## 13. 提供給 Gemini 的建議起始 prompt

在 repository 根目錄啟動 Gemini CLI 後，可使用：

```text
請先完整閱讀 @docs/GEMINI_HANDOFF.md、@README.md、@CHANGELOG.md、package.json、
src/cli.js、src/core.js、src/checks.js 與所有 test 檔案。

先執行 git status、git log --oneline -5、node --version、npm run lint、npm test，確認
目前 baseline。不要先修改檔案。

接著依 docs/GEMINI_HANDOFF.md 的「下一階段：PR attestation」實作 0.4.0：
1. 新增 src/attestation.js。
2. 加入 attest CLI 與保守的證據狀態判定。
3. 不保存 prompt、模型 reasoning、完整 command output、secret 或原始碼 diff。
4. 補齊正反測試、README 與 CHANGELOG。
5. 保留 OpenCode、Pi、Codex、Claude adapters，不要改成 Gemini-only。
6. 完成後執行 lint、完整 tests、git diff --check、npm pack dry-run。

先回報你讀到的目前架構、baseline 測試結果與預計修改檔案，再開始實作。
```

## 14. 完成下一階段時的交付格式

Gemini 完成後應回報：

- 實際完成的功能。
- 修改的檔案。
- 新增的狀態與 exit code 契約。
- 實際執行的測試與結果。
- 未執行或仍未驗證的項目。
- 安全與隱私處理方式。
- 建議 commit message。
- 下一個 backlog 項目。

不得只說「完成」而不提供可核對的測試證據。
