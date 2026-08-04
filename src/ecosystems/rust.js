import { basename } from "node:path";
import { command, ecosystem, normalizeRoot, scopedWhen } from "./utils.js";

export function detectRust(_workspaceRoot, files) {
  return files.filter((file) => basename(file) === "Cargo.toml").map((manifest) => {
    const root = normalizeRoot(manifest);
    const when = scopedWhen(root, ["**/*.rs", "Cargo.toml", "Cargo.lock"]);
    return ecosystem("rust", root, [manifest], [
      command("test", ["cargo", "test"], root, manifest, when),
      command("lint", ["cargo", "fmt", "--check"], root, manifest, when),
      command("lint", ["cargo", "clippy", "--all-targets", "--all-features", "--", "-D", "warnings"], root, manifest, when, { variant: "clippy" }),
    ]);
  });
}
