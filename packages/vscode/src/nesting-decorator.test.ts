import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("vscode", () => import("./test/vscode-double.js"));

import { NestingDecorator } from "./nesting-decorator.js";
import {
  DEFAULT_CUSTOM_LEVELS,
  resolvePalette,
  type Palette,
} from "./palette.js";
import {
  editorFor,
  resetVscodeDouble,
  setSetting,
  showEditors,
  useColorTheme,
  type TestEditor,
} from "./test/vscode-double.js";

/**
 * The template behind the README screenshot. It is the canonical end-to-end
 * example: definitions, uses, fields, functions and four nesting levels.
 */
function readScreenshotTemplate(): string {
  return readFileSync(
    new URL("../../../screenshot.tmpl", import.meta.url),
    "utf8",
  );
}

const lightPalette = resolvePalette({
  isLightTheme: true,
  preset: "default",
  customLevels: DEFAULT_CUSTOM_LEVELS,
});

const darkPalette = resolvePalette({
  isLightTheme: false,
  preset: "default",
  customLevels: DEFAULT_CUSTOM_LEVELS,
});

/** What the editor painted, expressed as the source text behind each role. */
function paintedWith(editor: TestEditor, palette: Palette) {
  return {
    varDef: editor.textPaintedWith(palette.colors.varDef),
    varAssign: editor.textPaintedWith(palette.colors.varAssign),
    varUse: editor.textPaintedWith(palette.colors.varUse),
    func: editor.textPaintedWith(palette.colors.func),
    pipe: editor.textPaintedWith(palette.colors.pipe),
    comment: editor.textPaintedWith(palette.colors.comment),
    atLevel: (level: number) => editor.textPaintedWith(palette.levels[level]),
  };
}

/** Opens a template editor and runs the decorator over it. */
function decorate(source: string, languageId = "colorful-tmpl"): TestEditor {
  const editor = editorFor(source, languageId);
  showEditors(editor);
  new NestingDecorator().activate();
  return editor;
}

describe("NestingDecorator", () => {
  beforeEach(() => {
    resetVscodeDouble();
    useColorTheme("Light");
  });

  it("paints the README screenshot template's variables, functions and levels", () => {
    const editor = decorate(readScreenshotTemplate());

    const painted = paintedWith(editor, lightPalette);
    expect(painted.varDef).toEqual(["$tag", "$svc"]);
    expect(painted.varUse).toEqual([
      ".Tag",
      ".Services",
      "$tag",
      "$.Env",
      "$i",
      ".Services",
      "$svc.Enabled",
      "$svc.Name",
      "$svc.Image",
      "$tag",
      "$svc.Config",
      ".TLS",
      ".Protocol",
      ".Port",
      "$svc.Name",
      ".Protocol",
      ".Port",
      ".Port",
      "$svc.Name",
    ]);
    expect(painted.func).toEqual(["or", "len", "printf", "and", "eq", "eq"]);

    // Each control-flow action carries its nesting level's band.
    expect(painted.atLevel(1)).toContain("{{- range $i, $svc := .Services}}");
    expect(painted.atLevel(2)).toContain("{{- if $svc.Enabled}}");
    expect(painted.atLevel(3)).toContain("{{- with $svc.Config}}");
    expect(painted.atLevel(4)).toContain(
      '{{- if and .TLS (eq .Protocol "https")}}',
    );
  });

  it("moves to the dark palette when the theme is dark", () => {
    useColorTheme("Dark");
    const editor = decorate(readScreenshotTemplate());

    expect(editor.textPaintedWith(darkPalette.colors.varUse)).toContain("$tag");
    expect(editor.textPaintedWith(lightPalette.colors.varUse)).toEqual([]);
  });

  it("logs the colours the editor actually received", () => {
    const lines: string[] = [];
    const editor = editorFor(
      readScreenshotTemplate(),
      "colorful-tmpl",
      "screenshot.tmpl",
    );
    showEditors(editor);
    new NestingDecorator((line) => lines.push(line)).activate();

    const painted = editor.textPaintedWith(lightPalette.colors.varDef);
    expect(painted).toContain("$tag");

    const [line = ""] = lines;
    expect(line).toContain("screenshot.tmpl (colorful-tmpl)");
    expect(line).toContain("2 definitions");
    expect(line).toContain("variableSpotting=on");
    // The colours named in the log are the ones the editor was given, so a
    // silent "decoration type with nothing to paint" shows up as such.
    expect(line).toContain(`def ${lightPalette.colors.varDef}`);
    expect(line).toContain(`use ${lightPalette.colors.varUse}`);
    expect(line).toContain(`func ${lightPalette.colors.func}`);
    expect(editor.paintedColors()).toContain(lightPalette.colors.varDef);
  });

  it("takes nesting levels from a custom palette", () => {
    const custom = ["rgba(1,2,3,0.5)", "rgba(4,5,6,0.5)"];
    setSetting("colorful-tmpl.palette.preset", "custom");
    setSetting("colorful-tmpl.palette.custom", custom);

    const editor = decorate("{{ if .X }}inner{{ end }}");

    expect(editor.textPaintedWith(custom[1])).toContain("{{ if .X }}");
    expect(editor.textPaintedWith(lightPalette.levels[1])).toEqual([]);
  });

  it("turns off bands, variables and functions with the master switch", () => {
    setSetting("colorful-tmpl.palette.enabled", false);
    const editor = decorate(
      "{{ if .X }}{{ $x := .Name }}{{ printf \"%s\" $x }}{{ end }}",
    );

    const painted = paintedWith(editor, lightPalette);
    expect(painted.varDef).toEqual([]);
    expect(painted.varUse).toEqual([]);
    expect(painted.func).toEqual([]);
    expect(painted.atLevel(1)).toEqual([]);
  });

  it("leaves variable spotting off when it is disabled, keeping nesting bands", () => {
    setSetting("colorful-tmpl.palette.variableHighlight", false);
    const editor = decorate("{{ if .X }}{{ $x := .Name }}{{ end }}");

    const painted = paintedWith(editor, lightPalette);
    expect(painted.varDef).toEqual([]);
    expect(painted.varUse).toEqual([]);
    expect(painted.atLevel(1)).toContain("{{ if .X }}");
  });

  it("leaves function highlighting off when it is disabled, keeping the rest", () => {
    setSetting("colorful-tmpl.palette.functionHighlight", false);
    const editor = decorate('{{ if .X }}{{ printf "%s" .Name }}{{ end }}');

    const painted = paintedWith(editor, lightPalette);
    expect(painted.func).toEqual([]);
    expect(painted.varUse).toContain(".Name");
    expect(painted.atLevel(1)).toContain("{{ if .X }}");
  });

  it("ignores documents without template actions", () => {
    const editor = decorate("plain python\nprint(1)", "python");

    expect(editor.paintedColors().length).toBeGreaterThan(0);
    expect(paintedWith(editor, lightPalette).varUse).toEqual([]);
  });
});
