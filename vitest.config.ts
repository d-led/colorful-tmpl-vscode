import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/*/src/**/*.test.ts"],
    // VS Code integration tests run in the Extension Development Host (mocha),
    // not under vitest, and import the `vscode` module.
    exclude: ["**/*.integration.test.ts"],
    // approval tests write temp files; parallel execution causes EEXIST on the shared temp dir
    fileParallelism: false,
    coverage: {
      include: ["packages/*/src/**/*.ts"],
      exclude: ["packages/*/src/**/*.test.ts", "packages/*/src/test/**"],
    },
  },
});
