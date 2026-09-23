import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import { describe, expect, it } from "vitest";
import { classifyToken } from "./semantic-tokens.js";

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

function classify(source: string, type: TokenType) {
  const tok = tokenize(source).find((t) => t.type === type);
  if (!tok) throw new Error(`no ${type} token in ${JSON.stringify(source)}`);
  return classifyToken(tok);
}

describe("classifyToken", () => {
  it("classifies variable definitions and assignments as read-write", () => {
    expect(classify("{{ $x := 1 }}", TokenType.VariableDef)).toEqual({
      type: "colorfulTmplVariable",
      modifiers: ["colorfulTmplDefinition"],
    });
    expect(classify("{{ $x = 1 }}", TokenType.VariableAssign)).toEqual({
      type: "colorfulTmplVariable",
      modifiers: ["colorfulTmplAssignment"],
    });
  });

  it("classifies field access and the bare dot as readonly variables", () => {
    expect(classify("{{ .Name }}", TokenType.Field)).toEqual({
      type: "colorfulTmplVariable",
      modifiers: ["readonly"],
    });
    expect(classify("{{ . }}", TokenType.Dot)).toEqual({
      type: "colorfulTmplVariable",
      modifiers: ["readonly"],
    });
  });

  it("leaves functions and other tokens unstyled", () => {
    const func = tokenize('{{ printf "%s" }}').find(
      (t) => t.type === TokenType.Function,
    );
    expect(classifyToken(func!)).toBeNull();
  });
});

describe("semantic token scopes align with the grammar", () => {
  it("uses the same .gotmpl suffix the grammar uses", () => {
    const pkg = JSON.parse(readFileSync(join(pkgRoot, "package.json"), "utf8"));
    const scopes: Record<string, string[]> =
      pkg.contributes.semanticTokenScopes[0].scopes;

    const all = Object.values(scopes).flat();
    expect(all.length).toBeGreaterThan(0);
    for (const scope of all) {
      expect(scope.endsWith(".gotmpl")).toBe(true);
    }
  });
});
