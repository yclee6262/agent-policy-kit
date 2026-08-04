import { basename, extname } from "node:path";
import { command, ecosystem, normalizeRoot, scopedWhen } from "./utils.js";

export function detectDotnet(_workspaceRoot, files) {
  const solutions = files.filter((file) => extname(file).toLowerCase() === ".sln");
  const solutionRoots = solutions.map(normalizeRoot);
  const projects = files.filter((file) => [".csproj", ".fsproj"].includes(extname(file).toLowerCase()))
    .filter((file) => {
      const root = normalizeRoot(file);
      return !solutionRoots.some((solutionRoot) => solutionRoot === "." || root === solutionRoot || root.startsWith(`${solutionRoot}/`));
    });
  const manifests = [...solutions, ...projects];
  return manifests.map((manifest) => {
    const root = normalizeRoot(manifest);
    return ecosystem("dotnet", root, [manifest], [
      command("test", ["dotnet", "test", basename(manifest)], root, manifest, scopedWhen(root, ["**/*.cs", "**/*.fs", "*.sln", "*.csproj", "*.fsproj"]), { variant: basename(manifest) }),
    ]);
  });
}
