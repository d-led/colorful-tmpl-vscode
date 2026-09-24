import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "..",
  "..",
);
const scripts: Record<string, string> = JSON.parse(
  readFileSync(join(repoRoot, "package.json"), "utf8"),
).scripts;

/**
 * Installing into the running editor is the step that kept failing silently:
 * `code --install-extension *.vsix` also hands the CLI the older builds that
 * pile up in `packages/vscode`, the CLI refuses a version that is not newer
 * unless `--force` is given, and the editor keeps running the previous build
 * while the command looks like it worked.
 *
 * The scripts therefore go through `scripts/install-here.sh`, which force
 * installs the file it just built and then proves the editor got it.
 */
describe("installing the local build", () => {
  it("goes through the install script instead of globbing *.vsix", () => {
    for (const name of ["vscode:install", "vscode:package"]) {
      expect(scripts[name], name).toContain("scripts/install-here.sh");
      expect(scripts[name], name).not.toContain("*.vsix");
    }
  });

  it("offers a way to ask whether the editor runs the local build", () => {
    expect(scripts["vscode:check"]).toContain("scripts/install-here.sh");
    expect(scripts["vscode:check"]).toContain("--check");
  });

  it("keeps type-checking out of the packaged bundle's way", () => {
    // tsconfig.json is JSONC, so match rather than parse it.
    const tsconfig = readFileSync(
      join(repoRoot, "packages", "vscode", "tsconfig.json"),
      "utf8",
    );

    // `dist/extension.js` is the esbuild bundle that gets packaged and that the
    // install check compares against. If tsc emits JavaScript there too, a
    // `npm run typecheck` silently replaces the bundle with a plain compiled
    // module, and a later package run ships the wrong main.
    expect(tsconfig).toMatch(/"emitDeclarationOnly"\s*:\s*true/);
  });
});
