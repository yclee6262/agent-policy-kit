import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

import { createCheckArtifacts } from "../src/checks.js";
import { collectInventory, generateProposal } from "../src/core.js";
import { detectEcosystems } from "../src/ecosystems/index.js";

async function workspace(files) {
  const root = mkdtempSync(join(tmpdir(), "agent-policy-kit-ecosystems-"));
  for (const [path, content] of Object.entries(files)) {
    await mkdir(join(root, path, ".."), { recursive: true });
    await writeFile(join(root, path), content, "utf8");
  }
  return root;
}

test("detects Node package manager and declared scripts", async (context) => {
  const root = await workspace({
    "web/package.json": JSON.stringify({ packageManager: "pnpm@10.0.0", scripts: { test: "vitest", lint: "eslint ." } }),
    "apps/admin/package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "pnpm-lock.yaml": "lockfileVersion: '9.0'\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  const detected = detectEcosystems(root, ["web/package.json", "apps/admin/package.json", "pnpm-lock.yaml"]);
  assert.equal(detected.length, 2);
  const web = detected.find((item) => item.key === "node:web");
  const admin = detected.find((item) => item.key === "node:apps/admin");
  assert.deepEqual(web.commands[0].argv, ["pnpm", "run", "test"]);
  assert.equal(web.commands[0].cwd, "web");
  assert.deepEqual(web.commands[0].when, ["web/**"]);
  assert.deepEqual(admin.commands[0].argv, ["pnpm", "run", "test"]);
  assert.ok(admin.manifests.includes("pnpm-lock.yaml"));
});

test("adds Python commands only when repository evidence identifies the tools", async (context) => {
  const root = await workspace({
    "services/api/pyproject.toml": "[project]\ndependencies = ['pytest', 'ruff', 'mypy']\n[tool.pytest.ini_options]\n[tool.ruff]\n[tool.mypy]\n",
    "services/api/uv.lock": "version = 1\n",
    "services/worker/pyproject.toml": "[build-system]\nrequires = ['setuptools']\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  const files = ["services/api/pyproject.toml", "services/api/uv.lock", "services/worker/pyproject.toml"];
  const detected = detectEcosystems(root, files).filter((item) => item.id === "python");
  assert.equal(detected.length, 2);
  const api = detected.find((item) => item.root === "services/api");
  assert.deepEqual(api.commands.map((item) => item.kind), ["test", "lint", "typecheck"]);
  assert.deepEqual(api.commands[0].argv, ["uv", "run", "pytest"]);
  assert.deepEqual(api.commands[1].argv, ["uv", "run", "ruff", "check", "."]);
  assert.equal(detected.find((item) => item.root === "services/worker").commands.length, 0);
});

test("detects Go, Rust, Maven, Gradle, and dotnet with repository-local wrappers", async (context) => {
  const root = await workspace({
    "go-service/go.mod": "module example.invalid/demo\n",
    "rust-service/Cargo.toml": "[package]\nname = 'demo'\n",
    "maven-service/pom.xml": "<project />\n",
    "maven-service/mvnw": "#!/bin/sh\n",
    "gradle-service/build.gradle.kts": "plugins {}\n",
    "gradle-service/gradlew": "#!/bin/sh\n",
    "dotnet-service/App.sln": "\n",
    "dotnet-service/Other.sln": "\n",
    "dotnet-service/src/App.csproj": "<Project />\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  const files = [
    "go-service/go.mod", "rust-service/Cargo.toml", "maven-service/pom.xml", "maven-service/mvnw",
    "gradle-service/build.gradle.kts", "gradle-service/gradlew", "dotnet-service/App.sln", "dotnet-service/Other.sln", "dotnet-service/src/App.csproj",
  ];
  const detected = detectEcosystems(root, files);
  assert.deepEqual(detected.map((item) => item.id), ["dotnet", "go", "java-gradle", "java-maven", "rust"]);
  assert.deepEqual(detected.find((item) => item.id === "go").commands[0].argv, ["go", "test", "./..."]);
  assert.deepEqual(detected.find((item) => item.id === "rust").commands[0].argv, ["cargo", "test"]);
  assert.deepEqual(detected.find((item) => item.id === "java-maven").commands[0].argv, ["./mvnw", "test"]);
  assert.deepEqual(detected.find((item) => item.id === "java-gradle").commands[0].argv, ["./gradlew", "test"]);
  assert.deepEqual(detected.find((item) => item.id === "dotnet").commands[0].argv, ["dotnet", "test", "App.sln"]);
  assert.equal(detected.filter((item) => item.id === "dotnet").length, 1);
  assert.equal(detected.find((item) => item.id === "dotnet").commands.length, 2);
});

test("inventory and checks retain multiple ecosystems with path-scoped cwd", async (context) => {
  const root = await workspace({
    "web/package.json": JSON.stringify({ scripts: { test: "node --test" } }),
    "services/api/go.mod": "module example.invalid/api\n",
    "services/api/main.go": "package main\n",
  });
  context.after(() => rm(root, { recursive: true, force: true }));
  const inventory = collectInventory(root);
  assert.deepEqual(inventory.ecosystems.map((item) => item.key), ["go:services/api", "node:web"]);
  assert.ok(inventory.manifests.includes("services/api/go.mod"));
  const org = "### [ORG-QUALITY-001] Quality\n\n### [ORG-SAFE-001] Safe\n";
  const repo = "### [REPO-TEST-001] Tests\n\n### [REPO-QUALITY-001] Quality\n";
  const artifact = createCheckArtifacts(inventory, org, repo);
  const commandChecks = artifact.checks.filter((item) => item.type === "command");
  assert.equal(commandChecks.length, 3);
  assert.ok(commandChecks.some((item) => item.ecosystem === "node" && item.cwd === "web" && item.when.includes("web/**")));
  assert.ok(commandChecks.some((item) => item.ecosystem === "go" && item.cwd === "services/api" && item.when.includes("services/api/**/*.go")));
  assert.equal(new Set(commandChecks.map((item) => item.id)).size, commandChecks.length);
  const proposal = generateProposal(inventory);
  assert.match(proposal, /go test \.\/\.\.\./);
  assert.match(proposal, /npm run test/);
  assert.match(proposal, /REPO-TEST-001/);
});

test("invalid package JSON is reported as a detection warning instead of inventing commands", async (context) => {
  const root = await workspace({ "package.json": "{ invalid\n" });
  context.after(() => rm(root, { recursive: true, force: true }));
  const detected = detectEcosystems(root, ["package.json"]);
  assert.equal(detected[0].commands.length, 0);
  assert.match(detected[0].detection_warnings[0], /JSON 無效/);
});
