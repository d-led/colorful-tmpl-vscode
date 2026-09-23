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
const { INITIAL, Registry } =
  require("vscode-textmate") as typeof import("vscode-textmate");
const { createOnigScanner, createOnigString, loadWASM } =
  require("vscode-oniguruma") as typeof import("vscode-oniguruma");

const pkgRoot = join(dirname(fileURLToPath(import.meta.url)), "..");

const injectionGrammar = JSON.parse(
  readFileSync(join(pkgRoot, "syntaxes", "gotmpl-injection.json"), "utf8"),
) as IRawGrammar;
// Vendored, unmodified test fixtures. See fixtures/grammars/NOTICE.md for
// source, commit, and license of each grammar.
const javaGrammar = JSON.parse(
  readFileSync(
    join(pkgRoot, "fixtures", "grammars", "java.tmLanguage.json"),
    "utf8",
  ),
) as IRawGrammar;
const goGrammar = JSON.parse(
  readFileSync(
    join(pkgRoot, "fixtures", "grammars", "go.tmLanguage.json"),
    "utf8",
  ),
) as IRawGrammar;

let java: IGrammar;
let go: IGrammar;

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
      if (scopeName === "source.go") return goGrammar;
      if (scopeName === "gotmpl.injection") return injectionGrammar;
      return null;
    },
    getInjections: (scopeName) =>
      scopeName === "source.java" || scopeName === "source.go"
        ? ["gotmpl.injection"]
        : undefined,
  });

  const load = async (scopeName: string): Promise<IGrammar> => {
    const grammar = await registry.loadGrammar(scopeName);
    if (!grammar) throw new Error(`failed to load ${scopeName} grammar`);
    return grammar;
  };
  java = await load("source.java");
  go = await load("source.go");
});

/** Tokenizes a document (one string per line) and returns every produced token. */
function tokenize(grammar: IGrammar, lines: string[]): IToken[] {
  const tokens: IToken[] = [];
  let state: StateStack | null = INITIAL;
  for (const line of lines) {
    const result = grammar.tokenizeLine(line, state);
    state = result.ruleStack;
    tokens.push(...result.tokens);
  }
  return tokens;
}

/** Every scope name produced by tokenizing the given document. */
function allScopes(grammar: IGrammar, lines: string[]): string[] {
  return tokenize(grammar, lines).flatMap((token) => token.scopes);
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

describe("gotmpl injection into Java (template as container)", () => {
  it("injects {{ }} action scopes into Java code", () => {
    const scopes = allScopes(java, COMBINED_JAVA_TEMPLATE);

    expect(scopes).toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("keyword.control.gotmpl");
    expect(scopes).toContain("punctuation.definition.template.begin.gotmpl");
    expect(scopes).toContain("punctuation.definition.template.end.gotmpl");
  });

  it("keeps Java syntax highlighted around the injected actions", () => {
    const scopes = allScopes(java, COMBINED_JAVA_TEMPLATE);

    expect(scopes).toContain("source.java");
    expect(scopes).toContain("string.quoted.double.java");
  });

  it("does not inject inside Java comments", () => {
    const scopes = allScopes(java, ["// {{ if .Y }}"]);

    expect(scopes).not.toContain("keyword.control.gotmpl");
    expect(scopes).not.toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("comment.line.double-slash.java");
  });
});

describe("gotmpl injection into Java strings (template in string)", () => {
  it("injects {{ }} into a double-quoted string", () => {
    const scopes = allScopes(java, ['String s = "Hello {{ .Name }}";']);

    expect(scopes).toContain("string.quoted.double.java");
    expect(scopes).toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("punctuation.definition.template.begin.gotmpl");
  });

  it("injects {{ }} across a verbatim multiline text block", () => {
    const scopes = allScopes(java, [
      'String s = """',
      "    {{- if .X }}",
      "    hello {{ .Name }}",
      "    {{- end }}",
      '    """;',
    ]);

    expect(scopes).toContain("string.quoted.triple.java");
    expect(scopes).toContain("keyword.control.gotmpl");
    expect(scopes).toContain("variable.language.gotmpl");
  });
});

describe("gotmpl injection into Go (never at top level, always in strings)", () => {
  it("does not inject into nested composite literals", () => {
    const scopes = allScopes(go, ["x := [][]int{{1, 2}, {3, 4}}"]);

    expect(scopes).toContain("source.go");
    expect(scopes).not.toContain("meta.embedded.block.gotmpl");
    expect(scopes).not.toContain("constant.numeric.gotmpl");
  });

  it("injects {{ }} into a double-quoted string", () => {
    const scopes = allScopes(go, ['tmpl := "Hello {{ .Name }}"']);

    expect(scopes).toContain("string.quoted.double.go");
    expect(scopes).toContain("meta.embedded.block.gotmpl");
    expect(scopes).toContain("variable.language.gotmpl");
  });

  it("injects {{ }} into a verbatim multiline raw string", () => {
    const scopes = allScopes(go, [
      "tmpl := `Hello",
      "{{- if .X }}",
      "{{ .Name }}",
      "{{- end }}`",
    ]);

    expect(scopes).toContain("string.quoted.raw.go");
    expect(scopes).toContain("keyword.control.gotmpl");
    expect(scopes).toContain("variable.language.gotmpl");
  });
});
