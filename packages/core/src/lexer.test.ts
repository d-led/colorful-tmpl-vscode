import { describe, expect, it } from "vitest";
import { tokenize } from "./lexer.js";
import { TokenType } from "./types.js";

// Helper: extract just the types from a token array, for simple assertions.
function tokenTypes(source: string): TokenType[] {
  return tokenize(source).map((t) => t.type);
}

// Helper: get tokens of a specific type
function tokensOfType(source: string, type: TokenType) {
  return tokenize(source).filter((t) => t.type === type);
}

describe("tokenize: plain text", () => {
  it("returns single Text token for plain string", () => {
    const result = tokenize("hello world");
    expect(result).toEqual([
      { type: TokenType.Text, start: 0, end: 11, nestingLevel: 0 },
    ]);
  });

  it("returns Text tokens separated by actions", () => {
    const result = tokenize("before {{ . }} after");
    expect(result[0]).toMatchObject({ type: TokenType.Text });
    expect(result[1]).toMatchObject({ type: TokenType.DelimOpen });
    expect(result[2]).toMatchObject({ type: TokenType.Dot });
    expect(result[3]).toMatchObject({ type: TokenType.DelimClose });
    expect(result[4]).toMatchObject({ type: TokenType.Text });
  });

  it("returns empty array for empty input", () => {
    expect(tokenize("")).toEqual([]);
  });
});

describe("tokenize: delimiters", () => {
  it("recognizes standard {{ }} delimiters", () => {
    const types = tokenTypes("{{ . }}");
    expect(types).toContain(TokenType.DelimOpen);
    expect(types).toContain(TokenType.DelimClose);
  });

  it("recognizes whitespace-trimming {{- -}}", () => {
    const types = tokenTypes("{{- . -}}");
    expect(types).toContain(TokenType.DelimOpen);
    expect(types).toContain(TokenType.DelimClose);
  });
});

describe("tokenize: dot (context)", () => {
  it("tokenizes . as Dot", () => {
    const result = tokenize("{{ . }}");
    expect(result[1]).toMatchObject({ type: TokenType.Dot, start: 3, end: 4 });
  });
});

describe("tokenize: strings", () => {
  it("tokenizes double-quoted strings", () => {
    const strTokens = tokensOfType('{{ "hello" }}', TokenType.String);
    expect(strTokens).toHaveLength(1);
    expect(strTokens[0]).toMatchObject({ start: 3, end: 10 });
  });

  it("tokenizes backtick-quoted strings", () => {
    const strTokens = tokensOfType("{{ `hello` }}", TokenType.String);
    expect(strTokens).toHaveLength(1);
  });

  it("handles escaped quotes inside strings", () => {
    const strTokens = tokensOfType('{{ "he\\"llo" }}', TokenType.String);
    expect(strTokens).toHaveLength(1);
  });
});

describe("tokenize: pipes", () => {
  it("tokenizes | as Pipe", () => {
    const result = tokenize('{{ "x" | print }}');
    const pipes = result.filter((t) => t.type === TokenType.Pipe);
    expect(pipes).toHaveLength(1);
    // source: {{ "x" | print }}
    //          0123456789...
    // pipe at position 7
    expect(pipes[0]).toMatchObject({ start: 7, end: 8, nestingLevel: 0 });
  });
});

describe("tokenize: variables", () => {
  it("tokenizes $x := as VariableDef + Operator", () => {
    const result = tokenize("{{ $x := 1 }}");
    const defs = result.filter((t) => t.type === TokenType.VariableDef);
    expect(defs).toHaveLength(1);
    // $x is chars at positions 3,4
    expect(defs[0]).toMatchObject({ start: 3, end: 5 });
    const ops = result.filter(
      (t) => t.type === TokenType.Operator && t.start === 6,
    );
    expect(ops).toHaveLength(1);
    expect(ops[0]).toMatchObject({ start: 6, end: 8 }); // :=
  });

  it("tokenizes $x = as VariableAssign + Operator", () => {
    const result = tokenize("{{ $x = 1 }}");
    const assigns = result.filter((t) => t.type === TokenType.VariableAssign);
    expect(assigns).toHaveLength(1);
  });

  it("tokenizes plain $x as VariableUse", () => {
    const result = tokenize("{{ $x }}");
    const uses = result.filter((t) => t.type === TokenType.VariableUse);
    expect(uses).toHaveLength(1);
    expect(uses[0]).toMatchObject({ start: 3, end: 5 });
  });

  it("distinguishes def, assign, and use in same template", () => {
    const types = tokenTypes("{{ $x := 1 }} {{ $x = 2 }} {{ $x }}");
    expect(types).toContain(TokenType.VariableDef);
    expect(types).toContain(TokenType.VariableAssign);
    expect(types).toContain(TokenType.VariableUse);
  });

  it("tokenizes $variable with dots as VariableUse", () => {
    const result = tokenize("{{ $x.y }}");
    const uses = result.filter((t) => t.type === TokenType.VariableUse);
    expect(uses).toHaveLength(1);
    // $x.y is positions 3,4,5,6
    expect(uses[0]).toMatchObject({ start: 3, end: 7 });
  });
});

describe("tokenize: keywords and nesting", () => {
  it("recognizes if/end as keywords", () => {
    const types = tokenTypes("{{ if true }}hi{{ end }}");
    const keywords = types.filter((t) => t === TokenType.Keyword);
    expect(keywords).toHaveLength(2);
  });

  it("increases nesting on if, decreases on end", () => {
    const result = tokenize("before {{ if true }}inside{{ end }}after");
    // Text before action
    expect(result[0]).toMatchObject({ type: TokenType.Text, nestingLevel: 0 });
    // Text inside if
    const insideText = result.find(
      (t) => t.type === TokenType.Text && t.start > 13,
    );
    expect(insideText?.nestingLevel).toBe(1);
    // Text after end
    const afterText = result[result.length - 1];
    expect(afterText).toMatchObject({ type: TokenType.Text, nestingLevel: 0 });
  });

  it("handles nested if/range/with", () => {
    const result = tokenize(
      "{{ if true }}{{ range . }}{{ with . }}deep{{ end }}{{ end }}{{ end }}",
    );
    // deep is inside if (level 1) > range (level 2) > with (level 3)
    const deepText = result.find((t) => t.type === TokenType.Text && t.nestingLevel === 3);
    expect(deepText).toBeDefined();
  });

  it("keeps else at same nesting level as if", () => {
    const result = tokenize("{{ if true }}a{{ else }}b{{ end }}");
    const keywords = result.filter((t) => t.type === TokenType.Keyword);
    // if, else, end — all 3 should be at the same nesting level
    expect(keywords).toHaveLength(3);
    const levels = new Set(keywords.map((kw) => kw.nestingLevel));
    expect(levels.size).toBe(1);
  });

  it("recognizes range and with as nesting keywords", () => {
    const types = tokenTypes("{{ range . }}{{ with . }}{{ end }}{{ end }}");
    const keywords = types.filter((t) => t === TokenType.Keyword);
    expect(keywords).toHaveLength(4); // range, with, end, end
  });

  it("recognizes define and template as keywords", () => {
    const types = tokenTypes('{{ define "T1" }}body{{ end }}{{ template "T1" . }}');
    const keywords = types.filter((t) => t === TokenType.Keyword);
    // define, end, template = 3 keywords
    expect(keywords).toHaveLength(3);
  });
});

describe("tokenize: numbers and booleans", () => {
  it("tokenizes integer literals", () => {
    const result = tokenize("{{ 42 }}");
    expect(result).toContainEqual(
      expect.objectContaining({ type: TokenType.Number }),
    );
  });

  it("tokenizes true/false as identifiers (function-like)", () => {
    // Our lexer treats true/false as function calls currently.
    // That's acceptable for highlighting — they're not keywords in Go template
    // syntax, they're predeclared identifiers.
    const result = tokenize("{{ true }}");
    const funcs = result.filter((t) => t.type === TokenType.Function);
    expect(funcs).toHaveLength(1);
  });
});

describe("tokenize: functions", () => {
  it("tokenizes print as a function", () => {
    const result = tokenize('{{ print "hello" }}');
    const funcs = result.filter((t) => t.type === TokenType.Function);
    expect(funcs).toHaveLength(1);
    expect(funcs[0]).toMatchObject({ start: 3, end: 8 });
  });

  it("tokenizes index as a function", () => {
    const result = tokenize("{{ index . 0 }}");
    const funcs = result.filter((t) => t.type === TokenType.Function);
    expect(funcs).toHaveLength(1);
  });

  it("tokenizes dotted function names like coll.Slice", () => {
    const result = tokenize("{{ coll.Slice }}");
    const funcs = result.filter((t) => t.type === TokenType.Function);
    expect(funcs).toHaveLength(1);
    expect(funcs[0]).toMatchObject({ start: 3, end: 13 });
  });
});

describe("tokenize: comments", () => {
  it("tokenizes {{/* comment */}} as Comment", () => {
    const result = tokenize("{{/* this is a comment */}}");
    const comments = result.filter((t) => t.type === TokenType.Comment);
    expect(comments).toHaveLength(1);
  });
});

describe("tokenize: integration — real-world templates", () => {
  it("tokenizes a gomplate-style template", () => {
    const template = `Hello, {{ print "World" }}!
{{ range coll.Slice "Foo" "bar" "baz" }}
- {{ . }}
{{ end }}`;
    const result = tokenize(template);
    expect(result.length).toBeGreaterThan(0);
    // Should have keywords
    expect(result.some((t) => t.type === TokenType.Keyword)).toBe(true);
    // Should have functions
    expect(result.some((t) => t.type === TokenType.Function)).toBe(true);
    // Should have strings
    expect(result.some((t) => t.type === TokenType.String)).toBe(true);
  });

  it("tokenizes a variable definition and use pattern", () => {
    const template = `{{ $w := "" }}
{{ if 1 }}
{{ $w = "world" }}
{{ else }}
{{ $w = "earth" }}
{{ end -}}
Hello, {{ print $w }}!`;
    const result = tokenize(template);
    const defs = result.filter((t) => t.type === TokenType.VariableDef);
    const assigns = result.filter((t) => t.type === TokenType.VariableAssign);
    const uses = result.filter((t) => t.type === TokenType.VariableUse);
    expect(defs).toHaveLength(1);
    expect(assigns).toHaveLength(2);
    expect(uses).toHaveLength(1);
  });
});

describe("tokenize: edge cases", () => {
  it("handles }} inside a string literal safely", () => {
    // The string scanner consumes until matching quote; }} inside is literal
    const result = tokenize('{{ "contains }}" }}');
    const strings = result.filter((t) => t.type === TokenType.String);
    expect(strings).toHaveLength(1);
  });

  it("handles template with no actions", () => {
    const result = tokenize("just plain text\nwith newlines");
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      type: TokenType.Text,
      start: 0,
      end: 29,
      nestingLevel: 0,
    });
  });

  it("handles adjacent actions with no text between", () => {
    const result = tokenize("{{ a }}{{ b }}");
    const delimOpens = result.filter((t) => t.type === TokenType.DelimOpen);
    expect(delimOpens).toHaveLength(2);
  });

  it("does not nest on end keyword appearance", () => {
    const result = tokenize("{{ end }}");
    // All tokens should be at level 0
    result.forEach((t) => {
      expect(t.nestingLevel).toBe(0);
    });
  });
});
