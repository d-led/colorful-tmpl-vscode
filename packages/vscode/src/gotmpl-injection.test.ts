import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function injectionSelector(): string {
  const grammar = JSON.parse(
    readFileSync(join(pkgRoot, "syntaxes", "gotmpl-injection.json"), "utf8"),
  );
  return grammar.injectionSelector as string;
}

/** Scope names the injection grammar is registered for in package.json (`injectTo`). */
function packageInjectTo(): string[] {
  const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
  const grammar = pkg.contributes.grammars.find(
    (g: { scopeName?: string }) => g.scopeName === "colorful-tmpl.injection",
  );
  if (!grammar?.injectTo) throw new Error("injectTo not found in package.json");
  return grammar.injectTo as string[];
}

type SelectorGroup = {
  leftmostScope: string;
  positives: string[];
  exclusions: string[];
};

/** Splits a VS Code injection selector into its comma-separated scope groups. */
function selectorGroups(selector: string): SelectorGroup[] {
  return selector.split(",").map((part) => {
    const [leftmost, ...rest] = part.trim().split(/\s+/);
    return {
      leftmostScope: leftmost.replace(/^L:/, ""),
      positives: rest.filter((token) => !token.startsWith("-")),
      exclusions: rest
        .filter((token) => token.startsWith("-"))
        .map((token) => token.slice(1)),
    };
  });
}

describe("gotmpl injection grammar", () => {
  it("injects top-level actions and template strings in source and text", () => {
    const groups = selectorGroups(injectionSelector());

    // Template-as-container: `{{ }}` at top level, never inside comments/strings.
    const topLevelSource = groups.find(
      (g) => g.leftmostScope === "source" && g.positives.length === 0,
    );
    expect(topLevelSource?.exclusions).toEqual(
      expect.arrayContaining(["source.go", "comment", "string"]),
    );

    const topLevelText = groups.find(
      (g) => g.leftmostScope === "text" && g.positives.length === 0,
    );
    expect(topLevelText?.exclusions).toEqual(
      expect.arrayContaining(["comment", "string"]),
    );

    // Template-in-string: quoted (incl. verbatim/multiline) and JS template literals.
    const sourceStringGroups = groups.filter(
      (g) => g.leftmostScope === "source" && g.positives.length > 0,
    );
    expect(
      sourceStringGroups.some((g) => g.positives.includes("string.quoted")),
    ).toBe(true);
    expect(
      sourceStringGroups.some((g) => g.positives.includes("string.template")),
    ).toBe(true);

    const textStringGroups = groups.filter(
      (g) => g.leftmostScope === "text" && g.positives.length > 0,
    );
    expect(
      textStringGroups.some((g) => g.positives.includes("string.quoted")),
    ).toBe(true);
    expect(
      textStringGroups.some((g) => g.positives.includes("string.template")),
    ).toBe(true);
  });

  it("excludes Go only from top-level injection, not from template strings", () => {
    const groups = selectorGroups(injectionSelector());

    // Go source code legitimately contains `{{`/`}}` in nested composite
    // literals (e.g. [][]int{{1,2},{3,4}}) outside strings and comments, so it
    // must be excluded from the top-level injection...
    const topLevelSource = groups.find(
      (g) => g.leftmostScope === "source" && g.positives.length === 0,
    );
    expect(topLevelSource?.exclusions).toContain("source.go");

    // ...but Go template strings (e.g. raw `...` literals) still light up.
    const sourceStringGroups = groups.filter(
      (g) => g.leftmostScope === "source" && g.positives.length > 0,
    );
    for (const group of sourceStringGroups) {
      expect(group.exclusions).not.toContain("source.go");
    }
  });

  it("is registered (injectTo) for the same scopes it selects", () => {
    // VS Code only applies an injection grammar to scopes listed in `injectTo`;
    // the grammar file's `injectionSelector` alone is not enough to register it.
    const scopes = [
      ...new Set(
        selectorGroups(injectionSelector()).map((g) => g.leftmostScope),
      ),
    ];
    expect(packageInjectTo()).toEqual(scopes);
  });
});
