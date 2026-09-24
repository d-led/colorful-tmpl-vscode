import { basename } from "node:path";

import * as vscode from "vscode";

import { activationLogLine, highlightReport } from "./highlight-log.js";
import { configuredPalette, NestingDecorator } from "./nesting-decorator.js";
import {
  HIGHLIGHT_SECTION,
  PALETTE_SECTION,
  readHighlightSwitches,
} from "./palette.js";
import { ColorfulTmplSemanticTokensProvider } from "./semantic-provider.js";
import {
  countDecorations,
  decorationsForDocument,
} from "./template-decorations.js";

type PaletteChoice = vscode.QuickPickItem & { value: string };

const PALETTE_CHOICES: PaletteChoice[] = [
  {
    label: "Default",
    description: "Theme-aware pastel palette",
    value: "default",
  },
  {
    label: "High Contrast",
    description: "Bold, more opaque palette for low-vision or busy screens",
    value: "highContrast",
  },
  {
    label: "Custom",
    description: "Colors from the custom setting",
    value: "custom",
  },
];

let nestingDecorator: NestingDecorator | undefined;
let log: vscode.OutputChannel | undefined;

function extensionVersion(context: vscode.ExtensionContext): string {
  return String(context.extension.packageJSON.version ?? "unknown");
}

/**
 * What the extension would paint for this editor, and the settings it resolved.
 * Highlighting that "does not show up" can be a stale install, a switch turned
 * off, or a file the decorator finds nothing in; this tells the three apart.
 */
function highlightReportForEditor(
  editor: vscode.TextEditor,
  version: string,
): string {
  const cfg = vscode.workspace.getConfiguration(PALETTE_SECTION);
  const palette = configuredPalette(cfg);
  const decorations = decorationsForDocument(
    editor.document.languageId,
    editor.document.getText(),
    palette.levels.length,
  );
  const switches = readHighlightSwitches(
    vscode.workspace.getConfiguration(HIGHLIGHT_SECTION),
    cfg,
  );
  return highlightReport({
    version,
    preset: cfg.get<string>("preset", "default"),
    ...switches,
    fileName: basename(editor.document.uri.path),
    languageId: editor.document.languageId,
    colors: {
      definitions: palette.colors.varDef,
      uses: palette.colors.varUse,
      functions: palette.colors.func,
    },
    ...countDecorations(decorations),
  });
}

/**
 * Reports the live build and what it finds in the active file; returns the
 * report so the integration tests can read the answer from a real editor.
 */
async function diagnoseHighlighting(
  context: vscode.ExtensionContext,
): Promise<string | undefined> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !log) {
    void vscode.window.showWarningMessage(
      "Colorful tmpl: open a template file first.",
    );
    return undefined;
  }

  const report = highlightReportForEditor(editor, extensionVersion(context));
  log.appendLine("");
  log.appendLine(report);
  log.show(true);
  void vscode.window.showInformationMessage(
    `${report.split("\n")[0]} — see the "Colorful tmpl" output channel for details.`,
  );
  return report;
}

// Updates a window-scoped setting where it is currently defined: a workspace
// override is preserved in workspace settings; otherwise the value lands in
// user settings so a personal visual preference never pollutes shared config.
function paletteUpdateTarget(
  cfg: vscode.WorkspaceConfiguration,
): vscode.ConfigurationTarget {
  const inspected = cfg.inspect<string>("preset");
  if (inspected?.workspaceValue !== undefined) {
    return vscode.ConfigurationTarget.Workspace;
  }
  return vscode.ConfigurationTarget.Global;
}

async function switchPalette(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(PALETTE_SECTION);
  const current = cfg.get<string>("preset", "default");
  const pick = await vscode.window.showQuickPick(PALETTE_CHOICES, {
    placeHolder: "Select a palette",
  });
  if (!pick || pick.value === current) return;
  await cfg.update("preset", pick.value, paletteUpdateTarget(cfg));
}

export function activate(context: vscode.ExtensionContext): void {
  log = vscode.window.createOutputChannel("Colorful tmpl");
  context.subscriptions.push(log);

  const semanticProvider = new ColorfulTmplSemanticTokensProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "colorful-tmpl" },
      semanticProvider,
      semanticProvider.getLegend(),
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "colorful-tmpl.switchPalette",
      switchPalette,
    ),
    vscode.commands.registerCommand("colorful-tmpl.diagnose", () =>
      diagnoseHighlighting(context),
    ),
  );

  nestingDecorator = new NestingDecorator((line) => log?.appendLine(line));
  nestingDecorator.activate();
  context.subscriptions.push(nestingDecorator);

  const cfg = vscode.workspace.getConfiguration(PALETTE_SECTION);
  const activation = activationLogLine({
    version: extensionVersion(context),
    preset: cfg.get<string>("preset", "default"),
    ...readHighlightSwitches(
      vscode.workspace.getConfiguration(HIGHLIGHT_SECTION),
      cfg,
    ),
  });
  log.appendLine(activation);
  console.log(activation);
}

export function deactivate(): void {
  nestingDecorator?.dispose();
  nestingDecorator = undefined;
}
