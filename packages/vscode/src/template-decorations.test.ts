import { tokenize } from "@colorful-tmpl/highlight-core";
import { describe, expect, it } from "vitest";
import type { Span } from "./go-strings.js";
import {
  computeDecorations,
  computeGoDecorations,
  countDecorations,
  decorationsForDocument,
} from "./template-decorations.js";

const PALETTE_SIZE = 6;

/** The source text covered by each span, in order. */
function slices(source: string, spans: Span[]): string[] {
  return spans.map((s) => source.slice(s.start, s.end));
}

/**
 * Level spans mix text backgrounds with `{{ }}` control-flow chips. Drop the
 * chips so assertions target only the text backgrounds.
 */
function textSlices(source: string, spans: Span[]): string[] {
  return slices(source, spans).filter((text) => !text.startsWith("{{"));
}

describe("computeDecorations (whole-document)", () => {
  it("paints the text between an if and its end at nesting level 1", () => {
    const source = "{{ if .X }}A{{ end }}";
    const decorations = computeDecorations(
      tokenize(source),
      source.length,
      PALETTE_SIZE,
    );

    expect(textSlices(source, decorations.byPaletteIndex.get(1) ?? [])).toEqual(
      ["A"],
    );
  });

  it("classifies variable definitions and uses", () => {
    const source = "{{ $x := .Name }}{{ $x }}";
    const decorations = computeDecorations(
      tokenize(source),
      source.length,
      PALETTE_SIZE,
    );

    expect(slices(source, decorations.varDef)).toEqual(["$x"]);
    expect(slices(source, decorations.varUse)).toEqual([".Name", "$x"]);
  });
});

describe("computeGoDecorations (strings-only)", () => {
  it("paints nothing for Go composite literals", () => {
    const source = "x := [][]int{{1, 2}, {3, 4}}";
    const decorations = computeGoDecorations(source, PALETTE_SIZE);

    expect(decorations.varUse).toEqual([]);
    expect(decorations.varDef).toEqual([]);
    expect(decorations.func).toEqual([]);
    expect([...decorations.byPaletteIndex.values()].flat()).toEqual([]);
    expect(decorations.comment).toEqual([]);
  });

  it("paints variables and fields inside a Go template string", () => {
    const source = "tmpl := `Hello, {{ .Name }}!`";
    const decorations = computeGoDecorations(source, PALETTE_SIZE);

    expect(slices(source, decorations.varUse)).toEqual([".Name"]);
  });

  it("paints nesting backgrounds between if and end inside a Go string", () => {
    const source = "tmpl := `{{ if .X }}A{{ end }}`";
    const decorations = computeGoDecorations(source, PALETTE_SIZE);

    expect(textSlices(source, decorations.byPaletteIndex.get(1) ?? [])).toEqual(
      ["A"],
    );
  });

  it("classifies variable definitions and uses inside a Go string", () => {
    const source = "tmpl := `{{ $x := .Name }}{{ $x }}`";
    const decorations = computeGoDecorations(source, PALETTE_SIZE);

    expect(slices(source, decorations.varDef)).toEqual(["$x"]);
    expect(slices(source, decorations.varUse)).toEqual([".Name", "$x"]);
  });

  it("keeps separate Go strings from merging backgrounds", () => {
    const source = "a := `{{ if .X }}A{{ end }}`\nb := `{{ if .Y }}B{{ end }}`";
    const decorations = computeGoDecorations(source, PALETTE_SIZE);

    expect(textSlices(source, decorations.byPaletteIndex.get(1) ?? [])).toEqual(
      ["A", "B"],
    );
  });
});

describe("decorationsForDocument", () => {
  it("decorates the whole file when the language is the template's own", () => {
    const source = "{{ if .X }}{{ $x := 1 }}{{ $x }}{{ end }}";

    const counts = countDecorations(
      decorationsForDocument("colorful-tmpl", source, PALETTE_SIZE),
    );

    expect(counts.definitions).toBe(1);
    expect(counts.uses).toBe(2); // .X and $x
    expect(counts.bands).toBeGreaterThan(0);
  });

  it("only decorates string literals when the host language uses {{ }} too", () => {
    const goSource = [
      "package main",
      "",
      "var matrix = [][]int{{1, 2}, {3, 4}}",
      'var tmpl = "{{ $x := .Name }}{{ $x }}"',
    ].join("\n");

    const decorations = decorationsForDocument("go", goSource, PALETTE_SIZE);

    expect(slices(goSource, decorations.varDef)).toEqual(["$x"]);
    expect(slices(goSource, decorations.varUse)).toEqual([".Name", "$x"]);
    // Nothing is painted for the composite literal on the line above.
    expect(countDecorations(decorations)).toEqual({
      definitions: 1,
      assignments: 0,
      uses: 2,
      functions: 0,
      bands: 0,
    });
  });

  it("counts nothing for a host file without template actions", () => {
    const counts = countDecorations(
      decorationsForDocument("python", "print('hello')", PALETTE_SIZE),
    );

    expect(counts).toEqual({
      definitions: 0,
      assignments: 0,
      uses: 0,
      functions: 0,
      bands: 0,
    });
  });
});

describe("countDecorations", () => {
  it("counts each class of range", () => {
    const source = "{{ $x := .Name }}{{ $x := 1 }}{{ $x }}";

    const counts = countDecorations(
      computeDecorations(tokenize(source), source.length, PALETTE_SIZE),
    );

    expect(counts.definitions).toBe(2);
    expect(counts.uses).toBe(2);
    expect(counts.bands).toBe(0);
  });
});
