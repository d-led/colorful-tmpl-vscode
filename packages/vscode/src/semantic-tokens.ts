import { TokenType, type Token } from "@colorful-tmpl/highlight-core";

/**
 * Semantic token type + modifiers for a lexer token, or `null` when the token
 * should not receive semantic styling.
 */
export type SemanticClass = {
  type: string;
  modifiers: string[];
} | null;

/**
 * Maps a lexer token to a semantic token type and modifiers.
 *
 * Field access (`.Name`) and the bare dot (`.`) are classified as variables so
 * they share the same highlight as `$name` uses, matching the background
 * spotting in the decorator and core renderer.
 */
export function classifyToken(tok: Token): SemanticClass {
  switch (tok.type) {
    case TokenType.Keyword:
      return { type: "keyword", modifiers: [] };
    case TokenType.VariableDef:
      return {
        type: "colorfulTmplVariable",
        modifiers: ["colorfulTmplDefinition"],
      };
    case TokenType.VariableAssign:
      return {
        type: "colorfulTmplVariable",
        modifiers: ["colorfulTmplAssignment"],
      };
    case TokenType.VariableUse:
    case TokenType.Field:
    case TokenType.Dot:
      return { type: "colorfulTmplVariable", modifiers: ["readonly"] };
    default:
      return null;
  }
}
