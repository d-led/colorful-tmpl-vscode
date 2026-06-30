import { tokenize, TokenType } from "@colorful-tmpl/highlight-core";
import * as vscode from "vscode";

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
  ): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(this.legend);
    const source = document.getText();
    const tokens = tokenize(source);

    for (const token of tokens) {
      const startPos = document.positionAt(token.start);
      const endPos = document.positionAt(token.end);

      switch (token.type) {
        case TokenType.Keyword:
          builder.push(new vscode.Range(startPos, endPos), "keyword");
          break;
        case TokenType.VariableDef:
          builder.push(new vscode.Range(startPos, endPos), "colorfulTmplVariable", ["colorfulTmplDefinition"]);
          break;
        case TokenType.VariableAssign:
          builder.push(new vscode.Range(startPos, endPos), "colorfulTmplVariable", ["colorfulTmplAssignment"]);
          break;
        case TokenType.VariableUse:
          builder.push(new vscode.Range(startPos, endPos), "colorfulTmplVariable", ["readonly"]);
          break;
      }
    }

    return builder.build();
  }
}
