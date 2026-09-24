import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize } from "@colorful-tmpl/highlight-core";
import { describe, expect, it } from "vitest";

import {
  DEFAULT_CUSTOM_LEVELS,
  HIGHLIGHT_SECTION,
  HIGHLIGHT_SWITCH_DEFAULTS,
  HIGHLIGHT_SWITCH_KEYS,
  LEGACY_SWITCH_KEYS,
  PALETTE_SECTION,
} from "./palette.js";
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

/** `configuration` may be one node or several; the settings UI groups by them. */
type ConfigurationNode = {
  title?: string;
  order?: number;
  properties: Record<
    string,
    { default?: unknown; deprecationMessage?: string }
  >;
};

const configurationNodes: ConfigurationNode[] = Array.isArray(
  contributes.configuration,
)
  ? contributes.configuration
  : [contributes.configuration];

const properties: ConfigurationNode["properties"] = Object.assign(
  {},
  ...configurationNodes.map((node) => node.properties),
);

function nodeOwning(setting: string): ConfigurationNode {
  const node = configurationNodes.find((n) => setting in n.properties);
  expect(node, `no configuration node declares ${setting}`).toBeDefined();
  return node!;
}

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
    expect(properties["colorful-tmpl.palette.custom"].default).toEqual(
      DEFAULT_CUSTOM_LEVELS,
    );
  });

  it("ships every highlight switch on, so no build silently loses highlighting", () => {
    for (const [switchName, shipped] of Object.entries(
      HIGHLIGHT_SWITCH_DEFAULTS,
    )) {
      const setting = `${HIGHLIGHT_SECTION}.${HIGHLIGHT_SWITCH_KEYS[switchName as keyof typeof HIGHLIGHT_SWITCH_DEFAULTS]}`;

      // The code falls back to its own constant; if the two drift apart, a
      // build can ship with a class of highlighting off and look broken.
      expect(properties[setting]?.default, `${setting} default`).toBe(shipped);
    }
  });

  it("keeps the switches in their own section above the palette", () => {
    const keys = Object.values(HIGHLIGHT_SWITCH_KEYS).map(
      (key) => `${HIGHLIGHT_SECTION}.${key}`,
    );

    // VS Code sorts settings alphabetically within a section, so the switches
    // only stay together (and above the palette) as their own section.
    expect(Object.keys(nodeOwning(keys[0]).properties).sort()).toEqual(
      keys.sort(),
    );
    expect(nodeOwning(keys[0]).order).toBeLessThan(
      nodeOwning(`${PALETTE_SECTION}.preset`).order ?? 0,
    );
  });

  it("declares the pre-0.1.4 switch keys as deprecated aliases", () => {
    for (const legacy of Object.values(LEGACY_SWITCH_KEYS)) {
      const setting = `${PALETTE_SECTION}.${legacy}`;

      expect(
        properties[setting]?.deprecationMessage,
        `${setting} deprecation message`,
      ).toBeTruthy();
    }
  });
});
