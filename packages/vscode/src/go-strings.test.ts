import { describe, expect, it } from "vitest";
import { goStringContents } from "./go-strings.js";

/** Returns the source text covered by each range. */
function contents(source: string): string[] {
  return goStringContents(source).map((r) => source.slice(r.start, r.end));
}

describe("goStringContents", () => {
  it("extracts double-quoted and raw string contents", () => {
    const source = 'a := "x{{ .A }}y"\nb := `raw {{ .B }}`';
    expect(contents(source)).toEqual(["x{{ .A }}y", "raw {{ .B }}"]);
  });

  it("extracts a raw string spanning multiple lines", () => {
    const source = "tmpl := `Hello\n{{ .Name }}\n`";
    expect(contents(source)).toEqual(["Hello\n{{ .Name }}\n"]);
  });

  it("handles backslash escapes inside double-quoted strings", () => {
    const source = 's := "a\\"b{{ .X }}"';
    expect(contents(source)).toEqual(['a\\"b{{ .X }}']);
  });

  it("ignores quotes inside comments and rune literals", () => {
    const source =
      '// "not a string"\n/* `also not` */\nc := \'"\'\nd := "real"';
    expect(contents(source)).toEqual(["real"]);
  });

  it("returns no ranges for composite literals (no string delimiters)", () => {
    expect(goStringContents("x := [][]int{{1, 2}, {3, 4}}")).toEqual([]);
  });
});
