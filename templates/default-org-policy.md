# 組織層級 AI Agent 規範

Policy version: 0.1.0

這是 agent-policy-kit 內建的起始組織規範。正式導入時，應替換成已經過公司審查的規範。

## 優先順序

組織規範的優先級高於 repository 規範。Repository 可以增加更嚴格的要求，但不得弱化或
重新定義任何 `ORG-*` rule。

## 規範

### [ORG-SAFE-001] 保護憑證與敏感資料

- Severity: MUST NOT
- Applies to: 所有檔案與命令
- Requirement: 不得將憑證、token、private key 或敏感資料加入版本控制或 agent transcript。
- Evidence: 組織資訊安全基準
- Verification: secret scanning 與人工 review
- Recovery: 撤銷外洩憑證，依核准的事件處理流程移除資料，並通知資安 owner。

### [ORG-SAFE-002] 未經授權不得執行破壞性操作

- Severity: MUST NOT
- Applies to: filesystem、Git history、database 與遠端系統
- Requirement: 除非使用者明確授權具體操作，否則不得刪除重要資料、重寫共用歷史或修改遠端系統。
- Evidence: 組織安全操作基準
- Verification: command audit 與人工 review
- Recovery: 立即停止操作、保存證據、使用核准的復原流程並通知 repository owner。

### [ORG-QUALITY-001] 不得宣稱尚未驗證的工作已成功

- Severity: MUST
- Applies to: 所有完成的工作
- Requirement: 必須說明實際執行過哪些檢查，並標示仍未驗證的項目。
- Evidence: 工程 review 基準
- Verification: 比對完成報告與記錄的命令結果。
- Recovery: 補跑缺少的檢查，或修正不正確的完成報告。
