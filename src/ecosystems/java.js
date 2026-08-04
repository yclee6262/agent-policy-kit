import { basename } from "node:path";
import { command, ecosystem, existingAtRoot, normalizeRoot, scopedWhen } from "./utils.js";

export function detectJava(workspaceRoot, files) {
  const output = [];
  for (const manifest of files.filter((file) => basename(file) === "pom.xml")) {
    const root = normalizeRoot(manifest);
    const wrapper = existingAtRoot(workspaceRoot, root, ["mvnw"]);
    const executable = wrapper ? "./mvnw" : "mvn";
    output.push(ecosystem("java-maven", root, [manifest], [
      command("test", [executable, "test"], root, [manifest, ...(wrapper ? [`${root === "." ? "" : `${root}/`}mvnw`] : [])], scopedWhen(root, ["**/*.java", "pom.xml"])),
    ]));
  }
  for (const manifest of files.filter((file) => ["build.gradle", "build.gradle.kts"].includes(basename(file)))) {
    const root = normalizeRoot(manifest);
    const wrapper = existingAtRoot(workspaceRoot, root, ["gradlew"]);
    const executable = wrapper ? "./gradlew" : "gradle";
    output.push(ecosystem("java-gradle", root, [manifest], [
      command("test", [executable, "test"], root, [manifest, ...(wrapper ? [`${root === "." ? "" : `${root}/`}gradlew`] : [])], scopedWhen(root, ["**/*.java", "**/*.kt", "build.gradle", "build.gradle.kts"]), { variant: basename(manifest) }),
    ]));
  }
  return output;
}
