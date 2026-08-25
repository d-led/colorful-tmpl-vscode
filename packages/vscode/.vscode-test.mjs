import { existsSync } from "node:fs";
import { join } from "node:path";

import { defineConfig } from "@vscode/test-cli";

/**
 * VS Code extension integration tests (Extension Development Host).
 * Run from repo: bash scripts/test-vscode-extension.sh
 *
 * `VSCODE_TEST_VERSION` overrides the downloaded VS Code build (e.g. `stable`,
 * `insiders`, or an exact release like `1.95.0`). Defaults to `stable`.
 * `VSCODE_TEST_PATH` points at an already-installed VS Code (skips download).
 */
const vscodeVersion = (process.env.VSCODE_TEST_VERSION ?? "").trim() || "stable";
const vscodePath = process.env.VSCODE_TEST_PATH;

/** On macOS @vscode/test-electron wants the executable, not the .app bundle. */
function resolveInstallationPath(input) {
  const executable = join(input, "Contents", "MacOS", "Code");
  if (process.platform === "darwin" && existsSync(executable)) {
    return executable;
  }
  return input;
}

const config = {
  files: "dist/test/suite/**/*.integration.test.js",
  workspaceFolder: "./fixtures/dogfood",
  mocha: {
    ui: "bdd",
    timeout: 60_000,
  },
  launchArgs: ["--disable-extensions"],
};

if (vscodePath) {
  config.useInstallation = { fromPath: resolveInstallationPath(vscodePath) };
} else {
  config.version = vscodeVersion;
}

export default defineConfig(config);
