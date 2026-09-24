import * as assert from "node:assert";
import { join } from "node:path";
import * as vscode from "vscode";

export const EXTENSION_ID = "d-led.colorful-tmpl";

/** Resolves the dogfood fixture workspace folder opened by the test runner. */
export function workspaceRoot(): vscode.Uri {
  const folder = vscode.workspace.workspaceFolders?.[0];
  assert.ok(
    folder,
    "Expected a workspace folder (tests must run with fixtures/dogfood open).",
  );
  return folder.uri;
}

/** Opens a fixture file by its workspace-relative path and shows it in an editor. */
export async function openFixtureFile(
  relativePath: string,
): Promise<vscode.TextEditor> {
  const uri = vscode.Uri.joinPath(workspaceRoot(), relativePath);
  const doc = await vscode.workspace.openTextDocument(uri);
  return vscode.window.showTextDocument(doc);
}

/**
 * Opens a repository file that lives outside the fixture workspace, e.g. the
 * `screenshot.tmpl` the README advertises.
 */
export async function openRepositoryFile(
  relativePath: string,
): Promise<vscode.TextEditor> {
  const extension = vscode.extensions.getExtension(EXTENSION_ID);
  assert.ok(extension, `expected extension ${EXTENSION_ID}`);
  // The package folder is <repo>/packages/vscode.
  const uri = vscode.Uri.file(
    join(extension.extensionPath, "..", "..", relativePath),
  );
  const doc = await vscode.workspace.openTextDocument(uri);
  return vscode.window.showTextDocument(doc);
}

/** Closes every open editor so tests start from a clean slate. */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

/** Waits for the decorator's 150 ms debounce plus a margin. */
export function waitForDecorator(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300));
}

export type SemanticTokenSpan = {
  text: string;
  type: string;
  modifiers: string[];
};

/** Asks the editor for the semantic tokens of a document. */
export async function semanticTokensFor(
  document: vscode.TextDocument,
): Promise<{
  legend: vscode.SemanticTokensLegend;
  tokens: SemanticTokenSpan[];
}> {
  const legend =
    await vscode.commands.executeCommand<vscode.SemanticTokensLegend>(
      "vscode.provideDocumentSemanticTokensLegend",
      document.uri,
    );
  assert.ok(
    legend,
    "expected the extension to provide a semantic tokens legend",
  );

  const result = await vscode.commands.executeCommand<vscode.SemanticTokens>(
    "vscode.provideDocumentSemanticTokens",
    document.uri,
  );
  assert.ok(result, "expected semantic tokens for a colorful-tmpl document");

  return { legend, tokens: decodeSemanticTokens(result, legend, document) };
}

/** Decodes the delta-encoded `SemanticTokens.data` into readable spans. */
function decodeSemanticTokens(
  result: vscode.SemanticTokens,
  legend: vscode.SemanticTokensLegend,
  document: vscode.TextDocument,
): SemanticTokenSpan[] {
  const spans: SemanticTokenSpan[] = [];
  let line = 0;
  let character = 0;
  for (let i = 0; i < result.data.length; i += 5) {
    const deltaLine = result.data[i];
    const deltaStart = result.data[i + 1];
    const length = result.data[i + 2];
    const type = legend.tokenTypes[result.data[i + 3]];
    const modifierMask = result.data[i + 4];
    line += deltaLine;
    character = deltaLine === 0 ? character + deltaStart : deltaStart;
    const start = document.offsetAt(new vscode.Position(line, character));
    spans.push({
      text: document.getText().slice(start, start + length),
      type,
      modifiers: legend.tokenModifiers.filter(
        (_, bit) => modifierMask & (1 << bit),
      ),
    });
  }
  return spans;
}
