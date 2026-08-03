# 組織規範範例

Policy version: 1.0.0

## 規範

### [ORG-SAFE-001] 不得提交憑證

- Severity: MUST NOT
- Applies to: 所有納入版本控制的檔案
- Requirement: 不得將憑證或 secret 加入版本控制。
- Evidence: 組織資訊安全規範
- Verification: secret scanner 與人工 review
- Recovery: 撤銷憑證，並依事件處理流程處理。
