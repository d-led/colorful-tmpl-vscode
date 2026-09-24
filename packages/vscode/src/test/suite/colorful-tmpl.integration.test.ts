import * as assert from "node:assert";
import * as vscode from "vscode";

import {
  closeAllEditors,
  EXTENSION_ID,
  openFixtureFile,
  openRepositoryFile,
  semanticTokensFor,
  waitForDecorator,
} from "./colorful-tmpl-test-support.js";

/** Variables and fields the README screenshot template is expected to spot. */
const SCREENSHOT_VARIABLES = [
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
];

describe("Colorful tmpl extension", () => {
  before(async () => {
    const extension = vscode.extensions.getExtension(EXTENSION_ID);
    assert.ok(extension, `expected extension ${EXTENSION_ID} to be installed`);
    await extension.activate();
  });

  beforeEach(async () => {
    await closeAllEditors();
  });

  it("registers the colorful-tmpl language", async () => {
    const languages = await vscode.languages.getLanguages();
    assert.ok(languages.includes("colorful-tmpl"));
  });

  it("treats .gotmpl files as colorful-tmpl", async () => {
    const editor = await openFixtureFile("src/sample.gotmpl");
    assert.strictEqual(editor.document.languageId, "colorful-tmpl");
  });

  it("keeps .py.tmpl files in python so the injection grammar layers on top", async () => {
    const editor = await openFixtureFile("src/sample.py.tmpl");
    assert.strictEqual(editor.document.languageId, "python");
  });

  it("keeps .java.tmpl files in java so the injection grammar layers on top", async () => {
    const editor = await openFixtureFile("src/sample.java.tmpl");
    assert.strictEqual(editor.document.languageId, "java");
  });

  it("keeps .go files in go and re-decorates them without throwing", async () => {
    const editor = await openFixtureFile("src/sample.go");
    assert.strictEqual(editor.document.languageId, "go");
    await editor.edit((edit) =>
      edit.insert(new vscode.Position(0, 0), "// edit\n"),
    );
    await waitForDecorator();
    assert.ok(editor.document.getText().startsWith("// edit"));
  });

  it("keeps .java files in java with verbatim template strings without throwing", async () => {
    const editor = await openFixtureFile("src/sample.java");
    assert.strictEqual(editor.document.languageId, "java");
    await editor.edit((edit) =>
      edit.insert(new vscode.Position(0, 0), "// edit\n"),
    );
    await waitForDecorator();
    assert.ok(editor.document.getText().startsWith("// edit"));
  });

  it("ships palette settings with sensible defaults", () => {
    const cfg = vscode.workspace.getConfiguration("colorful-tmpl.palette");
    assert.strictEqual(cfg.get("enabled"), true);
    assert.strictEqual(cfg.get("variableHighlight"), true);
    assert.strictEqual(cfg.get("preset"), "default");
    const custom = cfg.get<string[]>("custom");
    assert.ok(Array.isArray(custom));
    assert.strictEqual(custom.length, 6);
  });

  it("re-decorates a template after an edit without throwing", async () => {
    const editor = await openFixtureFile("src/sample.gotmpl");
    await editor.edit((edit) =>
      edit.insert(new vscode.Position(0, 0), "{{ .Extra }}\n"),
    );
    await waitForDecorator();
    assert.ok(editor.document.getText().startsWith("{{ .Extra }}"));
  });

  it("opens the README screenshot template as a colorful-tmpl document", async () => {
    const editor = await openRepositoryFile("screenshot.tmpl");

    assert.strictEqual(editor.document.languageId, "colorful-tmpl");
  });

  it("spots every variable of the README screenshot template", async () => {
    const editor = await openRepositoryFile("screenshot.tmpl");
    const { legend, tokens } = await semanticTokensFor(editor.document);

    assert.deepStrictEqual(
      legend.tokenTypes,
      ["keyword", "variable", "colorfulTmplVariable"],
      "the legend VS Code registers must match package.json",
    );

    const variables = tokens.filter((t) => t.type === "colorfulTmplVariable");
    assert.deepStrictEqual(
      variables
        .filter((t) => t.modifiers.includes("colorfulTmplDefinition"))
        .map((t) => t.text),
      ["$tag", "$svc"],
      "expected exactly the two variable definitions",
    );
    assert.deepStrictEqual(
      variables
        .filter((t) => t.modifiers.includes("readonly"))
        .map((t) => t.text),
      SCREENSHOT_VARIABLES,
      "expected every variable use and field access to be highlighted",
    );
    assert.deepStrictEqual(
      [...new Set(variables.map((t) => t.modifiers.join(".")))].sort(),
      ["colorfulTmplDefinition", "readonly"],
      "expected only definitions and reads in this template",
    );
  });

  // The band and variable backgrounds are decorations, which no VS Code API can
  // read back. This asserts the extension's own answer, computed in the running
  // editor from the settings VS Code actually resolves: a window that installed
  // the build but never reloaded, or a switch turned off, fails here.
  it("reports that it paints the README template's variables and bands", async () => {
    const editor = await openRepositoryFile("screenshot.tmpl");
    assert.strictEqual(editor.document.languageId, "colorful-tmpl");

    const report = await vscode.commands.executeCommand<string>(
      "colorful-tmpl.diagnose",
    );

    assert.ok(report, "the diagnose command must answer with a report");
    assert.match(report, /Colorful tmpl v\d+\.\d+\.\d+/);
    assert.match(report, /variableSpotting=on/);
    assert.match(report, /backgrounds=on/);
    assert.match(report, /screenshot\.tmpl \(colorful-tmpl\): 2 definitions/);
    assert.match(report, /19 uses/);
    assert.match(report, /6 functions/);
    assert.ok(
      Number(/ (\d+) bands/.exec(report)?.[1]) > 0,
      `expected nesting bands to be painted, got: ${report}`,
    );
  });
});
