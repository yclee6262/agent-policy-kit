import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, renameSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

const ALLOWED_SEVERITIES = new Set(["blocker", "warning", "advisory"]);
const ALLOWED_BUILTINS = new Set(["policy-integrity", "secret-diff"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function timestamp() {
  return new Date().toISOString();
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`無法解析 ${path}：${error.message}`);
  }
}

function writeJson(path, value) {
  mkdirSync(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  writeFileSync(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  renameSync(temporary, path);
}

function checkSuiteDigest(artifact) {
  return `sha256:${sha256(JSON.stringify({ schema_version: artifact.schema_version, checks: artifact.checks }))}`;
}

function repositoryRoot(cwd) {
  try {
    return execFileSync("git", ["rev-parse", "--show-toplevel"], {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    throw new Error("請在 Git repository 中執行此命令。");
  }
}

function assertAtRoot(root) {
  const discovered = repositoryRoot(root);
  if (realpathSync(discovered) !== realpathSync(root)) throw new Error(`請在 repository 根目錄執行：${discovered}`);
}

function extractRuleIds(markdown) {
  return Array.from(markdown.matchAll(/^###\s+\[((?:ORG|REPO)-[A-Z0-9-]+)\]/gm), (match) => match[1]);
}

function packageCommand(inventory, script) {
  const declared = inventory.package && inventory.package.package_manager;
  const manager = declared ? declared.split("@")[0] : "npm";
  if (manager === "yarn") return ["yarn", script];
  if (manager === "pnpm" || manager === "bun") return [manager, "run", script];
  return ["npm", "run", script];
}

export function createCheckArtifacts(inventory, org, repo) {
  const ruleIds = new Set([...extractRuleIds(org), ...extractRuleIds(repo)]);
  const checks = [];
  if (ruleIds.has("ORG-QUALITY-001")) {
    checks.push({
      id: "CHECK-POLICY-INTEGRITY",
      rule_ids: ["ORG-QUALITY-001"],
      severity: "blocker",
      type: "builtin",
      builtin: "policy-integrity",
      when: ["**"],
    });
  }
  if (ruleIds.has("ORG-SAFE-001")) {
    checks.push({
      id: "CHECK-SECRET-DIFF",
      rule_ids: ["ORG-SAFE-001"],
      severity: "blocker",
      type: "builtin",
      builtin: "secret-diff",
      when: ["**"],
    });
  }
  const scripts = inventory.package && inventory.package.scripts ? inventory.package.scripts : {};
  const definitions = [
    ["test", "CHECK-REPO-TEST", "REPO-TEST-001", "blocker"],
    ["lint", "CHECK-REPO-LINT", "REPO-QUALITY-001", "warning"],
    ["typecheck", "CHECK-REPO-TYPECHECK", "REPO-TYPE-001", "warning"],
    ["build", "CHECK-REPO-BUILD", "REPO-BUILD-001", "warning"],
  ];
  for (const [script, id, ruleId, severity] of definitions) {
    if (typeof scripts[script] !== "string" || !ruleIds.has(ruleId)) continue;
    checks.push({
      id,
      rule_ids: [ruleId],
      severity,
      type: "command",
      command: packageCommand(inventory, script),
      when: ["**"],
      timeout_ms: 120000,
      evidence: `package.json scripts.${script}`,
    });
  }
  return {
    schema_version: "1",
    status: "NEEDS_REVIEW",
    instructions: "執行 check --accept 前，repository owner 必須確認命令、嚴重度、適用範圍與 rule mapping。Command 不透過 shell 執行。",
    checks,
  };
}

export function initCheckSuite(root, options = {}) {
  assertAtRoot(root);
  const path = join(root, ".ai", "checks.json");
  if (existsSync(path) && !options.force) throw new Error(".ai/checks.json 已存在；請 review 現有設定，或確認後使用 --force。");
  const orgPath = join(root, ".ai", "ORG_AGENTS.md");
  const repoPath = join(root, ".ai", "REPO_AGENTS.md");
  if (!existsSync(orgPath) || !existsSync(repoPath)) throw new Error("缺少 canonical policy，請先完成 init 與 accept。");
  const inventoryPath = join(root, ".ai", "inventory.json");
  const inventory = existsSync(inventoryPath) ? readJson(inventoryPath) : { package: null };
  const artifact = createCheckArtifacts(inventory, readFileSync(orgPath, "utf8"), readFileSync(repoPath, "utf8"));
  writeJson(path, artifact);
  return { status: "NEEDS_REVIEW", path: ".ai/checks.json", check_ids: artifact.checks.map((check) => check.id) };
}

function validateCheckSuite(root, artifact, manifest, options = {}) {
  if (!artifact || !Array.isArray(artifact.checks)) throw new Error(".ai/checks.json schema 無效：checks 必須是 array。");
  if (!options.allowReview && artifact.status !== "ACTIVE") throw new Error("Check suite 尚未啟用；請先 review .ai/checks.json，再執行 check --accept。");
  if (!options.allowReview && artifact.accepted_digest !== checkSuiteDigest(artifact)) {
    throw new Error("Check suite 在核准後已被修改；請 review .ai/checks.json，再重新執行 check --accept。");
  }
  if (!options.allowReview && artifact.accepted_policy_fingerprint !== manifest.policy.fingerprint) {
    throw new Error("Policy fingerprint 已變更；請確認 checks 仍適用，再重新執行 check --accept。");
  }
  const ids = artifact.checks.map((check) => check.id);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  if (duplicates.length) throw new Error(`重複的 check ID：${Array.from(new Set(duplicates)).join(", ")}`);
  const activeRules = new Set((manifest.policy && manifest.policy.effective_rule_ids) || []);
  for (const check of artifact.checks) {
    if (!check.id || typeof check.id !== "string") throw new Error("每個 check 都必須有字串 ID。");
    if (!ALLOWED_SEVERITIES.has(check.severity)) throw new Error(`${check.id} 使用無效 severity：${check.severity}`);
    if (!Array.isArray(check.rule_ids) || !check.rule_ids.length) throw new Error(`${check.id} 必須對應至少一個 rule ID。`);
    const unknown = check.rule_ids.filter((ruleId) => !activeRules.has(ruleId));
    if (unknown.length) throw new Error(`${check.id} 引用不存在的 rule ID：${unknown.join(", ")}`);
    if (!Array.isArray(check.when) || !check.when.length || check.when.some((item) => typeof item !== "string")) {
      throw new Error(`${check.id} 必須有非空的 when glob array。`);
    }
    if (check.type === "builtin") {
      if (!ALLOWED_BUILTINS.has(check.builtin)) throw new Error(`${check.id} 使用未知 builtin：${check.builtin}`);
    } else if (check.type === "command") {
      if (!Array.isArray(check.command) || !check.command.length || check.command.some((item) => typeof item !== "string")) {
        throw new Error(`${check.id} 的 command 必須是非空字串 array。`);
      }
      if (check.timeout_ms !== undefined && (!Number.isInteger(check.timeout_ms) || check.timeout_ms < 1000 || check.timeout_ms > 900000)) {
        throw new Error(`${check.id} 的 timeout_ms 必須介於 1000 與 900000。`);
      }
    } else {
      throw new Error(`${check.id} 使用未知 type：${check.type}`);
    }
  }
  return artifact;
}

export function acceptCheckSuite(root) {
  assertAtRoot(root);
  const checksPath = join(root, ".ai", "checks.json");
  const manifestPath = join(root, ".ai", "generated-manifest.json");
  if (!existsSync(checksPath) || !existsSync(manifestPath)) throw new Error("缺少 checks.json 或 generated manifest。");
  const artifact = readJson(checksPath);
  validateCheckSuite(root, artifact, readJson(manifestPath), { allowReview: true });
  artifact.status = "ACTIVE";
  artifact.accepted_at = timestamp();
  artifact.accepted_digest = checkSuiteDigest(artifact);
  artifact.accepted_policy_fingerprint = readJson(manifestPath).policy.fingerprint;
  writeJson(checksPath, artifact);
  return { status: "ACTIVE", check_ids: artifact.checks.map((check) => check.id), accepted_at: artifact.accepted_at };
}

function globToRegExp(glob) {
  if (glob === "**" || glob === "*") return /^.*$/;
  let pattern = "";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      if (glob[index + 2] === "/") {
        pattern += "(?:.*/)?";
        index += 2;
      } else {
        pattern += ".*";
        index += 1;
      }
    } else if (char === "*") pattern += "[^/]*";
    else if (char === "?") pattern += "[^/]";
    else pattern += char.replace(/[\\^$+?.()|{}\[\]]/g, "\\$&");
  }
  return new RegExp(`^${pattern}$`);
}

function appliesToFiles(check, files) {
  const patterns = check.when.map(globToRegExp);
  return files.some((file) => patterns.some((pattern) => pattern.test(file)));
}

function gitOutput(root, args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 20 * 1024 * 1024 });
  } catch (error) {
    const detail = error.stderr ? String(error.stderr).trim() : error.message;
    throw new Error(`Git diff 失敗：${detail}`);
  }
}

function diffContext(root, base) {
  gitOutput(root, ["rev-parse", "--verify", `${base}^{commit}`]);
  const trackedFiles = gitOutput(root, ["diff", "--name-only", "--diff-filter=ACMRT", base, "--"])
    .split("\n").map((item) => item.trim()).filter(Boolean);
  const untrackedFiles = gitOutput(root, ["ls-files", "--others", "--exclude-standard"])
    .split("\n").map((item) => item.trim()).filter(Boolean);
  const isEvidenceOutput = (file) => file.startsWith(".ai/results/");
  const relevantUntrackedFiles = untrackedFiles.filter((file) => !isEvidenceOutput(file));
  const changedFiles = Array.from(new Set([...trackedFiles, ...relevantUntrackedFiles].filter((file) => !isEvidenceOutput(file)))).sort();
  const patch = gitOutput(root, ["diff", "--no-ext-diff", "--unified=0", base, "--"]);
  const head = gitOutput(root, ["rev-parse", "HEAD"]).trim();
  return { base, head, changedFiles, untrackedFiles: relevantUntrackedFiles, patch };
}

function policyIntegrity(root, manifest) {
  const path = join(root, "AGENTS.md");
  const expected = manifest.generated_files && manifest.generated_files["AGENTS.md"];
  if (!existsSync(path)) return { passed: false, violations: [{ code: "AGENTS_MISSING", path: "AGENTS.md" }] };
  if (!expected) return { passed: false, violations: [{ code: "MANIFEST_ENTRY_MISSING", path: "AGENTS.md" }] };
  const actual = sha256(readFileSync(path, "utf8"));
  if (actual !== expected.sha256) return { passed: false, violations: [{ code: "GENERATED_FILE_DRIFT", path: "AGENTS.md" }] };
  return { passed: true, violations: [] };
}

function addedLines(patch) {
  const lines = [];
  let file = null;
  let lineNumber = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+++ b/")) {
      file = line.slice(6);
      continue;
    }
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (hunk) {
      lineNumber = Number(hunk[1]);
      continue;
    }
    if (line.startsWith("+") && !line.startsWith("+++")) {
      lines.push({ file, line: lineNumber, content: line.slice(1) });
      lineNumber += 1;
    } else if (!line.startsWith("-") && !line.startsWith("\\")) {
      lineNumber += 1;
    }
  }
  return lines;
}

function untrackedAddedLines(root, files) {
  const output = [];
  for (const file of files) {
    const path = join(root, file);
    let value;
    try {
      if (lstatSync(path).isSymbolicLink()) continue;
      const buffer = readFileSync(path);
      if (buffer.length > 1024 * 1024 || buffer.includes(0)) continue;
      value = buffer.toString("utf8");
    } catch {
      continue;
    }
    value.split("\n").forEach((content, index) => output.push({ file, line: index + 1, content }));
  }
  return output;
}

function secretDiff(root, patch, untrackedFiles) {
  const patterns = [
    ["PRIVATE_KEY", /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
    ["AWS_ACCESS_KEY", /\bAKIA[0-9A-Z]{16}\b/],
    ["GITHUB_TOKEN", /\bgh[pousr]_[A-Za-z0-9]{36,255}\b/],
  ];
  const violations = [];
  for (const added of [...addedLines(patch), ...untrackedAddedLines(root, untrackedFiles)]) {
    for (const [code, pattern] of patterns) {
      if (pattern.test(added.content)) violations.push({ code, path: added.file, line: added.line });
    }
  }
  return { passed: violations.length === 0, violations };
}

function runCommand(root, check, dryRun) {
  if (dryRun) return { passed: true, status: "PLANNED", command: check.command };
  const started = Date.now();
  const result = spawnSync(check.command[0], check.command.slice(1), {
    cwd: root,
    encoding: "utf8",
    timeout: check.timeout_ms || 120000,
    maxBuffer: 20 * 1024 * 1024,
    env: { ...process.env, NO_COLOR: "1" },
  });
  const combined = `${result.stdout || ""}\n${result.stderr || ""}`;
  const passed = !result.error && result.status === 0;
  return {
    passed,
    status: passed ? "PASSED" : "FAILED",
    command: check.command,
    exit_code: result.status,
    signal: result.signal,
    duration_ms: Date.now() - started,
    output_sha256: sha256(combined),
    error: passed ? null : result.error ? result.error.message : `command exited with status ${result.status}`,
  };
}

function comprehensionEvidence(root, tool, fingerprint) {
  if (!tool) return { confirmed: false, reason: "tool_not_provided" };
  const path = join(root, ".ai", "results", `${tool}-comprehension.json`);
  if (!existsSync(path)) return { confirmed: false, reason: "comprehension_result_missing" };
  const result = readJson(path);
  if (result.policy_fingerprint !== fingerprint) return { confirmed: false, reason: "policy_fingerprint_mismatch" };
  if (result.status !== "COMPREHENSION_CONFIRMED") return { confirmed: false, reason: `status_${result.status}` };
  return { confirmed: true, reason: null, evaluated_at: result.evaluated_at };
}

export function runPolicyChecks(root, options = {}) {
  assertAtRoot(root);
  if (!options.diff || options.diff === true) throw new Error("--diff <git-ref> 為必要參數。");
  const checksPath = join(root, ".ai", "checks.json");
  const manifestPath = join(root, ".ai", "generated-manifest.json");
  if (!existsSync(checksPath) || !existsSync(manifestPath)) throw new Error("缺少 checks.json 或 generated manifest；請先執行 check --init 與 check --accept。");
  const manifest = readJson(manifestPath);
  const artifact = validateCheckSuite(root, readJson(checksPath), manifest);
  const diff = diffContext(root, options.diff);
  const results = [];
  for (const check of artifact.checks) {
    if (check.builtin !== "policy-integrity" && !appliesToFiles(check, diff.changedFiles)) {
      results.push({ id: check.id, rule_ids: check.rule_ids, severity: check.severity, status: "SKIPPED", passed: true, reason: "no_matching_files" });
      continue;
    }
    let outcome;
    if (check.type === "command") outcome = runCommand(root, check, options.dryRun);
    else if (check.builtin === "policy-integrity") {
      const builtinResult = policyIntegrity(root, manifest);
      outcome = { ...builtinResult, status: builtinResult.passed ? "PASSED" : "FAILED" };
    } else if (check.builtin === "secret-diff") {
      const builtinResult = secretDiff(root, diff.patch, diff.untrackedFiles);
      outcome = { ...builtinResult, status: builtinResult.passed ? "PASSED" : "FAILED" };
    }
    results.push({ id: check.id, rule_ids: check.rule_ids, severity: check.severity, ...outcome });
  }
  const blockers = results.filter((result) => !result.passed && result.severity === "blocker");
  const warnings = results.filter((result) => !result.passed && result.severity === "warning");
  const evidence = comprehensionEvidence(root, options.tool, manifest.policy.fingerprint);
  let status = options.dryRun ? "PLANNED" : blockers.length ? "BLOCKED" : warnings.length ? "WARNINGS" : "PASSED";
  const diagnosis = blockers.length ? (evidence.confirmed ? "execution_failure" : "artifact_nonconformance") : null;
  const report = {
    schema_version: "1",
    status,
    diagnosis,
    base: diff.base,
    head: diff.head,
    dirty_worktree_included: true,
    changed_files: diff.changedFiles,
    policy_fingerprint: manifest.policy.fingerprint,
    tool: options.tool || null,
    comprehension_evidence: evidence,
    summary: { total: results.length, blockers_failed: blockers.length, warnings_failed: warnings.length },
    checks: results,
    checked_at: timestamp(),
  };
  writeJson(join(root, ".ai", "results", "latest-check.json"), report);
  return report;
}
