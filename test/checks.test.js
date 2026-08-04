import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { acceptCheckSuite, initCheckSuite, runPolicyChecks } from "../src/checks.js";
import { acceptProposal, initProject, syncProject } from "../src/core.js";

async function repository(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-policy-kit-checks-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  execFileSync("git", ["config", "user.email", "tests@example.invalid"], { cwd: root });
  execFileSync("git", ["config", "user.name", "agent-policy-kit tests"], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: root });
  execFileSync("git", ["commit", "-qm", "baseline"], { cwd: root });
  return root;
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function writeJson(path, value) {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function replaceCommands(root, replacements) {
  const path = join(root, ".ai", "checks.json");
  const config = readJson(path);
  for (const check of config.checks) {
    if (replacements[check.id]) check.command = replacements[check.id];
  }
  writeJson(path, config);
  acceptCheckSuite(root);
}

test("blocks a high-confidence secret without storing its value", async (context) => {
  const root = await repository({
    "package.json": JSON.stringify({ name: "demo", scripts: { test: "placeholder" } }),
    "src/config.js": "export const config = {};\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  replaceCommands(root, { "CHECK-REPO-TEST": [process.execPath, "-e", "process.exit(0)"] });
  writeFileSync(join(root, "src/config.js"), 'export const token = "AKIA1234567890ABCDEF";\n', "utf8");

  const result = runPolicyChecks(root, { diff: "HEAD" });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnosis, "artifact_nonconformance");
  assert.equal(result.summary.blockers_failed, 1);
  const secret = result.checks.find((check) => check.id === "CHECK-SECRET-DIFF");
  assert.equal(secret.violations[0].code, "AWS_ACCESS_KEY");
  assert.equal(secret.violations[0].path, "src/config.js");
  assert.equal(JSON.stringify(result).includes("AKIA1234567890ABCDEF"), false);
});

test("includes untracked files in secret checks", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  await mkdir(join(root, "config"), { recursive: true });
  writeFileSync(join(root, "config/new-key.pem"), "-----BEGIN PRIVATE KEY-----\nredacted\n", "utf8");

  const result = runPolicyChecks(root, { diff: "HEAD" });
  assert.equal(result.status, "BLOCKED");
  assert.ok(result.changed_files.includes("config/new-key.pem"));
  const secret = result.checks.find((check) => check.id === "CHECK-SECRET-DIFF");
  assert.deepEqual(secret.violations[0], { code: "PRIVATE_KEY", path: "config/new-key.pem", line: 1 });
  const repeated = runPolicyChecks(root, { diff: "HEAD" });
  assert.equal(repeated.changed_files.some((file) => file.startsWith(".ai/results/")), false);
});

test("classifies violations as execution failure only with matching comprehension evidence", async (context) => {
  const root = await repository({ "README.md": "# Demo\n", "src/app.js": "export const ok = true;\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  const manifest = readJson(join(root, ".ai", "generated-manifest.json"));
  writeJson(join(root, ".ai", "results", "gemini-comprehension.json"), {
    schema_version: "1",
    tool: "gemini",
    status: "COMPREHENSION_CONFIRMED",
    policy_fingerprint: manifest.policy.fingerprint,
    evaluated_at: new Date().toISOString(),
  });
  writeFileSync(join(root, "src/app.js"), 'export const key = "AKIA1234567890ABCDEF";\n', "utf8");

  const result = runPolicyChecks(root, { diff: "HEAD", tool: "gemini" });
  assert.equal(result.status, "BLOCKED");
  assert.equal(result.diagnosis, "execution_failure");
  assert.equal(result.comprehension_evidence.confirmed, true);
});

test("warning command failures do not block the result", async (context) => {
  const root = await repository({
    "package.json": JSON.stringify({ name: "demo", scripts: { test: "placeholder", lint: "placeholder" } }),
    "src/app.js": "export const ok = true;\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  replaceCommands(root, {
    "CHECK-REPO-TEST": [process.execPath, "-e", "process.exit(0)"],
    "CHECK-REPO-LINT": [process.execPath, "-e", "process.exit(1)"],
  });
  writeFileSync(join(root, "src/app.js"), "export const ok = false;\n", "utf8");

  const result = runPolicyChecks(root, { diff: "HEAD" });
  assert.equal(result.status, "WARNINGS");
  assert.equal(result.summary.blockers_failed, 0);
  assert.equal(result.summary.warnings_failed, 1);
});

test("requires renewed acceptance after check configuration changes", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  const path = join(root, ".ai", "checks.json");
  const config = readJson(path);
  config.checks[0].severity = "warning";
  writeJson(path, config);
  assert.throws(() => runPolicyChecks(root, { diff: "HEAD" }), /核准後已被修改/);
  acceptCheckSuite(root);
  assert.equal(runPolicyChecks(root, { diff: "HEAD", dryRun: true }).status, "PLANNED");

  const repoPolicyPath = join(root, ".ai", "REPO_AGENTS.md");
  writeFileSync(repoPolicyPath, `${readFileSync(repoPolicyPath, "utf8")}\n補充說明：此變更會更新 fingerprint。\n`, "utf8");
  syncProject(root);
  assert.throws(() => runPolicyChecks(root, { diff: "HEAD" }), /Policy fingerprint 已變更/);
  acceptCheckSuite(root);
  assert.equal(runPolicyChecks(root, { diff: "HEAD", dryRun: true }).status, "PLANNED");
});

test("can initialize checks for a repository created by an older release", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  await rm(join(root, ".ai", "checks.json"), { force: true });
  const initialized = initCheckSuite(root);
  assert.equal(initialized.status, "NEEDS_REVIEW");
  const accepted = acceptCheckSuite(root);
  assert.equal(accepted.status, "ACTIVE");
});

test("runs only checks whose ecosystem paths match a monorepo diff", async (context) => {
  const root = await repository({
    "web/package.json": JSON.stringify({ scripts: { test: "placeholder" } }),
    "web/app.js": "export const web = true;\n",
    "services/api/go.mod": "module example.invalid/api\n",
    "services/api/main.go": "package main\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  const path = join(root, ".ai", "checks.json");
  const config = readJson(path);
  const firstCommand = config.checks.find((item) => item.type === "command");
  const originalCwd = firstCommand.cwd;
  firstCommand.cwd = "../outside";
  writeJson(path, config);
  assert.throws(() => acceptCheckSuite(root), /cwd 不存在、位於 repository 外/);
  firstCommand.cwd = originalCwd;
  for (const check of config.checks.filter((item) => item.type === "command")) {
    check.command = [process.execPath, "-e", "process.exit(0)"];
  }
  writeJson(path, config);
  acceptCheckSuite(root);
  writeFileSync(join(root, "services/api/main.go"), "package main\n// changed\n", "utf8");

  const result = runPolicyChecks(root, { diff: "HEAD" });
  const nodeChecks = result.checks.filter((item) => item.id.includes("NODE"));
  const goChecks = result.checks.filter((item) => item.id.includes("GO"));
  assert.ok(nodeChecks.length > 0);
  assert.ok(nodeChecks.every((item) => item.status === "SKIPPED"));
  assert.equal(goChecks.length, 2);
  assert.ok(goChecks.every((item) => item.status === "PASSED"));
});
