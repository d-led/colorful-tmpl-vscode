import { readFileSync } from "node:fs";
import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import { describe, expect, it } from "vitest";
import { classifyToken, VARIABLE_TOKEN_TYPE } from "./semantic-tokens.js";
import { computeDecorations } from "./template-decorations.js";

/** The template behind the README screenshot, the canonical template example. */
function readScreenshotTemplate(): string {
  return readFileSync(
    new URL("../../../screenshot.tmpl", import.meta.url),
    "utf8",
  );
}

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

describe("variable highlighting paths agree", () => {
  it("spots the same spans as variables in the semantic and the decoration pass", () => {
    const source = readScreenshotTemplate();
    const tokens = tokenize(source);

    const painted = computeDecorations(tokens, source.length, 6);
    const decoratedSpans = [
      ...painted.varAssign,
      ...painted.varDef,
      ...painted.varUse,
    ].sort((a, b) => a.start - b.start);
    const semanticSpans = tokens
      .filter((t) => classifyToken(t)?.type === VARIABLE_TOKEN_TYPE)
      .map((t) => ({ start: t.start, end: t.end }));

    const text = (spans: { start: number; end: number }[]) =>
      spans.map((s) => source.slice(s.start, s.end));

    expect(text(semanticSpans)).toEqual(text(decoratedSpans));
  });
});
