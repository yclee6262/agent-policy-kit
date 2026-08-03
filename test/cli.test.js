import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

const binary = resolve("bin/agent-policy-kit.js");

test("CLI exposes JSON lifecycle output", async (context) => {
  const root = mkdtempSync(join(tmpdir(), "agent-policy-kit-cli-"));
  context.after(() => rm(root, { recursive: true, force: true }));
  execFileSync("git", ["init", "-q"], { cwd: root });
  const init = JSON.parse(execFileSync(process.execPath, [binary, "init", "--json"], { cwd: root, encoding: "utf8" }));
  assert.equal(init.status, "NEEDS_REVIEW");
  const accept = JSON.parse(execFileSync(process.execPath, [binary, "accept", "--json"], { cwd: root, encoding: "utf8" }));
  assert.equal(accept.status, "ACCEPTED");
  const status = JSON.parse(execFileSync(process.execPath, [binary, "status", "--json"], { cwd: root, encoding: "utf8" }));
  assert.equal(status.status, "ACTIVE");
});

test("CLI fails clearly when --tool is missing", () => {
  const result = spawnSync(process.execPath, [binary, "setup"], { cwd: process.cwd(), encoding: "utf8" });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /--tool/);
});
