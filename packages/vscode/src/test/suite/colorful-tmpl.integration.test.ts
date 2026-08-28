import * as assert from "node:assert";
import * as vscode from "vscode";

import {
  closeAllEditors,
  openFixtureFile,
  waitForDecorator,
} from "./colorful-tmpl-test-support.js";

const EXTENSION_ID = "d-led.colorful-tmpl";

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
});
