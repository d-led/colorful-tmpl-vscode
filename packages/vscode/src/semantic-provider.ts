import { tokenize } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

import { classifyToken } from "./semantic-tokens.js";

export class ColorfulTmplSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  private readonly legend: vscode.SemanticTokensLegend;

  constructor() {
    this.legend = new vscode.SemanticTokensLegend(
      ["keyword", "variable", "colorfulTmplVariable"],
      ["colorfulTmplDefinition", "colorfulTmplAssignment", "readonly"],
    );
  }

  getLegend(): vscode.SemanticTokensLegend {
    return this.legend;
  }

  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.SemanticTokens | null {
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    const source = document.getText();
    if (token.isCancellationRequested) return null;
    const tokens = tokenize(source);

    for (const tok of tokens) {
      if (token.isCancellationRequested) return null;
      const kind = classifyToken(tok);
      if (!kind) continue;
      const startPos = document.positionAt(tok.start);
      const endPos = document.positionAt(tok.end);
      builder.push(
        new vscode.Range(startPos, endPos),
        kind.type,
        kind.modifiers,
      );
    }

    return builder.build();
  }
}
