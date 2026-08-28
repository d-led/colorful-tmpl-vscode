import * as vscode from "vscode";
import { NestingDecorator } from "./nesting-decorator.js";
import { ColorfulTmplSemanticTokensProvider } from "./semantic-provider.js";

const PALETTE_CFG = "colorful-tmpl.palette";

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
  const cfg = vscode.workspace.getConfiguration(PALETTE_CFG);
  const current = cfg.get<string>("preset", "default");
  const pick = await vscode.window.showQuickPick(PALETTE_CHOICES, {
    placeHolder: "Select a palette",
  });
  if (!pick || pick.value === current) return;
  await cfg.update("preset", pick.value, paletteUpdateTarget(cfg));
}

export function activate(context: vscode.ExtensionContext): void {
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
  );

  nestingDecorator = new NestingDecorator();
  nestingDecorator.activate();
  context.subscriptions.push(nestingDecorator);

  console.log("[colorful-tmpl] extension activated");
}

export function deactivate(): void {
  nestingDecorator?.dispose();
  nestingDecorator = undefined;
}
