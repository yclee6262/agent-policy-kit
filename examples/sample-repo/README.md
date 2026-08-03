# 範例 repository 流程

這個目錄示範 agent-policy-kit 使用的兩份 canonical 規範輸入，不是第二個 npm 專案。

`ORG_AGENTS.md` 和 `REPO_AGENTS.md` 可用來理解規範格式。實際 repository 應使用 CLI：

```bash
agent-policy-kit init --org-policy /company/policies/ORG_AGENTS.md

# 人工審查 .ai/REPO_AGENTS.proposed.md

agent-policy-kit accept
agent-policy-kit setup --tool all
agent-policy-kit verify --tool all
agent-policy-kit status
```

完成靜態驗證後的預期狀態：

```text
Status: ACTIVE
- opencode: adapter=READY, verification=ADAPTER_READY
- pi:       adapter=READY, verification=ADAPTER_READY
- gemini:   adapter=READY, verification=ADAPTER_READY
- codex:    adapter=READY, verification=ADAPTER_READY
- claude:   adapter=READY, verification=ADAPTER_READY
```

若要取得實際模型的 challenge 證據，需執行 `verify --live`。靜態
`ADAPTER_READY` 不能被描述成模型已經讀取或遵循規範。
