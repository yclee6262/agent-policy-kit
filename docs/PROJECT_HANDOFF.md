# Agent Policy Kit 專案背景與開發交接

更新日期：2026-08-04
目前版本：`0.5.0`
目前主要分支：`main`

> 這是一份提供給接手開發的 AI 助手閱讀的專案背景文件，不是使用者操作手冊。
> 閱讀者不需要知道先前對話，也不應假設這份文件可以取代實際程式碼與測試。

## 一、專案目的

團隊可能同時使用 Gemini、Claude Code、Codex、OpenCode、Pi 等 AI coding agent。
不同工具讀取 repository 規範的檔名、階層與載入方式不同，如果分別維護多份 Markdown，
很容易發生內容不一致、過期或規範漂移。

Agent Policy Kit 的目標是建立一套平台中立的規範治理方法，讓團隊可以：

1. 只維護一套 organization 與 repository 規範來源。
2. 為不同 AI 工具產生薄型 adapter，而不是各自維護完整規範。
3. 確認 AI 是否真的收到規範。
4. 確認 AI 是否能把規範正確套用到具體情境。
5. 檢查 AI 產生的實際程式碼或 diff 是否符合規範。
6. 區分「沒看到」、「看到了但理解錯」、「理解了但執行錯」及「無法可靠驗證」。
7. 保存可供 review、CI 與稽核使用的最小必要證據。

## 二、核心設計原則

### 1. 單一規範來源

Organization 與 repository 規範是唯一需要人工維護的 canonical policy：

```text
.ai/ORG_AGENTS.md
.ai/REPO_AGENTS.md
```

根目錄 `AGENTS.md` 是兩者合併後的 generated effective policy，不應手動修改。

### 2. 平台中立

核心資料格式、狀態與驗證邏輯不能依賴單一 Git 平台或單一 AI provider。即使某個環境
某個環境即使只能使用其中一種 agent，也不能移除其他工具的相容設計。

### 3. 規範傳遞與產物驗證分離

AI 能回答規範內容，不代表它產生的程式碼一定符合規範。因此證據分成三層：

```text
Delivery evidence
    ↓
Comprehension evidence
    ↓
Artifact / diff checks
```

### 4. Markdown 不是安全邊界

Markdown 只能引導模型。Secret、破壞性命令、受保護路徑、架構紅線與合併條件，仍應由
權限、sandbox、hooks、secret scanner、測試及 CI 強制執行。

### 5. 保守地宣稱驗證結果

沒有足夠證據時，狀態必須是 `unverified` 或其他明確的失敗狀態，不能因為檔案存在或
模型自稱已遵循，就標記為成功。

### 6. Blocker 必須可確定驗證

只有安全、資料保護及可由 deterministic check 穩定判斷的規範才能阻擋。依賴 LLM
主觀評分的規範應先保持 warning 或 advisory。

## 三、規範與 adapter 架構

目標 repository 初始化後的資料結構：

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

各工具 adapter：

| 工具 | 規範載入方式 |
|---|---|
| Gemini | `.gemini/settings.json` 指向 `AGENTS.md` |
| Claude Code | `CLAUDE.md` 匯入 `AGENTS.md` |
| Codex | 直接讀取 `AGENTS.md` |
| OpenCode | 直接讀取 `AGENTS.md` |
| Pi | 直接讀取 `AGENTS.md` |

Adapter 只處理工具差異，不應複製或重新定義完整規範內容。

## 四、規範格式

每條規範以穩定 rule ID 管理：

```markdown
### [REPO-TEST-001] 執行 repository 測試

- Severity: MUST
- Applies to: 原始碼變更
- Requirement: 宣告工作完成前，必須執行 repository test。
- Evidence: package.json 定義 test script。
- Verification: Test command 必須成功結束。
- Recovery: 修復失敗，或明確標記仍未驗證。
```

Organization rule 使用 `ORG-*`，repository rule 使用 `REPO-*`。Organization 規範
優先，repository 不得重新定義或弱化 organization 規範。

## 五、失敗診斷模型

專案明確區分四類失敗：

| 類型 | 判定方式 | 主要處理方向 |
|---|---|---|
| Delivery failure | Adapter、設定、fingerprint 或載入證據失敗 | 修正檔案產生、工具設定或啟動位置 |
| Interpretation failure | 已收到規範，但情境判斷或 rule ID 理解錯誤 | 改善規範邊界、範例、優先級或文字 |
| Execution failure | 已通過相同 policy 的理解測試，但實際產物違反 blocker | 加強 deterministic checks、hooks 或權限 |
| Verification gap | 無法建立可靠、客觀或可重現的證據 | 保持 warning，補上 checker 或人工批准點 |

不得把所有錯誤都簡化成「模型不聽話」。

## 六、目前完成進度

### Version 0.1.0：Policy 與 adapters

已完成：

- 掃描 repository manifests、測試、CI 與目錄資訊。
- 產生 repository policy 草稿，但不自動接受 AI 產生的內容。
- 合併 organization 與 repository policy。
- 產生 policy fingerprint 與 generated manifest。
- 支援 Gemini、Claude、Codex、OpenCode、Pi adapters。
- Generated file drift protection。
- 靜態 adapter verification。
- Live nonce／fingerprint／rule ID challenge。

### Version 0.2.0：Comprehension evaluation

已完成：

- 將 evaluation cases 與 expected answers 分開保存。
- Live evaluation 前先完成 delivery challenge。
- Agent 必須依情境選擇決策並引用 rule IDs。
- 通過門檻為 90%，critical case 不得答錯。
- 區分 delivery、interpretation 與 verification gap。
- Policy 變更後可檢查 evaluation 是否引用過期 rule ID。

### Version 0.3.0：Diff-aware enforcement

已完成：

- 依 Git diff 選擇適用 checks。
- 將未被 ignore 的 untracked files 納入檢查。
- Generated policy integrity check。
- 高信心 private key、AWS access key、GitHub token pattern 檢查。
- Test、lint、typecheck、build command checks。
- Blocker、warning、advisory 分級。
- Blocker 失敗時使用非零 exit code，warning 不阻擋。
- Command 使用 argv array，不透過 shell。
- 不保存完整 command output 或偵測到的 secret 值。
- Check 設定或 policy fingerprint 變更後必須重新核准。
- 只有相同 fingerprint 已通過 comprehension，產物仍違規時才標記
  `execution_failure`。

### Version 0.4.0：Multi-language ecosystem support

已完成：

- 建立獨立 ecosystem detector registry，不把語言判斷持續堆入 `core.js`。
- 正式偵測 Node.js、Python、Go、Rust、Java Maven、Java Gradle 與 .NET。
- Inventory 新增向下相容的 `ecosystems` array。
- 每個 ecosystem 記錄 root、manifests、commands、evidence、confidence 與 path scope。
- 支援同一 monorepo 內多語言、多子專案的規範與 checks。
- Node.js 支援 npm、pnpm、Yarn 與 Bun。
- Python 只有在 pytest、tox、nox、Ruff 或 mypy 有明確證據時產生命令。
- Maven 與 Gradle 優先使用 repository wrapper。
- Go、Rust 與 .NET 產生對應的標準 toolchain checks。
- Command check 支援受限制的 repository-relative `cwd`，不可解析到 repository 外。
- 不同 ecosystem command 只在對應 path 發生變更時執行。
- 保留舊版 `package` inventory 與單一 root Node.js check IDs。

### Version 0.5.0：Integrated review packet

已完成：

- `init` 自動產生唯一需要完整閱讀的 `.ai/REVIEW.md`。
- 審查頁整合 organization policy、repo proposal、ecosystem 掃描、evaluations 與 checks。
- `review` command 可在修正機器來源後重新產生審查頁。
- Review manifest 保存來源與審查頁 SHA-256，`accept` 拒絕 stale 或被直接修改的內容。
- Review acceptance 保存接受前與接受後 digest，區分合法啟用轉換與後續人工 drift。
- `status` 顯示 review packet 的 current、stale、modified、missing 或 accepted 狀態。

## 七、目前程式架構

| 檔案 | 主要責任 |
|---|---|
| `bin/agent-policy-kit.js` | Executable 入口與頂層錯誤處理 |
| `src/cli.js` | 參數解析、command routing、輸出與 exit code |
| `src/core.js` | Repository inventory、policy、adapters、delivery、comprehension、status |
| `src/checks.js` | Check schema、Git diff、builtins、command execution、execution diagnosis |
| `src/review.js` | 單一審查頁、來源 digest、drift 驗證與接受證據 |
| `src/ecosystems/` | 各語言 detector、manifest evidence、commands、cwd 與 path scope |
| `templates/default-org-policy.md` | 預設 organization policy |
| `templates/repo-policy-proposal.md` | Repository policy 提案範本 |
| `test/core.test.js` | Policy、adapter、delivery、comprehension tests |
| `test/checks.test.js` | Diff、secret、severity、approval 與 execution tests |
| `test/ecosystems.test.js` | 多語言 detection、monorepo、wrapper 與 no-guessing tests |
| `test/cli.test.js` | CLI machine-readable contract 與 exit code tests |
| `README.md` | 使用者文件 |
| `CHANGELOG.md` | 版本變更紀錄 |

技術條件：

- Node.js ESM。
- 最低 Node.js 18，建議 Node.js 20。
- 目前沒有 npm runtime dependency。
- 文件以繁體中文為主。
- JSON 欄位、rule ID 與狀態名稱保留英文，維持自動化介面穩定。

## 八、目前程式基準

建立本文件前確認：

```text
Current version: 0.5.0
Tests: run the full suite and use the latest result as the source of truth.
Multi-language support is committed; integrated review work must be verified with git status and git log.
```

如果實際 repository 狀態不同，應以目前 checkout、Git history 與測試結果為準。

## 九、已知限制

- 尚未在目前開發環境完成真實 agent live verification 與 comprehension evaluation。
- 內建 secret scanner 只處理少數高信心格式，不能取代 gitleaks 或正式 secret scanning。
- 自然語言規範衝突目前只確定性檢查重複 ID，其餘仍需人工 review。
- Organization policy 目前是 copy + digest pin，尚無中央 policy update bot。
- Agent 產生的 repo policy 永遠只是提案，仍需 owner 接受。
- 尚無有期限的 waiver。
- 尚未整合 OpenSpec risk gate。
- 尚未產生可直接附在 PR/MR 的完整 attestation。
- 尚無 GitHub／GitLab CI template 或 dashboard。
- Python detector 採保守的設定文字與 dependency 證據，不是完整 TOML dependency resolver。
- 複雜 Maven、Gradle 或 Cargo nested workspace 仍需 owner review 自動產生的 path scope。

## 十、下一階段目標：PR Attestation

下一個建議版本為 `0.6.0`。目標是把目前分散的執行證據整合為一份可供 CI 與 reviewer
判讀的 attestation。

### Attestation 應整合的資訊

- Tool 名稱與版本。
- Policy fingerprint。
- Effective rule IDs。
- Git base、head、changed files 與 working tree 狀態。
- Delivery verification 狀態。
- Comprehension evaluation 狀態與分數。
- Policy check 狀態、blocker 與 warning 數量。
- 每份 evidence artifact 的 digest。
- 產生時間。

### 建議狀態

| 狀態 | 條件 |
|---|---|
| `VERIFIED` | Delivery、comprehension 與 checks 全部通過，且所有關聯一致 |
| `VERIFIED_WITH_WARNINGS` | Blocker 全部通過，但存在 warning |
| `UNVERIFIED` | 缺少必要證據、工具不可用或無法可靠關聯 |
| `FAILED` | Blocker 失敗、fingerprint 不一致或 evidence 已過期 |

### 安全與隱私要求

Attestation 不得包含：

- 完整 prompt 或對話。
- Chain-of-thought 或模型內部 reasoning。
- 原始碼 diff 副本。
- 完整 command stdout/stderr。
- Secret 值。

只能以必要 metadata 與 digest 關聯 evidence。

### 建議程式結構

新增獨立模組，例如：

```text
src/attestation.js
test/attestation.test.js
```

不要把所有邏輯繼續堆入 `core.js`。

### 最低測試案例

1. 三層證據完整且 fingerprint 一致，結果為 `VERIFIED`。
2. 只有 warning failure，結果為 `VERIFIED_WITH_WARNINGS`。
3. 缺少 delivery evidence，結果為 `UNVERIFIED`。
4. Comprehension 尚未 confirmed，不得得到 verified。
5. Blocker failure，結果為 `FAILED`。
6. 任一 evidence fingerprint 不一致，結果為 `FAILED`。
7. Git head、base 或 changed files 與 check report 不一致時，結果為 stale／failed。
8. Evidence file 被修改後 digest 必須改變。
9. 輸出不得包含 prompt、command output、secret 或原始碼內容。
10. 既有所有測試必須繼續通過。

### 驗收條件

- Attestation 狀態判定保守，不因檔案存在就標記成功。
- 所有 evidence 使用相同 policy fingerprint。
- Git 與 check report 可可靠關聯。
- Machine-readable schema 穩定。
- 有完整正反測試。
- README 與 CHANGELOG 更新。
- 版本提升到 `0.6.0`。

## 十一、後續 roadmap

PR attestation 完成後，建議順序：

1. 有期限、需 owner 核准且可追溯的 waiver。
2. OpenSpec risk classification 與 approved spec digest。
3. GitHub／GitLab PR 或 MR adapter。
4. CI templates 與 required check 契約。
5. 中央 organization policy bundle 更新與 migration。
6. 第三方 checker registry，例如 gitleaks、Semgrep、OPA/Conftest。
7. Monorepo 與 path-scoped policy precedence。
8. 高風險專案的分級 audit retention。

OpenSpec 應管理單次變更的 proposal、spec、design、tasks 與驗收，不取代長期工程規範。

## 十二、接手開發時應遵守的工作方式

接手的 AI 助手應：

1. 先檢查實際 repository、Git history 與測試，不直接相信文件中的舊狀態。
2. 先說明理解到的架構、預計修改範圍與驗證方法。
3. 保持平台中立，不把架構改成只支援單一 agent。
4. 保持 machine-readable 欄位與狀態相容。
5. 不降低 blocker 的證據要求。
6. 不把 LLM 主觀判斷當作安全強制機制。
7. 不保存 prompt、reasoning、完整 command output、secret 或不必要的原始碼副本。
8. 為成功、失敗、缺證據及 stale evidence 加入測試。
9. 清楚回報實際執行的測試與仍未驗證的項目。
10. 將大型功能拆成可獨立 review 與回滾的 commit。

## 十三、給接手 AI 的任務摘要

目前專案已完成：

```text
Canonical policy
→ Tool adapters
→ Delivery verification
→ Comprehension evaluation
→ Diff-aware deterministic checks
→ Multi-language ecosystem detection
→ Integrated single-file review packet
```

下一步要完成：

```text
Existing evidence
→ Validate fingerprint and Git linkage
→ Produce privacy-preserving PR attestation
→ Add deterministic positive and negative tests
```

在修改前，請先閱讀實際 source、tests、README 與 CHANGELOG，確認基準後再實作。
