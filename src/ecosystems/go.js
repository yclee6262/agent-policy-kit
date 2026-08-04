import { basename } from "node:path";
import { command, ecosystem, normalizeRoot, scopedWhen } from "./utils.js";

export function detectGo(_workspaceRoot, files) {
  return files.filter((file) => basename(file) === "go.mod").map((manifest) => {
    const root = normalizeRoot(manifest);
    const when = scopedWhen(root, ["**/*.go", "go.mod", "go.sum"]);
    return ecosystem("go", root, [manifest], [
      command("test", ["go", "test", "./..."], root, manifest, when),
      command("lint", ["go", "vet", "./..."], root, manifest, when),
    ]);
  });
}
