import { detectDotnet } from "./dotnet.js";
import { detectGo } from "./go.js";
import { detectJava } from "./java.js";
import { detectNode } from "./node.js";
import { detectPython } from "./python.js";
import { detectRust } from "./rust.js";

const DETECTORS = [detectNode, detectPython, detectGo, detectRust, detectJava, detectDotnet];

export function detectEcosystems(root, files) {
  const grouped = new Map();
  for (const detected of DETECTORS.flatMap((detect) => detect(root, files))) {
    const existing = grouped.get(detected.key);
    if (!existing) {
      grouped.set(detected.key, detected);
      continue;
    }
    existing.manifests = Array.from(new Set([...existing.manifests, ...detected.manifests])).sort();
    existing.commands.push(...detected.commands);
    existing.detection_warnings.push(...detected.detection_warnings);
  }
  return Array.from(grouped.values()).sort((a, b) => a.key.localeCompare(b.key));
}
