import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { generateEvaluationArtifacts, initProject, validateAgentProposal } from "../src/core.js";
import { buildAgentProposalPrompt, collectRepositoryEvidence } from "../src/evidence.js";

async function trackedRepository(files) {
  const root = mkdtempSync(join(tmpdir(), "agent-policy-kit-evidence-"));
  execFileSync("git", ["init", "-q"], { cwd: root });
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  execFileSync("git", ["add", "."], { cwd: root });
  return root;
}

test("collects bounded tracked evidence without persisting source excerpts", async (context) => {
  const token = `ghp_${"A".repeat(36)}`;
  const root = await trackedRepository({
    ".editorconfig": "root = true\n[*]\nindent_size = 2\n",
    "CONTRIBUTING.md": "Services use constructor injection.\n",
    "src/order-service.ts": "export class OrderService { constructor(private repo: OrderRepo) {} }\n",
    "src/user-service.ts": "export class UserService { constructor(private repo: UserRepo) {} }\n",
    "src/token.ts": `export const token = "${token}";\n`,
    ".env": "API_KEY=should-never-be-sampled\n",
    "cert.pem": "-----BEGIN PRIVATE KEY-----\nsecret\n-----END PRIVATE KEY-----\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));

  const evidence = collectRepositoryEvidence(root);
  const paths = evidence.profile.sampled_files.map((file) => file.path);
  assert.ok(paths.includes(".editorconfig"));
  assert.ok(paths.includes("src/order-service.ts"));
  assert.ok(!paths.includes(".env"));
  assert.ok(!paths.includes("cert.pem"));
  assert.equal(evidence.profile.selection.tracked_files_only, true);
  assert.equal(evidence.profile.selection.raw_source_persisted, false);
  assert.ok(evidence.profile.redaction_count >= 1);
  assert.ok(evidence.profile.sampled_files.every((file) => !("content" in file)));
  assert.doesNotMatch(JSON.stringify(evidence.profile), new RegExp(token));
  assert.doesNotMatch(JSON.stringify(evidence.samples), new RegExp(token));
  assert.match(JSON.stringify(evidence.samples), /REDACTED/);

  const prompt = buildAgentProposalPrompt({ repository: "demo" }, "### [REPO-TEST-001] Test\n", evidence);
  assert.match(prompt, /repository_evidence/);
  assert.match(prompt, /src\/order-service\.ts/);
  assert.match(prompt, /不得使用工具/);
  assert.doesNotMatch(prompt, new RegExp(token));
});

test("accepts cited advisory candidates and rejects unsupported or mandatory AI rules", () => {
  const draft = [
    "# Repository AI Agent 規範（提案）",
    "",
    "### [REPO-TEST-001] Tests",
    "",
    "- Severity: MUST",
    "- Evidence: package.json",
  ].join("\n");
  const evidence = {
    profile: { sampled_files: [{ path: "src/order-service.ts" }, { path: "src/user-service.ts" }] },
  };
  const candidate = `${draft}\n\n### [REPO-STYLE-001] Services use constructor injection\n\n- Severity: SHOULD\n- Confidence: high\n- Applies to: src/*-service.ts\n- Requirement: Service dependencies should use constructor injection.\n- Evidence: \`src/order-service.ts\`, \`src/user-service.ts\`\n- Compliant example: Pass a repository through the service constructor.\n- Non-compliant example: Instantiate a database client inside a service method.\n- Verification: Review changed service files.\n- Recovery: Move dependency construction to the composition root.\n`;
  assert.equal(validateAgentProposal(candidate, draft, evidence), null);
  assert.match(validateAgentProposal(candidate.replace("src/user-service.ts", "src/missing.ts"), draft, evidence), /不存在的檔案/);
  assert.match(validateAgentProposal(candidate.replace("- Severity: SHOULD\n- Confidence: high", "- Severity: MUST\n- Confidence: high"), draft, evidence), /不得直接標記為 MUST/);
  assert.match(validateAgentProposal(candidate.replace(/### \[REPO-TEST-001\][\s\S]*?(?=### \[REPO-STYLE-001\])/, ""), draft, evidence), /移除了 deterministic rules/);
});

test("creates owner-reviewable comprehension cases for inferred coding conventions", () => {
  const org = "### [ORG-QUALITY-001] Quality\n";
  const repo = [
    "### [REPO-REVIEW-001] Review checks",
    "",
    "- Requirement: Identify repository checks.",
    "",
    "### [REPO-STYLE-001] Constructor injection",
    "",
    "- Severity: SHOULD",
    "- Confidence: high",
    "- Non-compliant example: Instantiate a database client inside a service method.",
  ].join("\n");
  const artifacts = generateEvaluationArtifacts(org, repo, { ecosystems: [], package: null });
  const generated = artifacts.cases.cases.find((item) => item.id === "EVAL-REPO-STYLE-001");
  const expected = artifacts.expected.answers.find((item) => item.case_id === "EVAL-REPO-STYLE-001");
  assert.ok(generated);
  assert.match(generated.scenario, /database client/);
  assert.equal(expected.expected_decision, "REVISE_TO_COMPLY");
  assert.deepEqual(expected.expected_rule_ids, ["REPO-STYLE-001"]);
  assert.ok(artifacts.cases.allowed_decisions.includes("REVISE_TO_COMPLY"));
});

test("init uses an isolated evidence-based agent and integrates its proposal into review", async (context) => {
  const root = await trackedRepository({
    "README.md": "# Demo\n\nServices use constructor injection.\n",
    "src/order-service.ts": "export class OrderService { constructor(private repo: OrderRepo) {} }\n",
    "src/user-service.ts": "export class UserService { constructor(private repo: UserRepo) {} }\n",
  });
  const fakeBin = mkdtempSync(join(tmpdir(), "agent-policy-kit-fake-bin-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  context.after(() => rm(fakeBin, { recursive: true, force: true }));
  const fakeGemini = join(fakeBin, "gemini");
  const policy = [
    "# Repository AI Agent 規範（提案）",
    "",
    "### [REPO-REVIEW-001] Confirm checks",
    "",
    "- Severity: SHOULD",
    "- Confidence: high",
    "- Applies to: source changes",
    "- Requirement: Identify repository checks.",
    "- Evidence: README.md",
    "- Verification: Owner review.",
    "- Recovery: Record missing checks.",
    "",
    "### [REPO-STYLE-001] Constructor injection",
    "",
    "- Severity: SHOULD",
    "- Confidence: high",
    "- Applies to: src/*-service.ts",
    "- Requirement: Inject repository dependencies through constructors.",
    "- Evidence: `src/order-service.ts`, `src/user-service.ts`",
    "- Compliant example: Pass a repository into the constructor.",
    "- Non-compliant example: Instantiate a database client inside a service method.",
    "- Verification: Review changed service files.",
    "- Recovery: Move construction to the composition root.",
  ].join("\n");
  await writeFile(fakeGemini, `#!/usr/bin/env node\nif (process.argv.includes("--version")) { process.stdout.write("fake-gemini 1.0\\n"); process.exit(0); }\nif (process.cwd() === process.env.APK_TEST_TARGET_ROOT) process.exit(9);\nprocess.stdout.write(JSON.stringify({ response: ${JSON.stringify(policy)} }));\n`, "utf8");
  await chmod(fakeGemini, 0o755);
  const originalPath = process.env.PATH;
  const originalTarget = process.env.APK_TEST_TARGET_ROOT;
  process.env.PATH = `${fakeBin}:${originalPath}`;
  process.env.APK_TEST_TARGET_ROOT = root;
  try {
    const initialized = initProject(root, { agent: "gemini" });
    assert.equal(initialized.agent_generation.status, "DRAFTED", initialized.agent_generation.error);
  } finally {
    process.env.PATH = originalPath;
    if (originalTarget === undefined) delete process.env.APK_TEST_TARGET_ROOT;
    else process.env.APK_TEST_TARGET_ROOT = originalTarget;
  }
  const proposal = readFileSync(join(root, ".ai/REPO_AGENTS.proposed.md"), "utf8");
  const profile = readFileSync(join(root, ".ai/evidence/repository-profile.json"), "utf8");
  const review = readFileSync(join(root, ".ai/REVIEW.md"), "utf8");
  const cases = JSON.parse(readFileSync(join(root, ".ai/evals/cases.json"), "utf8"));
  assert.match(proposal, /REPO-STYLE-001/);
  assert.doesNotMatch(profile, /constructor\(private repo/);
  assert.match(review, /Agent generation：`DRAFTED`/);
  assert.match(review, /src\/order-service\.ts/);
  assert.ok(cases.cases.some((item) => item.id === "EVAL-REPO-STYLE-001"));
});
