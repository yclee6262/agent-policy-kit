import { basename } from "node:path";
import { basenameAtRoot, command, ecosystem, filesAtRoot, normalizeRoot, safeRead, scopedWhen } from "./utils.js";

function pythonArgv(rootFiles, tool, args = []) {
  const names = new Set(rootFiles.map((file) => basename(file)));
  if (names.has("uv.lock")) return ["uv", "run", tool, ...args];
  if (names.has("poetry.lock")) return ["poetry", "run", tool, ...args];
  return ["python", "-m", tool, ...args];
}

export function detectPython(workspaceRoot, files) {
  const manifestPattern = /^(pyproject\.toml|requirements(?:[-.][^.]+)?\.txt|setup\.cfg|tox\.ini|noxfile\.py|Pipfile|poetry\.lock|uv\.lock|pytest\.ini)$/;
  const roots = Array.from(new Set(files.filter((file) => manifestPattern.test(basename(file))).map(normalizeRoot))).sort();
  const output = [];
  for (const root of roots) {
    const rootFiles = filesAtRoot(files, root);
    const manifests = rootFiles.filter((file) => manifestPattern.test(basename(file)));
    const textFiles = manifests.filter((file) => /\.(toml|txt|cfg|ini)$/.test(file));
    const combined = textFiles.map((file) => safeRead(workspaceRoot, file) || "").join("\n").toLowerCase();
    const names = new Set(rootFiles.map((file) => basename(file)));
    const when = scopedWhen(root, ["**/*.py", "pyproject.toml", "requirements*.txt", "tox.ini", "noxfile.py"]);
    const commands = [];
    if (names.has("tox.ini")) {
      const evidence = basenameAtRoot(files, root, /^tox\.ini$/);
      commands.push(command("test", ["tox"], root, evidence, when));
    } else if (names.has("noxfile.py")) {
      const evidence = basenameAtRoot(files, root, /^noxfile\.py$/);
      commands.push(command("test", ["nox"], root, evidence, when));
    } else if (names.has("pytest.ini") || combined.includes("pytest") || combined.includes("[tool.pytest.ini_options]")) {
      const evidence = manifests.filter((file) => basename(file) === "pytest.ini" || (safeRead(workspaceRoot, file) || "").toLowerCase().includes("pytest"));
      commands.push(command("test", pythonArgv(rootFiles, "pytest"), root, evidence.length ? evidence : manifests, when));
    }
    if (combined.includes("ruff")) {
      const evidence = textFiles.filter((file) => (safeRead(workspaceRoot, file) || "").toLowerCase().includes("ruff"));
      commands.push(command("lint", pythonArgv(rootFiles, "ruff", ["check", "."]), root, evidence, when));
    }
    if (combined.includes("mypy")) {
      const evidence = textFiles.filter((file) => (safeRead(workspaceRoot, file) || "").toLowerCase().includes("mypy"));
      commands.push(command("typecheck", pythonArgv(rootFiles, "mypy", ["."]), root, evidence, when));
    }
    output.push(ecosystem("python", root, manifests, commands));
  }
  return output;
}
