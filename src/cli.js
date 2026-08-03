import {
  SUPPORTED_TOOLS,
  acceptProposal,
  initProject,
  projectStatus,
  repositoryRoot,
  setupTool,
  syncProject,
  verifyTool,
} from "./core.js";

const HELP = `agent-policy-kit

Generate, distribute, and verify repository policies across AI coding agents.

Usage:
  agent-policy-kit init [--agent <tool>] [--org-policy <file>] [--force] [--json]
  agent-policy-kit accept [--force] [--json]
  agent-policy-kit sync [--force] [--json]
  agent-policy-kit setup --tool <tool|all> [--force] [--json]
  agent-policy-kit verify --tool <tool|all> [--live] [--json]
  agent-policy-kit status [--json]

Supported tools: ${SUPPORTED_TOOLS.join(", ")}
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
      process.stdout.write(`- ${tool}: adapter=${value.adapter}, verification=${value.verification}\n`);
    }
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
  } else if (command === "status") {
    result = projectStatus(root);
  } else {
    throw new Error(`Unknown command: ${command}. Run agent-policy-kit help.`);
  }
  if (options.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(command, result);
}
