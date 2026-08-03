import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import {
  acceptEvaluationSuite,
  acceptProposal,
  evaluateTool,
  initEvaluationSuite,
  initProject,
  projectStatus,
  setupTool,
  scoreEvaluation,
  syncProject,
  verifyTool,
} from "../src/core.js";

async function repository(files = {}) {
  const root = mkdtempSync(join(tmpdir(), "agent-policy-kit-test-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  return root;
}

test("initializes, accepts, configures, and statically verifies all tools", async (context) => {
  const root = await repository({
    "package.json": JSON.stringify({
      name: "demo",
      scripts: { test: "node --test", lint: "eslint ." },
    }),
    "src/index.js": "export const answer = 42;\n",
    "test/index.test.js": "// sample\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const initialized = initProject(root);
  assert.equal(initialized.status, "NEEDS_REVIEW");
  assert.equal(initialized.agent_generation.status, "NOT_REQUESTED");
  assert.match(readFileSync(join(root, ".ai/REPO_AGENTS.proposed.md"), "utf8"), /REPO-TEST-001/);

  const accepted = acceptProposal(root);
  assert.equal(accepted.status, "ACCEPTED");
  assert.match(readFileSync(join(root, "AGENTS.md"), "utf8"), /Policy fingerprint: sha256:/);

  const setup = setupTool(root, "all");
  assert.equal(setup.status, "READY");
  assert.match(readFileSync(join(root, "CLAUDE.md"), "utf8"), /@AGENTS\.md/);
  const gemini = JSON.parse(readFileSync(join(root, ".gemini/settings.json"), "utf8"));
  assert.equal(gemini.context.fileName, "AGENTS.md");

  const verification = verifyTool(root, "all");
  assert.equal(verification.status, "OK");
  for (const result of Object.values(verification.results)) assert.equal(result.status, "ADAPTER_READY");

  const evaluation = evaluateTool(root, "all");
  assert.equal(evaluation.status, "OK");
  for (const result of Object.values(evaluation.results)) assert.equal(result.status, "EVAL_READY");

  const status = projectStatus(root);
  assert.equal(status.status, "ACTIVE");
  assert.ok(status.effective_rule_ids.includes("ORG-SAFE-001"));
  assert.ok(status.effective_rule_ids.includes("REPO-TEST-001"));
  assert.equal(status.tools.gemini.comprehension, "EVAL_READY");
});

test("scores comprehension answers and identifies critical interpretation failures", () => {
  const cases = {
    cases: [
      { id: "CASE-1", critical: true, scenario: "secret" },
      { id: "CASE-2", critical: false, scenario: "test" },
    ],
  };
  const expected = {
    answers: [
      { case_id: "CASE-1", expected_decision: "BLOCK", expected_rule_ids: ["ORG-SAFE-001"] },
      { case_id: "CASE-2", expected_decision: "CHECK", expected_rule_ids: ["REPO-TEST-001"] },
    ],
  };
  const correct = scoreEvaluation(cases, expected, {
    nonce: "abc",
    answers: [
      { case_id: "CASE-1", decision: "BLOCK", rule_ids: ["ORG-SAFE-001"] },
      { case_id: "CASE-2", decision: "CHECK", rule_ids: ["REPO-TEST-001"] },
    ],
  }, "abc");
  assert.equal(correct.passed, true);
  assert.equal(correct.score, 1);

  const wrong = scoreEvaluation(cases, expected, {
    nonce: "abc",
    answers: [
      { case_id: "CASE-1", decision: "PROCEED", rule_ids: [] },
      { case_id: "CASE-2", decision: "CHECK", rule_ids: ["REPO-TEST-001"] },
    ],
  }, "abc");
  assert.equal(wrong.passed, false);
  assert.deepEqual(wrong.critical_failures, ["CASE-1"]);
});

test("classifies a missing tool adapter as delivery failure before comprehension", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  const result = evaluateTool(root, "claude");
  assert.equal(result.status, "ATTENTION");
  assert.equal(result.results.claude.status, "DELIVERY_FAILED");
  assert.equal(result.results.claude.diagnosis, "delivery_failure");
});

test("adds a reviewable evaluation suite to an already initialized repository", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  await rm(join(root, ".ai", "evals"), { recursive: true, force: true });

  const initialized = initEvaluationSuite(root);
  assert.equal(initialized.status, "NEEDS_REVIEW");
  assert.throws(() => evaluateTool(root, "opencode"), /尚未啟用/);

  const accepted = acceptEvaluationSuite(root);
  assert.equal(accepted.status, "ACTIVE");
  setupTool(root, "opencode");
  const evaluated = evaluateTool(root, "opencode");
  assert.equal(evaluated.results.opencode.status, "EVAL_READY");
});

test("refuses to overwrite a manually changed generated AGENTS.md", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  writeFileSync(join(root, "AGENTS.md"), "manual change\n", "utf8");
  assert.throws(() => syncProject(root), /differs from the last generated version/);
  const forced = syncProject(root, { force: true });
  assert.equal(forced.status, "SYNCED");
});

test("refuses conflicting Gemini context unless explicitly forced", async (context) => {
  const root = await repository({
    "README.md": "# Demo\n",
    ".gemini/settings.json": JSON.stringify({ context: { fileName: "GEMINI.md" }, theme: "dark" }),
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  assert.throws(() => setupTool(root, "gemini"), /conflicting policy/);
  setupTool(root, "gemini", { force: true });
  const settings = JSON.parse(readFileSync(join(root, ".gemini/settings.json"), "utf8"));
  assert.equal(settings.context.fileName, "AGENTS.md");
  assert.equal(settings.theme, "dark");
});

test("preserves existing Claude instructions outside the managed import block", async (context) => {
  const root = await repository({
    "README.md": "# Demo\n",
    "CLAUDE.md": "# Local notes\n\nKeep this paragraph.\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  setupTool(root, "claude");
  setupTool(root, "claude");
  const content = readFileSync(join(root, "CLAUDE.md"), "utf8");
  assert.match(content, /Keep this paragraph/);
  assert.equal((content.match(/agent-policy-kit:start/g) || []).length, 1);
});

test("rejects duplicate rule IDs during sync", async (context) => {
  const root = await repository({ "README.md": "# Demo\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  initProject(root);
  acceptProposal(root);
  const repoPath = join(root, ".ai/REPO_AGENTS.md");
  const content = readFileSync(repoPath, "utf8");
  writeFileSync(repoPath, `${content}\n### [REPO-REVIEW-001] Duplicate\n`, "utf8");
  assert.throws(() => syncProject(root), /Duplicate rule IDs/);
});
