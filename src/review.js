import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const REVIEW_PATH = ".ai/REVIEW.md";
const MANIFEST_PATH = ".ai/review-manifest.json";
const ACCEPTANCE_PATH = ".ai/review-acceptance.json";
const SOURCE_PATHS = [
  ".ai/ORG_AGENTS.md",
  ".ai/REPO_AGENTS.proposed.md",
  ".ai/inventory.json",
  ".ai/project.json",
  ".ai/policy-lock.json",
  ".ai/init-result.json",
  ".ai/checks.json",
  ".ai/evals/cases.json",
  ".ai/evals/expected.json",
];

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp() {
  return new Date().toISOString();
}

function readText(root, relativePath) {
  return readFileSync(join(root, relativePath), "utf8");
}

function readJson(root, relativePath) {
  try {
    return JSON.parse(readText(root, relativePath));
  } catch (error) {
    throw new Error(`無法解析 ${relativePath}：${error.message}`);
  }
}

function writeAtomic(path, content) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}-${randomBytes(4).toString("hex")}`;
  writeFileSync(temporary, content, "utf8");
  renameSync(temporary, path);
}

function writeJson(path, value) {
  writeAtomic(path, `${JSON.stringify(value, null, 2)}\n`);
}

function escapeTable(value) {
  return String(value ?? "—").replace(/\|/g, "\\|").replace(/\r?\n/g, "<br>");
}

function commandText(check) {
  if (check.type === "builtin") return `builtin:${check.builtin}`;
  return (check.command || []).join(" ");
}

function sourceState(root) {
  const paths = [...SOURCE_PATHS];
  if (existsSync(join(root, ".ai/evidence/repository-profile.json"))) paths.push(".ai/evidence/repository-profile.json");
  const missing = paths.filter((path) => !existsSync(join(root, path)));
  if (missing.length) throw new Error(`無法產生審查頁，缺少來源檔：${missing.join(", ")}`);
  const files = paths.map((path) => ({ path, sha256: sha256(readText(root, path)) }));
  return {
    files,
    digest: `sha256:${sha256(files.map((file) => `${file.path}:${file.sha256}`).join("\n"))}`,
  };
}

function ecosystemMarkdown(inventory) {
  const ecosystems = inventory.ecosystems || [];
  if (!ecosystems.length) return "未確認任何 ecosystem；請由 owner 補充正確的專案技術棧與命令。";
  const rows = ecosystems.map((ecosystem) => {
    const commands = (ecosystem.commands || [])
      .map((item) => `${item.kind}: ${(item.argv || []).join(" ")} (cwd: ${item.cwd || "."})`)
      .join("<br>") || "未確認";
    const warnings = (ecosystem.detection_warnings || []).join("；") || "無";
    return `| ${escapeTable(ecosystem.id)} | ${escapeTable(ecosystem.root)} | ${escapeTable((ecosystem.manifests || []).join("、"))} | ${escapeTable(commands)} | ${escapeTable(warnings)} |`;
  });
  return [
    "| Ecosystem | Root | Manifests | 已偵測命令 | 警告 |",
    "|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function evaluationsMarkdown(casesArtifact, expectedArtifact) {
  const answers = new Map((expectedArtifact.answers || []).map((answer) => [answer.case_id, answer]));
  if (!(casesArtifact.cases || []).length) return "沒有 evaluation case。";
  return casesArtifact.cases.map((item) => {
    const answer = answers.get(item.id) || {};
    return [
      `### ${item.id}${item.critical ? "（Critical）" : ""}`,
      "",
      item.scenario,
      "",
      `- 預期決策：\`${answer.expected_decision || "MISSING"}\``,
      `- 預期規範：${(answer.expected_rule_ids || []).map((id) => `\`${id}\``).join("、") || "MISSING"}`,
    ].join("\n");
  }).join("\n\n");
}

function checksMarkdown(checksArtifact) {
  const checks = checksArtifact.checks || [];
  if (!checks.length) return "沒有自動檢查；請確認這是否符合 repository 的實際需求。";
  const rows = checks.map((check) => [
    check.id,
    check.severity,
    (check.rule_ids || []).join(", "),
    commandText(check),
    check.cwd || ".",
    (check.when || []).join(", "),
    (check.evidence || []).join("；") || "—",
  ]).map((values) => `| ${values.map(escapeTable).join(" | ")} |`);
  return [
    "| Check ID | Severity | Rule IDs | 執行內容 | CWD | 適用路徑 | 證據 |",
    "|---|---|---|---|---|---|---|",
    ...rows,
  ].join("\n");
}

function evidenceMarkdown(profile, initResult) {
  if (!profile) return "此 repository 沒有 evidence profile；規範提案只使用 inventory 與確定性規則。";
  const rows = (profile.sampled_files || []).map((file) => `| ${escapeTable(file.path)} | ${escapeTable(file.category)} | ${file.bytes} | ${file.excerpt_truncated ? "是" : "否"} | ${file.redactions || 0} |`);
  return [
    `- Proposal agent：${initResult.agent ? `\`${initResult.agent}\`` : "未指定"}`,
    `- Agent generation：\`${initResult.agent_generation?.status || "UNKNOWN"}\`${initResult.agent_generation?.error ? ` — ${escapeTable(initResult.agent_generation.error)}` : ""}`,
    `- 安全抽樣檔案數：${profile.sampled_file_count || 0}`,
    `- 傳給 agent 的字元數：${profile.sampled_content_chars || 0}`,
    `- 高信心遮罩數：${profile.redaction_count || 0}`,
    `- 原始碼摘錄是否保存：${profile.selection?.raw_source_persisted ? "是" : "否"}`,
    `- 警告：${(profile.warnings || []).join("；") || "無"}`,
    "",
    "| Evidence file | 類型 | Bytes | 摘錄截斷 | 遮罩數 |",
    "|---|---|---:|---|---:|",
    ...rows,
  ].join("\n");
}

function reviewMarkdown(root, state) {
  const inventory = readJson(root, ".ai/inventory.json");
  const project = readJson(root, ".ai/project.json");
  const lock = readJson(root, ".ai/policy-lock.json");
  const cases = readJson(root, ".ai/evals/cases.json");
  const expected = readJson(root, ".ai/evals/expected.json");
  const checks = readJson(root, ".ai/checks.json");
  const initResult = readJson(root, ".ai/init-result.json");
  const evidencePath = join(root, ".ai/evidence/repository-profile.json");
  const evidence = existsSync(evidencePath) ? readJson(root, ".ai/evidence/repository-profile.json") : null;
  const org = readText(root, ".ai/ORG_AGENTS.md").trim();
  const proposal = readText(root, ".ai/REPO_AGENTS.proposed.md").trim();
  const sourceLinks = state.files.map((file) => `- [${file.path}](${file.path.replace(/^\.ai\//, "")}) — \`${file.sha256}\``).join("\n");
  return [
    "<!-- Generated by agent-policy-kit. Run `agent-policy-kit review` to refresh. DO NOT EDIT. -->",
    "# Repository AI 規範整合審查",
    "",
    "> 這是唯一需要完整閱讀的審查頁。底層檔案是機器可執行來源；若需修正，請修改對應來源後重新執行 `agent-policy-kit review`。",
    "",
    `- 審查狀態：**NEEDS_REVIEW**`,
    `- Repository：\`${project.repository || inventory.repository}\``,
    `- Owner：\`${project.owner || "OWNER_CONFIRMATION_REQUIRED"}\``,
    `- Risk tier：\`${project.risk_tier || "standard"}\``,
    `- 組織規範來源：\`${lock.source || "unknown"}\``,
    `- 組織規範版本：\`${lock.version || "unversioned"}\``,
    `- 審查來源 digest：\`${state.digest}\``,
    "",
    "## Owner 核准清單",
    "",
    "- [ ] 組織規範適用於此 repository，且未與 repo 規範衝突。",
    "- [ ] 技術棧、子專案根目錄與偵測到的命令正確。",
    "- [ ] 每條 repo 規範都有足夠證據、適用範圍、驗證與修復方式。",
    "- [ ] Evaluation 的情境、預期決策與 rule ID mapping 正確。",
    "- [ ] Checks 的命令、CWD、severity、適用路徑與 rule ID mapping 正確。",
    "- [ ] 已處理所有 `OWNER CONFIRMATION REQUIRED` 與偵測警告。",
    "",
    "## Repository 掃描摘要",
    "",
    ecosystemMarkdown(inventory),
    "",
    `- 掃描檔案數：${inventory.file_count_sampled ?? "未知"}`,
    `- Inventory 是否截斷：${inventory.inventory_truncated ? "是，必須人工確認" : "否"}`,
    `- 既有 agent 文件：${(inventory.existing_instruction_files || []).join("、") || "無"}`,
    "",
    "## AI Proposal Evidence",
    "",
    evidenceMarkdown(evidence, initResult),
    "",
    "## 組織層規範",
    "",
    org,
    "",
    "## Repository 規範提案",
    "",
    proposal,
    "",
    "## 規範理解 Evaluation",
    "",
    evaluationsMarkdown(cases, expected),
    "",
    "## 自動化 Checks",
    "",
    checksMarkdown(checks),
    "",
    "## 機器來源與完整性",
    "",
    "以下來源共同形成本審查頁。任何來源或本頁在產生後改變，`accept` 都會拒絕過期審查；請重新執行 `agent-policy-kit review`。",
    "",
    sourceLinks,
    "",
  ].join("\n");
}

export function generateReviewPacket(root) {
  const state = sourceState(root);
  const markdown = reviewMarkdown(root, state);
  writeAtomic(join(root, REVIEW_PATH), markdown);
  const manifest = {
    schema_version: "1",
    status: "NEEDS_REVIEW",
    generated_at: timestamp(),
    review_path: REVIEW_PATH,
    source_digest: state.digest,
    source_files: state.files,
    review_sha256: sha256(markdown),
  };
  writeJson(join(root, MANIFEST_PATH), manifest);
  return {
    status: "NEEDS_REVIEW",
    review: REVIEW_PATH,
    source_digest: state.digest,
    source_files: state.files.map((file) => file.path),
  };
}

export function inspectReviewPacket(root) {
  const reviewPath = join(root, REVIEW_PATH);
  const manifestPath = join(root, MANIFEST_PATH);
  if (!existsSync(reviewPath) || !existsSync(manifestPath)) {
    return { status: "MISSING", review: REVIEW_PATH, source_digest: null, reason: "審查頁或 manifest 不存在" };
  }
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (error) {
    return { status: "INVALID", review: REVIEW_PATH, source_digest: null, reason: `review manifest 無法解析：${error.message}` };
  }
  if (sha256(readFileSync(reviewPath, "utf8")) !== manifest.review_sha256) {
    return { status: "MODIFIED", review: REVIEW_PATH, source_digest: manifest.source_digest, reason: "REVIEW.md 在產生後被修改" };
  }
  try {
    const current = sourceState(root);
    if (current.digest !== manifest.source_digest) {
      const acceptancePath = join(root, ACCEPTANCE_PATH);
      if (existsSync(acceptancePath)) {
        try {
          const acceptance = JSON.parse(readFileSync(acceptancePath, "utf8"));
          if (acceptance.review_source_digest === manifest.source_digest && acceptance.accepted_source_digest === current.digest) {
            return {
              status: "ACCEPTED",
              review: REVIEW_PATH,
              source_digest: manifest.source_digest,
              accepted_source_digest: current.digest,
              accepted_at: acceptance.accepted_at,
            };
          }
        } catch {
          // Invalid acceptance evidence is treated as stale below.
        }
      }
      return { status: "STALE", review: REVIEW_PATH, source_digest: manifest.source_digest, current_source_digest: current.digest, reason: "底層審查來源已變更" };
    }
  } catch (error) {
    return { status: "STALE", review: REVIEW_PATH, source_digest: manifest.source_digest, reason: error.message };
  }
  return { status: "CURRENT", review: REVIEW_PATH, source_digest: manifest.source_digest, generated_at: manifest.generated_at };
}

export function markReviewAccepted(root, reviewSourceDigest) {
  const current = sourceState(root);
  const acceptance = {
    schema_version: "1",
    status: "ACCEPTED",
    review_source_digest: reviewSourceDigest,
    accepted_source_digest: current.digest,
    accepted_at: timestamp(),
  };
  writeJson(join(root, ACCEPTANCE_PATH), acceptance);
  return acceptance;
}

export function assertReviewPacketCurrent(root) {
  const result = inspectReviewPacket(root);
  if (result.status !== "CURRENT") {
    throw new Error(`整合審查頁狀態為 ${result.status}（${result.reason || "未知原因"}）。請執行 agent-policy-kit review，重新審查 .ai/REVIEW.md 後再執行 accept。`);
  }
  return result;
}
