import * as assert from "node:assert";
import * as vscode from "vscode";

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

/** Closes every open editor so tests start from a clean slate. */
export async function closeAllEditors(): Promise<void> {
  await vscode.commands.executeCommand("workbench.action.closeAllEditors");
}

/** Waits for the decorator's 150 ms debounce plus a margin. */
export function waitForDecorator(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 300));
}
