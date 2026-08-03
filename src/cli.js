import {
  SUPPORTED_TOOLS,
  acceptEvaluationSuite,
  acceptProposal,
  evaluateTool,
  initEvaluationSuite,
  initProject,
  projectStatus,
  repositoryRoot,
  setupTool,
  syncProject,
  verifyTool,
} from "./core.js";
import { acceptCheckSuite, initCheckSuite, runPolicyChecks } from "./checks.js";

const HELP = `agent-policy-kit

為不同 AI coding agent 產生、分發並驗證同一套 repository 規範。

用法：
  agent-policy-kit init [--agent <tool>] [--org-policy <file>] [--force] [--json]
  agent-policy-kit accept [--force] [--json]
  agent-policy-kit sync [--force] [--json]
  agent-policy-kit setup --tool <tool|all> [--force] [--json]
  agent-policy-kit verify --tool <tool|all> [--live] [--json]
  agent-policy-kit evaluate --init [--force] [--json]
  agent-policy-kit evaluate --accept [--json]
  agent-policy-kit evaluate --tool <tool|all> [--live] [--json]
  agent-policy-kit check --init [--force] [--json]
  agent-policy-kit check --accept [--json]
  agent-policy-kit check --diff <git-ref> [--tool <tool>] [--dry-run] [--json]
  agent-policy-kit status [--json]

支援工具：${SUPPORTED_TOOLS.join(", ")}
`;

function parseArgs(args) {
  const result = { _: [] };
  for (let index = 0; index < args.length; index += 1) {
    const value = args[index];
    if (!value.startsWith("--")) {
      result._.push(value);
      continue;
    }
    const [rawKey, inlineValue] = value.slice(2).split(/=(.*)/s, 2);
    const key = rawKey.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    if (inlineValue !== undefined) result[key] = inlineValue;
    else if (index + 1 < args.length && !args[index + 1].startsWith("--") && !["force", "json", "live", "help"].includes(rawKey)) result[key] = args[++index];
    else result[key] = true;
  }
  return result;
}

function printHuman(command, result) {
  if (command === "status") {
    process.stdout.write(`Status: ${result.status}\n`);
    process.stdout.write(`Policy fingerprint: ${result.policy_fingerprint || "none"}\n`);
    process.stdout.write(`Rules: ${result.effective_rule_ids.join(", ") || "none"}\n`);
    for (const [tool, value] of Object.entries(result.tools)) {
      process.stdout.write(`- ${tool}: adapter=${value.adapter}, verification=${value.verification}, comprehension=${value.comprehension}\n`);
    }
    process.stdout.write(`Policy check: ${result.policy_check.status}${result.policy_check.diagnosis ? ` (${result.policy_check.diagnosis})` : ""}\n`);
    return;
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

function requiredTool(options) {
  if (!options.tool || options.tool === true) throw new Error("--tool <name|all> is required.");
  return options.tool;
}

export async function main(argv) {
  const command = argv[0];
  const options = parseArgs(argv.slice(1));
  if (!command || command === "help" || command === "--help" || options.help) {
    process.stdout.write(HELP);
    return;
  }
  const root = repositoryRoot(process.cwd());
  let result;
  if (command === "init") {
    if (options.agent && !SUPPORTED_TOOLS.includes(options.agent)) throw new Error(`Unsupported agent: ${options.agent}`);
    result = initProject(root, options);
  } else if (command === "accept") {
    result = acceptProposal(root, options);
  } else if (command === "sync") {
    result = syncProject(root, options);
  } else if (command === "setup") {
    result = setupTool(root, requiredTool(options), options);
  } else if (command === "verify") {
    result = verifyTool(root, requiredTool(options), options);
  } else if (command === "evaluate") {
    if (options.init && options.accept) throw new Error("--init 和 --accept 不可同時使用。");
    if (options.init) result = initEvaluationSuite(root, options);
    else if (options.accept) result = acceptEvaluationSuite(root);
    else result = evaluateTool(root, requiredTool(options), options);
  } else if (command === "check") {
    if (options.init && options.accept) throw new Error("--init 和 --accept 不可同時使用。");
    if (options.init) result = initCheckSuite(root, options);
    else if (options.accept) result = acceptCheckSuite(root);
    else result = runPolicyChecks(root, options);
  } else if (command === "status") {
    result = projectStatus(root);
  } else {
    throw new Error(`Unknown command: ${command}. Run agent-policy-kit help.`);
  }
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(command, result);
  if (command === "check" && result.status === "BLOCKED") process.exitCode = 2;
}
