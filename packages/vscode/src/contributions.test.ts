import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "@colorful-tmpl/highlight-core";
import { describe, expect, it } from "vitest";

import { DEFAULT_CUSTOM_LEVELS, HIGHLIGHT_SWITCH_DEFAULTS } from "./palette.js";
import {
  classifyToken,
  TOKEN_MODIFIERS,
  TOKEN_TYPES,
  VARIABLE_TOKEN_TYPE,
} from "./semantic-tokens.js";

/**
 * The declarative surface the extension promises VS Code. VS Code ignores
 * malformed contributions without any error, so highlighting can look broken
 * while every runtime test still passes — these checks catch that.
 */
const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const contributes = JSON.parse(
  readFileSync(join(pkgRoot, "package.json"), "utf8"),
).contributes;

/** Token names VS Code itself defines; all others must be contributed. */
const standard = {
  types: new Set(["keyword", "variable"]),
  modifiers: new Set(["readonly"]),
};

type Selector = { type: string; modifiers: string[] };

function declaredSelectors(language: string): Selector[] {
  const entry = contributes.semanticTokenScopes.find(
    (e: { language?: string }) => e.language === language,
  );
  expect(entry, `no semanticTokenScopes for ${language}`).toBeDefined();
  return Object.keys(entry.scopes).map((selector: string) => {
    const [type, ...modifiers] = selector.split(".");
    return { type, modifiers };
  });
}

/** Every classification the provider is able to emit. */
function emittedClassifications() {
  const corpus = [
    "{{ $x := 1 }}",
    "{{ $x = 2 }}",
    "{{ $x }}",
    "{{ range $i, $v := .Items }}{{ $i }}{{ . }}{{ .Field }}{{ end }}",
  ].join("\n");
  return tokenize(corpus)
    .map(classifyToken)
    .filter((c) => c !== null);
}

describe("package.json contributions", () => {
  it("declares every token type and modifier the provider can emit", () => {
    for (const { type, modifiers } of emittedClassifications()) {
      expect(TOKEN_TYPES).toContain(type);
      for (const modifier of modifiers)
        expect(TOKEN_MODIFIERS).toContain(modifier);
    }
  });

  it("contributes the custom token types and modifiers used in the legend", () => {
    const contributedTypes = contributes.semanticTokenTypes.map(
      (t: { id: string }) => t.id,
    );
    const contributedModifiers = contributes.semanticTokenModifiers.map(
      (m: { id: string }) => m.id,
    );

    for (const type of TOKEN_TYPES) {
      if (!standard.types.has(type)) expect(contributedTypes).toContain(type);
    }
    for (const modifier of TOKEN_MODIFIERS) {
      if (!standard.modifiers.has(modifier)) {
        expect(contributedModifiers).toContain(modifier);
      }
    }
  });

  it("writes semantic token selectors as type plus dot-separated modifiers", () => {
    for (const { type, modifiers } of declaredSelectors("colorful-tmpl")) {
      expect(TOKEN_TYPES, `selector type ${type}`).toContain(type);
      for (const modifier of modifiers) {
        expect(TOKEN_MODIFIERS, `selector modifier ${modifier}`).toContain(
          modifier,
        );
      }
    }
  });

  it("maps the variable token type to the grammar's scopes", () => {
    const variableSelectors = declaredSelectors("colorful-tmpl").filter(
      (s) => s.type === VARIABLE_TOKEN_TYPE,
    );

    expect(variableSelectors.length).toBeGreaterThan(0);
    for (const scopes of Object.values(
      contributes.semanticTokenScopes[0].scopes as Record<string, string[]>,
    )) {
      for (const scope of scopes) expect(scope.endsWith(".gotmpl")).toBe(true);
    }
  });

  it("ships the same custom palette default the code falls back to", () => {
    const customDefault =
      contributes.configuration.properties["colorful-tmpl.palette.custom"]
        .default;

    expect(customDefault).toEqual(DEFAULT_CUSTOM_LEVELS);
  });

  it("ships both highlight switches on, so no build silently loses variable spotting", () => {
    for (const [key, shipped] of Object.entries(HIGHLIGHT_SWITCH_DEFAULTS)) {
      const declared =
        contributes.configuration.properties[`colorful-tmpl.palette.${key}`]
          .default;

      // The code falls back to its own constant; if the two drift apart, a
      // build can ship with variable spotting off and look broken rather than
      // unconfigured.
      expect(declared, `${key} default`).toBe(shipped);
    }
  });
});
