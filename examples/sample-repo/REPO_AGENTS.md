# Repository 規範範例

Status: ACTIVE

## 規範

### [REPO-TEST-001] 執行單元測試

- Severity: MUST
- Applies to: 原始碼變更
- Requirement: 宣告原始碼變更完成前，必須執行 `npm test`。
- Evidence: `package.json` 中的 test script
- Verification: `npm test` 必須以狀態碼 0 結束。
- Recovery: 修復測試，或將結果清楚標記為未驗證。
