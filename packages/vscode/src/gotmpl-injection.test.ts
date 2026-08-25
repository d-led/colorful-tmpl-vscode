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

type SelectorAtom = { scope: string; exclusions: string[] };

function selectorAtoms(selector: string): SelectorAtom[] {
  return selector.split(",").map((part) => {
    const [scope, ...rest] = part.trim().split(/\s+/);
    return {
      scope: scope.replace(/^L:/, ""),
      exclusions: rest
        .filter((token) => token.startsWith("-"))
        .map((token) => token.slice(1)),
    };
  });
}

describe("gotmpl injection grammar", () => {
  it("injects into every source and text language, never inside comments or strings", () => {
    const atoms = selectorAtoms(injectionSelector());

    // `source` and `text` are scope-selector prefixes: they match every
    // `source.*` (Go, Java, Python, C++, Rust, ...) and `text.*` (HTML, ...) host.
    expect(atoms.map((atom) => atom.scope)).toEqual(["source", "text"]);

    for (const atom of atoms) {
      expect(atom.exclusions).toContain("comment");
      expect(atom.exclusions).toContain("string");
    }
  });

  it("is registered (injectTo) for the same scopes it selects", () => {
    // VS Code only applies an injection grammar to scopes listed in `injectTo`;
    // the grammar file's `injectionSelector` alone is not enough to register it.
    const scopes = selectorAtoms(injectionSelector()).map((atom) => atom.scope);
    expect(packageInjectTo()).toEqual(scopes);
  });
});
