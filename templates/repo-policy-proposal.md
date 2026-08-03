# Repository AI Agent 規範（提案）

Status: NEEDS_REVIEW

此草稿依 repository 中可觀察到的檔案產生。執行 `agent-policy-kit accept` 前，必須由
repository owner 審查每一項內容。

## Repository 事實

{{FACTS}}

## 規範

{{RULES}}

## Owner 審查清單

- [ ] 每條 rule 只描述一項可觀察的義務。
- [ ] 每條 rule 都有唯一的 `REPO-*` ID。
- [ ] Evidence 指向已納入版本控制的 repository 檔案。
- [ ] 設定檔中找到的命令，在實際執行前都標記為未驗證。
- [ ] 架構宣稱與受保護路徑已由 owner 確認。
- [ ] 文件中沒有 secret、個人絕對路徑或暫時性的 branch 狀態。
