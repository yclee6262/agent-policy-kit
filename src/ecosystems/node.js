import { basename, dirname, join } from "node:path";
import { command, ecosystem, existingAtRoot, normalizeRoot, safeJson, scopedWhen } from "./utils.js";

function managerFor(workspaceRoot, root, packageJson) {
  if (typeof packageJson.packageManager === "string") return { manager: packageJson.packageManager.split("@")[0], lockPath: null };
  let candidate = root;
  while (true) {
    const definitions = [
      ["pnpm", ["pnpm-lock.yaml"]],
      ["yarn", ["yarn.lock"]],
      ["bun", ["bun.lock", "bun.lockb"]],
      ["npm", ["package-lock.json"]],
    ];
    for (const [manager, names] of definitions) {
      const lock = existingAtRoot(workspaceRoot, candidate, names);
      if (lock) return { manager, lockPath: join(candidate === "." ? "" : candidate, lock) };
    }
    if (candidate === ".") break;
    candidate = dirname(candidate);
    if (!candidate || candidate === "/") candidate = ".";
  }
  return { manager: "npm", lockPath: null };
}

function argvFor(manager, script) {
  if (manager === "yarn") return ["yarn", script];
  if (manager === "pnpm" || manager === "bun") return [manager, "run", script];
  return ["npm", "run", script];
}

export function detectNode(workspaceRoot, files) {
  const output = [];
  for (const manifest of files.filter((file) => basename(file) === "package.json")) {
    const root = normalizeRoot(manifest);
    const parsed = safeJson(workspaceRoot, manifest);
    if (!parsed.value) {
      output.push(ecosystem("node", root, [manifest], [], [parsed.error]));
      continue;
    }
    const managerInfo = managerFor(workspaceRoot, root, parsed.value);
    const manager = managerInfo.manager;
    const scripts = parsed.value.scripts && typeof parsed.value.scripts === "object" ? parsed.value.scripts : {};
    const commands = ["test", "lint", "typecheck", "build"]
      .filter((kind) => typeof scripts[kind] === "string")
      .map((kind) => command(
        kind,
        argvFor(manager, kind),
        root,
        [`${manifest} scripts.${kind}`],
        scopedWhen(root),
        { declared_command: scripts[kind], package_manager: manager },
      ));
    output.push(ecosystem("node", root, [manifest, managerInfo.lockPath].filter(Boolean), commands));
  }
  return output;
}
