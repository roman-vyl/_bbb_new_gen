import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");
const RUNTIME_DIR = join(FRONTEND_ROOT, "src", "features", "workbenchChartRuntime");

export function readWorkspaceSource(relativePath: string): string {
  return readFileSync(join(FRONTEND_ROOT, relativePath), "utf8");
}

export function listRuntimeProductionModules(): string[] {
  return readdirSync(RUNTIME_DIR)
    .filter((fileName) => fileName.endsWith(".ts") && !fileName.endsWith(".test.ts"))
    .filter((fileName) => !fileName.startsWith("phase6"))
    .sort();
}

export function readRuntimeProductionModule(fileName: string): string {
  return readFileSync(join(RUNTIME_DIR, fileName), "utf8");
}

export function runtimeModulePath(fileName: string): string {
  return relative(FRONTEND_ROOT, join(RUNTIME_DIR, fileName));
}

export function collectForbiddenImportViolations(
  source: string,
  forbiddenPatterns: RegExp[],
): string[] {
  return forbiddenPatterns
    .filter((pattern) => pattern.test(source))
    .map((pattern) => pattern.source);
}
