import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import type {
  IGrammar,
  IOnigLib,
  IRawGrammar,
  IToken,
  StateStack,
} from "vscode-textmate";

// `vscode-textmate` and `vscode-oniguruma` ship CommonJS builds; load them via
// `require` so the grammar test also runs under plain Node and vitest interop.
const require = createRequire(import.meta.url);
const { INITIAL, Registry } = require(
  "vscode-textmate",
) as typeof import("vscode-textmate");
const { createOnigScanner, createOnigString, loadWASM } = require(
  "vscode-oniguruma",
) as typeof import("vscode-oniguruma");

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const injectionGrammar = JSON.parse(
  readFileSync(join(pkgRoot, "syntaxes", "gotmpl-injection.json"), "utf8"),
) as IRawGrammar;
// Vendored, unmodified fixture from Red Hat's vscode-java repo (EPL-2.0).
// See fixtures/grammars/NOTICE.md for source, commit, and license.
const javaGrammar = JSON.parse(
  readFileSync(join(pkgRoot, "fixtures", "grammars", "java.tmLanguage.json"), "utf8"),
) as IRawGrammar;

let java: IGrammar;

beforeAll(async () => {
  const wasmBin = readFileSync(
    join(dirname(require.resolve("vscode-oniguruma")), "onig.wasm"),
  );
  await loadWASM(wasmBin);

  const onigLib = Promise.resolve({
    createOnigScanner: (patterns: string[]) => createOnigScanner(patterns),
    createOnigString: (str: string) => createOnigString(str),
  }) as unknown as Promise<IOnigLib>;

  const registry = new Registry({
    onigLib,
    loadGrammar: async (scopeName) => {
      if (scopeName === "source.java") return javaGrammar;
      if (scopeName === "gotmpl.injection") return injectionGrammar;
      return null;
    },
    getInjections: (scopeName) =>
      scopeName === "source.java" ? ["gotmpl.injection"] : undefined,
  });

  const grammar = await registry.loadGrammar("source.java");
  if (!grammar) throw new Error("failed to load source.java grammar");
  java = grammar;
});

/** Tokenizes a document (one string per line) and returns every produced token. */
function tokenize(lines: string[]): IToken[] {
  const tokens: IToken[] = [];
  let state: StateStack | null = INITIAL;
  for (const line of lines) {
    const result = java.tokenizeLine(line, state);
    state = result.ruleStack;
    tokens.push(...result.tokens);
  }
  return tokens;
}

/** Every scope name produced by tokenizing the given document. */
function allScopes(lines: string[]): string[] {
  return tokenize(lines).flatMap((token) => token.scopes);
}

const COMBINED_JAVA_TEMPLATE = [
  "public class Greeting {",
  "    public static void main(String[] args) {",
  "        {{- if .ShowGreeting }}",
  '        System.out.println("Hello");',
  "        {{- end }}",
  "    }",
  "}",
];

describe("gotmpl injection into Java (combined syntax)", () => {
  it("injects {{ }} action scopes into Java code", () => {
    const scopes = allScopes(COMBINED_JAVA_TEMPLATE);

    expect(scopes).toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("keyword.control.gotmpl");
    expect(scopes).toContain("punctuation.definition.template.begin.gotmpl");
    expect(scopes).toContain("punctuation.definition.template.end.gotmpl");
  });

  it("keeps Java syntax highlighted around the injected actions", () => {
    const scopes = allScopes(COMBINED_JAVA_TEMPLATE);

    expect(scopes).toContain("source.java");
    expect(scopes).toContain("string.quoted.double.java");
  });

  it("does not inject inside Java comments or strings", () => {
    const scopes = allScopes(['String s = "{{ if .X }}"; // {{ if .Y }}']);

    expect(scopes).not.toContain("keyword.control.gotmpl");
    expect(scopes).not.toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("string.quoted.double.java");
    expect(scopes).toContain("comment.line.double-slash.java");
  });
});
