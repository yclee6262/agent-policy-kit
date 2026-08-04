import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";

export function normalizeRoot(path) {
  const value = dirname(path);
  return value === "." ? "." : value;
}

export function filesAtRoot(files, root) {
  return files.filter((file) => normalizeRoot(file) === root);
}

export function basenameAtRoot(files, root, pattern) {
  return filesAtRoot(files, root).filter((file) => pattern.test(basename(file)));
}

export function scopedWhen(root, patterns = ["**"]) {
  if (root === ".") return patterns;
  return patterns.map((pattern) => pattern === "**" ? `${root}/**` : `${root}/${pattern}`);
}

export function safeRead(workspaceRoot, relativePath, maxBytes = 1024 * 1024) {
  const path = join(workspaceRoot, relativePath);
  try {
    const buffer = readFileSync(path);
    if (buffer.length > maxBytes || buffer.includes(0)) return null;
    return buffer.toString("utf8");
  } catch {
    return null;
  }
}

export function safeJson(workspaceRoot, relativePath) {
  const content = safeRead(workspaceRoot, relativePath);
  if (content === null) return { value: null, error: `${relativePath} 無法安全讀取` };
  try {
    return { value: JSON.parse(content), error: null };
  } catch (error) {
    return { value: null, error: `${relativePath} JSON 無效：${error.message}` };
  }
}

export function existingAtRoot(workspaceRoot, root, names) {
  return names.find((name) => existsSync(join(workspaceRoot, root === "." ? "" : root, name))) || null;
}

export function command(kind, argv, cwd, evidence, when, extra = {}) {
  return {
    kind,
    argv,
    cwd,
    evidence: Array.isArray(evidence) ? evidence : [evidence],
    confidence: "confirmed",
    when,
    ...extra,
  };
}

export function ecosystem(id, root, manifests, commands, warnings = []) {
  return {
    id,
    root,
    key: `${id}:${root}`,
    manifests: Array.from(new Set(manifests)).sort(),
    commands,
    detection_warnings: warnings,
  };
}
