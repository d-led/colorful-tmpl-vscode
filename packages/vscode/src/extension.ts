import * as vscode from "vscode";
import { NestingDecorator } from "./nesting-decorator.js";
import { ColorfulTmplSemanticTokensProvider } from "./semantic-provider.js";

let nestingDecorator: NestingDecorator | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const semanticProvider = new ColorfulTmplSemanticTokensProvider();
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: "colorful-tmpl" },
      semanticProvider,
      semanticProvider.getLegend(),
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
